const { spawn } = require('child_process');

console.log('=== TESTING DELETE & UNDO COMMANDS VIA WEBMCP ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9281',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9281/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9281');

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

      // 1. Add component: LED
      console.log('--- Step 1: Add Component ---');
      const addRes = await evalWebMCP('circuit_add_component', { type: 'LED', label: 'TestLED', x: 2.0, y: 1.0 });
      console.log(`Add LED result: Ok=${addRes.ok}, ID=${addRes.data?.component_id}`);
      const compId = addRes.data.component_id;

      let snap = await evalWebMCP('circuit_get_snapshot', { detail: 'summary' });
      console.log(`Snapshot before delete: ${snap.data.subchip_count} subchips`);
      if (snap.data.subchip_count !== 1) throw new Error('Expected 1 subchip');

      // 2. Delete Component
      console.log('\n--- Step 2: Delete Component ---');
      const delRes = await evalWebMCP('circuit_delete_component', { component_id: compId });
      console.log(`Delete result: Ok=${delRes.ok}, Summary="${delRes.summary}"`);
      if (!delRes.ok) throw new Error(`Delete failed: ${JSON.stringify(delRes.error)}`);

      snap = await evalWebMCP('circuit_get_snapshot', { detail: 'summary' });
      console.log(`Snapshot after delete: ${snap.data.subchip_count} subchips`);
      if (snap.data.subchip_count !== 0) throw new Error('Expected 0 subchips after deletion');
      console.log('✓ PASS: Component successfully deleted!');

      // 3. Undo Deletion
      console.log('\n--- Step 3: Undo Deletion ---');
      const undoRes = await evalWebMCP('circuit_undo', {});
      console.log(`Undo result: Ok=${undoRes.ok}, Summary="${undoRes.summary}"`);
      if (!undoRes.ok) throw new Error('Undo failed');

      snap = await evalWebMCP('circuit_get_snapshot', { detail: 'summary' });
      console.log(`Snapshot after undo: ${snap.data.subchip_count} subchips`);
      if (snap.data.subchip_count !== 1) throw new Error('Expected 1 subchip restored after undo');
      console.log('✓ PASS: Component successfully restored by Undo!');

      // 4. Redo Deletion
      console.log('\n--- Step 4: Redo Deletion ---');
      const redoRes = await evalWebMCP('circuit_redo', {});
      console.log(`Redo result: Ok=${redoRes.ok}, Summary="${redoRes.summary}"`);
      if (!redoRes.ok) throw new Error('Redo failed');

      snap = await evalWebMCP('circuit_get_snapshot', { detail: 'summary' });
      console.log(`Snapshot after redo: ${snap.data.subchip_count} subchips`);
      if (snap.data.subchip_count !== 0) throw new Error('Expected 0 subchips after redo');
      console.log('✓ PASS: Redo successfully re-deleted component!');

      console.log('\n======================================================');
      console.log('🎉 DELETE AND UNDO COMMANDS 100% VERIFIED VIA WEBMCP!');
      console.log('======================================================');

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
