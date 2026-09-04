const { spawn } = require('child_process');

console.log('=== TESTING CIRCUIT_PACKAGE_CHIP TOOL VIA WEBMCP ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9284',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9284/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9284');

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

      async function callTool(toolName, params = {}) {
        const res = await send('Runtime.evaluate', {
          expression: `(async () => {
            const tools = await document.modelContext.getTools();
            const tool = tools.find(t => t.name === ${JSON.stringify(toolName)});
            if (!tool) throw new Error("Tool not found: " + ${JSON.stringify(toolName)});
            const r = await document.modelContext.executeTool(tool, JSON.stringify(${JSON.stringify(params)}));
            return typeof r === "string" ? JSON.parse(r) : r;
          })()`,
          awaitPromise: true,
          returnByValue: true
        });
        return res.result.value;
      }

      // Step 1: Tool Discovery
      console.log('--- Step 1: Tool Discovery ---');
      const toolsRes = await send('Runtime.evaluate', {
        expression: `(async () => (await document.modelContext.getTools()).map(t => t.name))()`,
        awaitPromise: true,
        returnByValue: true
      });
      const toolNames = toolsRes.result.value;
      console.log(`Discovered ${toolNames.length} WebMCP tools.`);
      if (!toolNames.includes('circuit_package_chip')) {
        throw new Error('circuit_package_chip tool is missing from modelContext!');
      }
      console.log('✓ PASS: circuit_package_chip is registered and discoverable.\n');

      // Step 2: Build AND gate circuit from 2 NAND gates
      console.log('--- Step 2: Build Circuit to Package (NAND-based AND) ---');
      const inA = await callTool('circuit_add_component', { type: 'IN-1', label: 'In_A', x: -5, y: 1 });
      const inB = await callTool('circuit_add_component', { type: 'IN-1', label: 'In_B', x: -5, y: -1 });
      const nand1 = await callTool('circuit_add_component', { type: 'NAND', label: 'NAND1', x: -1, y: 0 });
      const nand2 = await callTool('circuit_add_component', { type: 'NAND', label: 'NAND2', x: 2, y: 0 });
      const outPin = await callTool('circuit_add_component', { type: 'OUT-1', label: 'Out_Y', x: 5, y: 0 });

      // Wiring
      await callTool('circuit_connect', { source_pin: `${inA.data.component_id}:0`, target_pin: `${nand1.data.component_id}:1` });
      await callTool('circuit_connect', { source_pin: `${inB.data.component_id}:0`, target_pin: `${nand1.data.component_id}:0` });
      await callTool('circuit_connect', { source_pin: `${nand1.data.component_id}:2`, target_pin: `${nand2.data.component_id}:1` });
      await callTool('circuit_connect', { source_pin: `${nand1.data.component_id}:2`, target_pin: `${nand2.data.component_id}:0` });
      await callTool('circuit_connect', { source_pin: `${nand2.data.component_id}:2`, target_pin: `${outPin.data.component_id}:0` });

      console.log('✓ Built NAND-based AND circuit.\n');

      // Step 3: Package Circuit into Custom Chip
      console.log('--- Step 3: Package Circuit into Custom Chip "MY_NAND_AND" ---');
      const pkgRes = await callTool('circuit_package_chip', {
        name: 'MY_NAND_AND',
        color: '#38bdf8',
        clear_workspace: true
      });

      console.log('Package Result:', JSON.stringify(pkgRes, null, 2));
      if (!pkgRes.ok) throw new Error('Package chip failed: ' + pkgRes.error);
      console.log('✓ PASS: Custom chip "MY_NAND_AND" successfully created and saved!\n');

      // Step 4: Verify Custom Chip appears in Catalog
      console.log('--- Step 4: Verify Catalog Includes New Chip ---');
      const catalogRes = await callTool('circuit_list_catalog', {});
      const customChips = catalogRes.data?.custom_chips || [];
      const foundChip = customChips.find(c => c.name === 'MY_NAND_AND');
      if (!foundChip) {
        throw new Error('Packaged chip "MY_NAND_AND" not found in custom_chips catalog!');
      }
      console.log(`Found in catalog: ${foundChip.name}, Inputs: ${JSON.stringify(foundChip.input_pins)}, Outputs: ${JSON.stringify(foundChip.output_pins)}`);
      console.log('✓ PASS: Custom chip is present in catalog.\n');

      // Step 5: Instantiate and Test Packaged Chip
      console.log('--- Step 5: Place and Test Custom Chip in New Circuit ---');
      const customInst = await callTool('circuit_add_component', {
        type: 'MY_NAND_AND',
        label: 'MyAndGate',
        x: 0,
        y: 0
      });
      console.log('Instantiated Custom Chip:', JSON.stringify(customInst, null, 2));

      const testInA = await callTool('circuit_add_component', { type: 'IN-1', label: 'Test_A', x: -4, y: 1 });
      const testInB = await callTool('circuit_add_component', { type: 'IN-1', label: 'Test_B', x: -4, y: -1 });
      const testLed = await callTool('circuit_add_component', { type: 'LED', label: 'LED_Out', x: 4, y: 0 });

      // Connect test inputs to custom chip, and custom chip output to LED
      const customInPins = customInst.data.input_pins;
      const customOutPins = customInst.data.output_pins;

      await callTool('circuit_connect', { source_pin: `${testInA.data.component_id}:0`, target_pin: customInPins[1].pin_ref });
      await callTool('circuit_connect', { source_pin: `${testInB.data.component_id}:0`, target_pin: customInPins[0].pin_ref });
      await callTool('circuit_connect', { source_pin: customOutPins[0].pin_ref, target_pin: `${testLed.data.component_id}:0` });

      console.log('✓ Wired custom chip instance.\n');

      // Step 6: Verify Truth Table on Custom Chip
      console.log('--- Step 6: Verify Truth Table of Instantiated Custom Chip ---');
      const verifyRes = await callTool('circuit_verify_truth_table', {
        rows: [
          { inputs: [0, 0], expected: [0] },
          { inputs: [0, 1], expected: [0] },
          { inputs: [1, 0], expected: [0] },
          { inputs: [1, 1], expected: [1] }
        ]
      });

      console.log('Verification Result:', JSON.stringify(verifyRes, null, 2));
      if (!verifyRes.data?.all_passed) {
        throw new Error('Custom chip truth table verification failed!');
      }

      console.log('✓ PASS: Custom chip evaluated 100% correctly via truth table verification!\n');

      console.log('===========================================================');
      console.log('🎉 CIRCUIT_PACKAGE_CHIP TOOL 100% VERIFIED VIA WEBMCP!');
      console.log('===========================================================');

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
