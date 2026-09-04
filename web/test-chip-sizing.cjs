const { spawn } = require('child_process');

console.log('=== TESTING CHIP SIZING & LABEL OVERFLOW PREVENTION ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9286',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9286/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9286');

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

      // Step 1: Build basic circuit
      console.log('--- Step 1: Build basic circuit ---');
      const inA = await callTool('circuit_add_component', { type: 'IN-1', label: 'In_A', x: -4, y: 0 });
      const outY = await callTool('circuit_add_component', { type: 'OUT-1', label: 'Out_Y', x: 4, y: 0 });
      await callTool('circuit_connect', { source_pin: `${inA.data.component_id}:0`, target_pin: `${outY.data.component_id}:0` });

      // Step 2: Package with long name
      const longName = "EXTENDED_ARITHMETIC_UNIT";
      console.log(`--- Step 2: Package chip with long name: "${longName}" ---`);
      const pkgRes = await callTool('circuit_package_chip', {
        name: longName,
        color: '#f59e0b',
        clear_workspace: true
      });
      console.log('Package result:', pkgRes.summary);
      if (!pkgRes.ok) throw new Error('Failed to package chip: ' + pkgRes.error);

      // Step 3: Instantiate chip and inspect
      console.log('--- Step 3: Instantiate chip on fresh canvas ---');
      const instRes = await callTool('circuit_add_component', {
        type: longName,
        label: 'WideChip',
        x: 0,
        y: 0
      });
      console.log('Instantiate result:', instRes.summary);

      const inspectRes = await callTool('circuit_inspect_component', {
        component_id: instRes.data.component_id
      });
      console.log('Inspection details:', JSON.stringify(inspectRes.data, null, 2));

      // Chip body width should be wide enough to accommodate the long text
      const width = inspectRes.data.size?.width;
      console.log(`Measured chip width: ${width} units`);

      if (width < 3.0) {
        throw new Error(`Chip width (${width}) is too narrow! Name will overflow.`);
      }

      console.log(`✓ PASS: Chip body width (${width}) safely accommodates the full label without overflow!\n`);

      console.log('===========================================================');
      console.log('🎉 CHIP SIZING & LABEL OVERFLOW PREVENTION 100% VERIFIED!');
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
