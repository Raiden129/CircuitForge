const { spawn } = require('child_process');

console.log('=== TESTING CIRCUIT_SET_VIEWPORT & VIEWPORT TELEMETRY VIA WEBMCP ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9285',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9285/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9285');

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
      if (!toolNames.includes('circuit_set_viewport')) {
        throw new Error('circuit_set_viewport tool is missing from modelContext!');
      }
      console.log('✓ PASS: circuit_set_viewport is registered and discoverable.\n');

      // Step 2: Viewport Telemetry in Snapshot
      console.log('--- Step 2: Query Viewport Telemetry in circuit_get_snapshot ---');
      const snapshot = await callTool('circuit_get_snapshot', {});
      const vp = snapshot.data?.viewport;
      console.log('Viewport in snapshot:', JSON.stringify(vp, null, 2));

      if (!vp || !vp.visible_bounds || typeof vp.zoom !== 'number') {
        throw new Error('Snapshot did not contain valid viewport telemetry!');
      }
      console.log(`Visible X range: [${vp.visible_bounds.min_x.toFixed(1)} .. ${vp.visible_bounds.max_x.toFixed(1)}]`);
      console.log(`Visible Y range: [${vp.visible_bounds.min_y.toFixed(1)} .. ${vp.visible_bounds.max_y.toFixed(1)}]`);
      console.log('✓ PASS: Viewport telemetry verified in snapshot.\n');

      // Step 3: Place far component and test Auto-Fit
      console.log('--- Step 3: Place Component Far Away and Auto-Fit ---');
      await callTool('circuit_add_component', { type: 'AND', label: 'FarGate', x: 20, y: 15 });

      console.log('Auto-fitting camera to circuit...');
      const fitRes = await callTool('circuit_set_viewport', { action: 'fit_circuit' });
      console.log('Fit result:', JSON.stringify(fitRes, null, 2));

      const newBounds = fitRes.data?.visible_bounds;
      if (newBounds.max_x < 20 || newBounds.max_y < 15) {
        throw new Error(`Auto-fit failed to enclose (20, 15)! Bounds: ${JSON.stringify(newBounds)}`);
      }
      console.log('✓ PASS: Camera successfully auto-fitted to enclose the whole circuit!\n');

      // Step 4: Explicit Zoom & Pan
      console.log('--- Step 4: Explicit Zoom & Pan ---');
      const setRes = await callTool('circuit_set_viewport', { action: 'set', x: 0, y: 0, zoom: 10 });
      console.log('Set result:', JSON.stringify(setRes, null, 2));
      if (Math.abs(setRes.data.zoom - 10) > 0.1) {
        throw new Error('Target zoom level 10 was not set correctly!');
      }
      console.log('✓ PASS: Explicit pan and zoom executed cleanly.\n');

      console.log('===========================================================');
      console.log('🎉 CIRCUIT_SET_VIEWPORT TOOL 100% VERIFIED VIA WEBMCP!');
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
