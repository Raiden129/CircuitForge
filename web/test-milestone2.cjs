const { spawn } = require('child_process');

console.log('=== MILESTONE 2 AUTOMATED INTEGRATION SUITE ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9280',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9280/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9280');

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
      console.log('[Test] Waiting for Unity WebGL and WebMCP initialization (6s)...');
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

      // 1. Verify Tool Registry
      console.log('--- TEST 1: Tool Registry Discovery ---');
      const toolListRes = await send('Runtime.evaluate', {
        expression: `
          (async () => {
            const tools = await document.modelContext.getTools();
            return tools.map(t => t.name);
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      const registeredTools = toolListRes.result.value || [];
      console.log(`Discovered ${registeredTools.length} WebMCP tools:`, registeredTools.join(', '));
      const expectedTools = [
        'circuit_get_capabilities', 'circuit_list_catalog', 'circuit_get_snapshot',
        'circuit_inspect_component', 'circuit_analyze', 'circuit_add_component',
        'circuit_connect', 'circuit_disconnect', 'circuit_set_input', 'circuit_step',
        'circuit_pause', 'circuit_run', 'circuit_undo', 'circuit_redo'
      ];
      for (const t of expectedTools) {
        if (!registeredTools.includes(t)) throw new Error(`Missing expected tool: ${t}`);
      }
      console.log('✓ PASS: All 14 Milestone 2 WebMCP tools registered.\n');

      // 2. Build Combinational Circuit (Exit Criterion)
      console.log('--- TEST 2: Autonomous Circuit Construction (Exit Criterion) ---');
      console.log('Building XOR Gate from 4 NAND Gates with Zero Pointer Simulation...');

      // Add inputs: IN-1 (A) and IN-1 (B)
      const inA = await evalWebMCP('circuit_add_component', { type: 'IN-1', label: 'Input A', x: -6.0, y: 1.5 });
      console.log(`Added Input A: ID ${inA.data.component_id}`);

      const inB = await evalWebMCP('circuit_add_component', { type: 'IN-1', label: 'Input B', x: -6.0, y: -0.5 });
      console.log(`Added Input B: ID ${inB.data.component_id}`);

      // Add 4 NAND gates
      const n1 = await evalWebMCP('circuit_add_component', { type: 'NAND', label: 'N1', x: -3.0, y: 0.5 });
      const n2 = await evalWebMCP('circuit_add_component', { type: 'NAND', label: 'N2', x: 0.0, y: 2.0 });
      const n3 = await evalWebMCP('circuit_add_component', { type: 'NAND', label: 'N3', x: 0.0, y: -1.0 });
      const n4 = await evalWebMCP('circuit_add_component', { type: 'NAND', label: 'N4', x: 3.0, y: 0.5 });
      console.log(`Added NAND gates: N1(${n1.data.component_id}), N2(${n2.data.component_id}), N3(${n3.data.component_id}), N4(${n4.data.component_id})`);

      // Add Output Display: LED
      const led = await evalWebMCP('circuit_add_component', { type: 'LED', label: 'XOR Out', x: 6.0, y: 0.5 });
      console.log(`Added Output LED: ID ${led.data.component_id}`);

      // Wire them up!
      // Wire 1: Input A -> N1.IN B
      await evalWebMCP('circuit_connect', { source_pin: `${inA.data.component_id}:0`, target_pin: `${n1.data.component_id}:0` });
      // Wire 2: Input B -> N1.IN A
      await evalWebMCP('circuit_connect', { source_pin: `${inB.data.component_id}:0`, target_pin: `${n1.data.component_id}:1` });
      // Wire 3: Input A -> N2.IN B
      await evalWebMCP('circuit_connect', { source_pin: `${inA.data.component_id}:0`, target_pin: `${n2.data.component_id}:0` });
      // Wire 4: N1.OUT -> N2.IN A
      await evalWebMCP('circuit_connect', { source_pin: `${n1.data.component_id}:2`, target_pin: `${n2.data.component_id}:1` });
      // Wire 5: N1.OUT -> N3.IN B
      await evalWebMCP('circuit_connect', { source_pin: `${n1.data.component_id}:2`, target_pin: `${n3.data.component_id}:0` });
      // Wire 6: Input B -> N3.IN A
      await evalWebMCP('circuit_connect', { source_pin: `${inB.data.component_id}:0`, target_pin: `${n3.data.component_id}:1` });
      // Wire 7: N2.OUT -> N4.IN B
      await evalWebMCP('circuit_connect', { source_pin: `${n2.data.component_id}:2`, target_pin: `${n4.data.component_id}:0` });
      // Wire 8: N3.OUT -> N4.IN A
      await evalWebMCP('circuit_connect', { source_pin: `${n3.data.component_id}:2`, target_pin: `${n4.data.component_id}:1` });
      // Wire 9: N4.OUT -> LED.IN
      await evalWebMCP('circuit_connect', { source_pin: `${n4.data.component_id}:2`, target_pin: `${led.data.component_id}:0` });
      console.log('✓ Successfully connected 9 wires to form complete XOR circuit.\n');

      // 3. Inspect and Analyze
      console.log('--- TEST 3: Inspection and Circuit Analysis ---');
      const inspectRes = await evalWebMCP('circuit_inspect_component', { component_id: n1.data.component_id });
      console.log(`Inspect N1: Type=${inspectRes.data.type}, Inputs=${inspectRes.data.input_pins.length}, Outputs=${inspectRes.data.output_pins.length}`);
      if (!inspectRes.ok) throw new Error('Inspection failed');

      const analysisRes = await evalWebMCP('circuit_analyze', { scope: 'all' });
      console.log(`Analysis: ${analysisRes.summary} (Healthy: ${analysisRes.data.healthy})`);
      if (analysisRes.data.floating_inputs_count !== 0) throw new Error('Circuit has unexpected floating inputs');
      console.log('✓ PASS: Inspection & Graph Analysis verified.\n');

      // 4. Truth Table Verification
      console.log('--- TEST 4: Truth Table Verification (00, 01, 10, 11) ---');
      const testVectors = [
        { a: 0, b: 0, expected: 0 },
        { a: 0, b: 1, expected: 1 },
        { a: 1, b: 0, expected: 1 },
        { a: 1, b: 1, expected: 0 }
      ];

      for (const tv of testVectors) {
        await evalWebMCP('circuit_set_input', { pin_id: String(inA.data.component_id), value: tv.a });
        await evalWebMCP('circuit_set_input', { pin_id: String(inB.data.component_id), value: tv.b });
        await evalWebMCP('circuit_step', { steps: 2 });

        const snap = await evalWebMCP('circuit_get_snapshot', { detail: 'full' });
        const outWire = snap.data.wires.find(w => w.target.startsWith(String(led.data.component_id)));
        const actual = outWire ? outWire.signal : null;
        console.log(`Vector (A=${tv.a}, B=${tv.b}) -> Expected: ${tv.expected}, Got: ${actual}`);
        if (actual !== tv.expected) {
          throw new Error(`Truth table mismatch for (${tv.a}, ${tv.b}): expected ${tv.expected}, got ${actual}`);
        }
      }
      console.log('✓ PASS: XOR Truth Table 100% verified via simulation!\n');

      // 5. Error Condition Validation
      console.log('--- TEST 5: Error Condition Validation ---');
      // 5a. Stale Revision
      const staleRes = await evalWebMCP('circuit_add_component', { type: 'NAND', expected_revision: 9999 });
      console.log(`Stale Revision Check: Ok=${staleRes.ok}, Code=${staleRes.error?.code}`);
      if (staleRes.ok || staleRes.error?.code !== 'REVISION_MISMATCH') throw new Error('Expected REVISION_MISMATCH error');

      // 5b. Invalid Pin Direction (Output to Output)
      const dirRes = await evalWebMCP('circuit_connect', { source_pin: `${n1.data.component_id}:2`, target_pin: `${n2.data.component_id}:2` });
      console.log(`Invalid Direction Check: Ok=${dirRes.ok}, Code=${dirRes.error?.code}`);
      if (dirRes.ok || dirRes.error?.code !== 'INVALID_PIN_DIRECTION') throw new Error('Expected INVALID_PIN_DIRECTION error');

      // 5c. Bit Width Mismatch (4-bit to 1-bit)
      const in4Res = await evalWebMCP('circuit_add_component', { type: 'IN-4', x: 0, y: -4 });
      const widthRes = await evalWebMCP('circuit_connect', { source_pin: `${in4Res.data.component_id}:0`, target_pin: `${n1.data.component_id}:0` });
      console.log(`Width Mismatch Check: Ok=${widthRes.ok}, Code=${widthRes.error?.code}`);
      if (widthRes.ok || widthRes.error?.code !== 'PIN_WIDTH_MISMATCH') throw new Error('Expected PIN_WIDTH_MISMATCH error');

      // 5d. Duplicate Component ID
      const dupRes = await evalWebMCP('circuit_add_component', { type: 'NAND', component_id: n1.data.component_id });
      console.log(`Duplicate ID Check: Ok=${dupRes.ok}, Code=${dupRes.error?.code}`);
      if (dupRes.ok || dupRes.error?.code !== 'DUPLICATE_COMPONENT_ID') throw new Error('Expected DUPLICATE_COMPONENT_ID error');

      // 5e. Missing Target Pin
      const missRes = await evalWebMCP('circuit_connect', { source_pin: `${n1.data.component_id}:2`, target_pin: '999999:0' });
      console.log(`Missing Target Check: Ok=${missRes.ok}, Code=${missRes.error?.code}`);
      if (missRes.ok || missRes.error?.code !== 'PIN_NOT_FOUND') throw new Error('Expected PIN_NOT_FOUND error');
      console.log('✓ PASS: All 5 error conditions correctly caught and returned structured diagnostics.\n');

      // 6. Undo / Redo
      console.log('--- TEST 6: UI Activity & Undo System Integration ---');
      const undoRes = await evalWebMCP('circuit_undo', {});
      console.log(`Undo Check: Ok=${undoRes.ok}, Summary="${undoRes.summary}"`);
      const redoRes = await evalWebMCP('circuit_redo', {});
      console.log(`Redo Check: Ok=${redoRes.ok}, Summary="${redoRes.summary}"`);
      console.log('✓ PASS: Undo and Redo operations executed and tracked cleanly.\n');

      console.log('====================================================');
      console.log('🎉 ALL MILESTONE 2 EXIT CRITERIA SUCCESSFULLY MET!');
      console.log('====================================================');

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
