const { spawn } = require('child_process');

console.log('=== TESTING CIRCUIT_VERIFY_TRUTH_TABLE TOOL VIA WEBMCP ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9282',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9282/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9282');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onopen = async () => {
    try {
      console.log('[Test] Waiting for Unity WebGL to initialize (6s)...');
      await new Promise(r => setTimeout(r, 6000));

      async function evalWebMCP(toolName, params = {}) {
        const expr = `
          (async () => {
            if (!document.modelContext) return { ok: false, error: "NO_WEBMCP" };
            const tools = await document.modelContext.getTools();
            const targetTool = tools.find(t => t.name === "${toolName}");
            if (!targetTool) return { ok: false, error: "TOOL_NOT_FOUND: ${toolName}" };
            const raw = await document.modelContext.executeTool(targetTool, JSON.stringify(${JSON.stringify(params)}));
            return typeof raw === "string" ? JSON.parse(raw) : raw;
          })()
        `;
        const evalRes = await send('Runtime.evaluate', {
          expression: expr,
          awaitPromise: true,
          returnByValue: true
        });
        return evalRes.result.value;
      }

      // 1. Tool discovery
      console.log('--- Step 1: Tool Discovery ---');
      const toolListRes = await send('Runtime.evaluate', {
        expression: `(async () => { const t = await document.modelContext.getTools(); return t.map(x => x.name); })()`,
        awaitPromise: true,
        returnByValue: true
      });
      const registeredTools = toolListRes.result.value || [];
      console.log(`Discovered ${registeredTools.length} WebMCP tools.`);
      if (!registeredTools.includes('circuit_verify_truth_table')) {
        throw new Error('circuit_verify_truth_table is not registered in WebMCP!');
      }
      console.log('✓ PASS: circuit_verify_truth_table is registered and discoverable.');

      // 2. Build test circuit: AND gate
      console.log('\n--- Step 2: Build AND Gate Circuit ---');
      const inA = await evalWebMCP('circuit_add_component', { type: 'IN-1', label: 'In_A', x: -4, y: 1 });
      const inB = await evalWebMCP('circuit_add_component', { type: 'IN-1', label: 'In_B', x: -4, y: -1 });
      const andGate = await evalWebMCP('circuit_add_component', { type: 'AND', label: 'AndGate', x: 0, y: 0 });
      const led = await evalWebMCP('circuit_add_component', { type: 'LED', label: 'LED_Out', x: 4, y: 0 });

      console.log('inA:', JSON.stringify(inA.data));
      console.log('andGate:', JSON.stringify(andGate.data));
      console.log('led:', JSON.stringify(led.data));

      await evalWebMCP('circuit_connect', { source_pin: `${inA.data.component_id}:0`, target_pin: `${andGate.data.component_id}:1` });
      await evalWebMCP('circuit_connect', { source_pin: `${inB.data.component_id}:0`, target_pin: `${andGate.data.component_id}:0` });
      await evalWebMCP('circuit_connect', { source_pin: `${andGate.data.component_id}:2`, target_pin: `${led.data.component_id}:0` });
      console.log('✓ Built AND circuit with 2 inputs, 1 AND gate, 1 LED.');

      // 3. Verify Truth Table (Valid Pass Case)
      console.log('\n--- Step 3: Run Full Truth Table Verification (Expected: ALL PASS) ---');
      const verifyPassRes = await evalWebMCP('circuit_verify_truth_table', {
        ticks_per_row: 5,
        rows: [
          { inputs: [0, 0], expected: [0] },
          { inputs: [0, 1], expected: [0] },
          { inputs: [1, 0], expected: [0] },
          { inputs: [1, 1], expected: [1] }
        ]
      });

      console.log('Verification Result Data:', JSON.stringify(verifyPassRes, null, 2));
      console.log(`All Passed: ${verifyPassRes.data.all_passed} (${verifyPassRes.data.passed_rows}/${verifyPassRes.data.total_rows} rows passed)`);
      if (!verifyPassRes.ok || !verifyPassRes.data.all_passed || verifyPassRes.data.passed_rows !== 4) {
        throw new Error('Truth table should have passed 100%!');
      }
      console.log('✓ PASS: All 4 truth table vectors matched perfectly!');

      // 4. Verify Truth Table (Intentional Mismatch Diagnostic Case)
      console.log('\n--- Step 4: Run Truth Table with Intentional Mismatches (Expected: FAIL with Diagnosis) ---');
      const verifyFailRes = await evalWebMCP('circuit_verify_truth_table', {
        rows: [
          { inputs: [0, 0], expected: [0] },
          { inputs: [0, 1], expected: [1] }, // Mismatch for AND gate
          { inputs: [1, 0], expected: [1] }, // Mismatch for AND gate
          { inputs: [1, 1], expected: [1] }
        ]
      });

      console.log('Mismatch Result Summary:', verifyFailRes.summary);
      console.log(`All Passed: ${verifyFailRes.data.all_passed}`);
      console.log(`Failed Rows: ${verifyFailRes.data.failed_rows}`);
      console.log('First Mismatch Diagnostic:', JSON.stringify(verifyFailRes.data.first_mismatch));

      if (verifyFailRes.data.all_passed !== false || verifyFailRes.data.failed_rows !== 2) {
        throw new Error('Expected 2 failed rows for mismatch test');
      }
      if (verifyFailRes.data.first_mismatch?.row !== 1) {
        throw new Error('Expected first mismatch at row 1');
      }
      console.log('✓ PASS: Mismatch detected correctly with precise row-by-row diagnosis!');

      console.log('\n=============================================================');
      console.log('🎉 CIRCUIT_VERIFY_TRUTH_TABLE TOOL 100% VERIFIED VIA WEBMCP!');
      console.log('=============================================================');

      ws.close();
      chromeProc.kill();
      process.exit(0);
    } catch (err) {
      console.error('\n❌ TEST FAILED:', err);
      ws.close();
      chromeProc.kill();
      process.exit(1);
    }
  };
}

run().catch(e => {
  console.error('Fatal runner error:', e);
  chromeProc.kill();
  process.exit(1);
});
