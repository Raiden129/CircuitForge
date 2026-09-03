const http = require('http');

const tool = process.argv[2] || 'circuit_get_snapshot';
let params = {};
if (process.argv[3]) {
  try {
    params = JSON.parse(process.argv[3]);
  } catch (e) {
    console.error('Invalid JSON for params:', process.argv[3]);
    process.exit(1);
  }
}

const reqData = JSON.stringify({ tool, params });

const req = http.request({
  hostname: '127.0.0.1',
  port: 5174,
  path: '/call-tool',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reqData)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(body);
    }
  });
});

req.on('error', (e) => {
  console.error('Failed to connect to relay server on port 5174:', e.message);
  process.exit(1);
});

req.write(reqData);
req.end();
