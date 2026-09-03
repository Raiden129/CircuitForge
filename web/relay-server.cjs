const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = 5174;

const connectedBrowserTabs = new Set();
const pendingRequests = new Map();

function getActiveBrowserTab() {
  for (const ws of connectedBrowserTabs) {
    if (ws.readyState === WebSocket.OPEN) {
      return ws;
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      browser_connected: getActiveBrowserTab() !== null,
      tabs_count: connectedBrowserTabs.size
    }));
    return;
  }

  if (req.url === '/call-tool' && req.method === 'POST') {
    const ws = getActiveBrowserTab();
    if (!ws) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: 'NO_BROWSER_CONNECTED',
        message: 'No CircuitForge browser tab is currently connected to the relay. Please ensure http://127.0.0.1:5173/ is open in Chrome.'
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { tool, params } = JSON.parse(body || '{}');
        if (!tool) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'MISSING_TOOL_NAME' }));
          return;
        }

        const id = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const timeout = setTimeout(() => {
          pendingRequests.delete(id);
          if (!res.writableEnded) {
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'TOOL_EXECUTION_TIMEOUT' }));
          }
        }, 15000);

        pendingRequests.set(id, { res, timeout });

        ws.send(JSON.stringify({
          type: 'execute_tool',
          id,
          tool,
          params: params || {}
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'INVALID_REQUEST', message: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  connectedBrowserTabs.add(ws);
  console.log(`[Relay] Browser tab connected. Total connected tabs: ${connectedBrowserTabs.size}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'tool_result' && msg.id) {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(msg.id);
          pending.res.writeHead(200, { 'Content-Type': 'application/json' });
          pending.res.end(JSON.stringify(msg.result));
        }
      }
    } catch (err) {
      console.error('[Relay] Error handling message:', err);
    }
  });

  ws.on('close', () => {
    connectedBrowserTabs.delete(ws);
    console.log(`[Relay] Browser tab disconnected. Remaining tabs: ${connectedBrowserTabs.size}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Relay] WebMCP Agent Relay listening on http://127.0.0.1:${PORT}`);
});
