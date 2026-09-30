// 零依赖本地代理：转发到 DeepSeek 的 Anthropic 兼容端点，绕开浏览器 CORS
// 运行：node server.js   然后打开 http://localhost:3000
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const UPSTREAM_HOST = 'api.deepseek.com';
const UPSTREAM_PATH = '/anthropic/v1/messages';

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        return sendJson(res, 400, { error: '请求体不是合法 JSON' });
      }
      const key = (payload.apiKey || '').trim();
      if (!key) return sendJson(res, 400, { error: '缺少 API Key' });

      const body = JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 8192,
        messages: payload.messages
      });

      const up = https.request(
        {
          hostname: UPSTREAM_HOST,
          path: UPSTREAM_PATH,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'anthropic-version': '2023-06-01',
            authorization: 'Bearer ' + key, // ANTHROPIC_AUTH_TOKEN 对应的头
            'x-api-key': key // 兼容部分网关
          }
        },
        (upRes) => {
          let data = '';
          upRes.on('data', (c) => (data += c));
          upRes.on('end', () => {
            res.writeHead(upRes.statusCode, {
              'content-type': 'application/json; charset=utf-8'
            });
            res.end(data);
          });
        }
      );
      up.on('error', (e) => sendJson(res, 502, { error: '上游请求失败：' + e.message }));
      up.write(body);
      up.end();
    });
    return;
  }

  // 静态文件
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.slice(1));
  const full = path.join(__dirname, rel);
  if (!full.startsWith(__dirname) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(full);
  const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'text/plain';
  res.writeHead(200, { 'content-type': type + '; charset=utf-8' });
  res.end(fs.readFileSync(full));
});

server.listen(PORT, () => {
  console.log('Server running: http://localhost:' + PORT);
});
