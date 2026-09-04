const { spawn } = require('child_process');

console.log('=== TESTING NATIVE WEBMCP TIMELINE LOGGING ===\n');

const chromeProc = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--window-size=1280,800',
  '--remote-debugging-port=9283',
  '--enable-blink-features=WebMCP,WebMCPTesting',
  'http://127.0.0.1:5173/'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2500));
  const list = await fetch('http://127.0.0.1:9283/json').then(r => r.json());
  const target = list.find(t => t.url.includes('5173'));
  if (!target) throw new Error('Could not attach to Chromium target on port 9283');

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

      // Simulate native in-browser agent calling executeTool
      console.log('Invoking circuit_add_component via native document.modelContext.executeTool...');
      const callRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          const tools = await document.modelContext.getTools();
          const addTool = tools.find(t => t.name === "circuit_add_component");
          const res = await document.modelContext.executeTool(addTool, JSON.stringify({ type: "AND", label: "AgentGate", x: 0, y: 0 }));
          return typeof res === "string" ? JSON.parse(res) : res;
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('Tool Result:', callRes.result.value.summary);

      // Check Activity Timeline DOM elements
      const timelineItems = await send('Runtime.evaluate', {
        expression: `(() => {
          const items = Array.from(document.querySelectorAll('#activity-list .timeline-item'));
          return items.map(el => ({
            action: el.querySelector('.timeline-action')?.textContent?.trim(),
            summary: el.querySelector('.timeline-summary')?.textContent?.trim(),
            badge: el.querySelector('.badge-agent, .badge-human')?.textContent?.trim()
          }));
        })()`,
        returnByValue: true
      });

      console.log('\nActivity Timeline DOM Entries:');
      console.log(JSON.stringify(timelineItems.result.value, null, 2));

      const hasAgentAction = timelineItems.result.value.some(item =>
        item.badge?.includes('AGENT') && (item.action === 'circuit_add_component' || item.action === 'circuit_add_component_DONE')
      );

      if (!hasAgentAction) {
        throw new Error('Agent tool execution was not logged to the Activity Timeline!');
      }

      console.log('\n✓ PASS: Native WebMCP agent tool calls are visibly rendered in the Activity Timeline!');

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
