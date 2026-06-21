'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { convert, TARGETS } = require('./src/convert');
const U = require('./src/util');

const PORT = process.env.PORT || 25500;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function serveStatic(res, urlPath) {
  let file = urlPath === '/' ? '/index.html' : urlPath;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) {
    return send(res, 403, 'Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const ext = path.extname(full).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

/** 拉取远程订阅内容（支持多个 url，用 | 分隔）。 */
async function fetchSubscriptions(urlParam) {
  if (!urlParam) return '';
  // url 参数本身可能被 base64 编码
  let value = urlParam;
  if (U.looksLikeBase64(value) && !/^https?:\/\//i.test(value)) {
    const decoded = U.b64decode(value);
    if (/^https?:\/\//i.test(decoded) || /:\/\//.test(decoded)) value = decoded;
  }
  const parts = value.split('|').map((s) => s.trim()).filter(Boolean);
  const contents = [];
  for (const p of parts) {
    if (/^https?:\/\//i.test(p)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(p, {
          headers: { 'User-Agent': 'clash-verge/v1.6.0' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await resp.text();
        contents.push(text);
      } catch (e) {
        throw new Error(`拉取订阅失败 (${p.slice(0, 40)}): ${e.message}`);
      }
    } else {
      // 直接是节点链接
      contents.push(p);
    }
  }
  return contents.join('\n');
}

async function handleSub(req, res, params) {
  const target = params.get('target') || 'clash';
  if (!TARGETS[target]) return send(res, 400, '不支持的目标格式: ' + target);
  const urlParam = params.get('url');
  const inlineInput = params.get('input');

  let raw = '';
  try {
    if (urlParam) raw += (await fetchSubscriptions(urlParam)) + '\n';
  } catch (e) {
    return send(res, 502, e.message);
  }
  if (inlineInput) raw += U.safeDecode(inlineInput);

  if (!raw.trim()) return send(res, 400, '未提供订阅内容（url 或 input 参数）');

  try {
    const result = convert(raw, target, {
      includeKeyword: params.get('include') || undefined,
      excludeKeyword: params.get('exclude') || undefined,
      prefix: params.get('prefix') || undefined,
    });
    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Access-Control-Allow-Origin': '*',
      'Subscription-Userinfo': `upload=0; download=0; total=0; expire=0`,
      'Profile-Update-Interval': '24',
      'Content-Disposition': `attachment; filename="${target}.${target === 'singbox' ? 'json' : target === 'clash' ? 'yaml' : 'conf'}"`,
    });
    res.end(result.output);
  } catch (e) {
    send(res, 500, '转换失败: ' + e.message);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleApiConvert(req, res) {
  let payload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body || '{}');
  } catch (e) {
    return send(res, 400, JSON.stringify({ error: '无效的 JSON 请求体' }), 'application/json; charset=utf-8');
  }

  const target = payload.target || 'clash';
  let raw = '';
  try {
    if (payload.url) raw += (await fetchSubscriptions(payload.url)) + '\n';
  } catch (e) {
    return send(res, 502, JSON.stringify({ error: e.message }), 'application/json; charset=utf-8');
  }
  if (payload.input) raw += payload.input;

  if (!raw.trim()) {
    return send(res, 400, JSON.stringify({ error: '请提供节点链接或订阅地址' }), 'application/json; charset=utf-8');
  }

  try {
    const result = convert(raw, target, payload.options || {});
    send(res, 200, JSON.stringify(result), 'application/json; charset=utf-8');
  } catch (e) {
    send(res, 500, JSON.stringify({ error: e.message }), 'application/json; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if (req.method === 'GET' && pathname === '/sub') {
      return await handleSub(req, res, parsed.searchParams);
    }
    if (req.method === 'POST' && pathname === '/api/convert') {
      return await handleApiConvert(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/targets') {
      const list = Object.entries(TARGETS).map(([k, v]) => ({ key: k, label: v.label }));
      return send(res, 200, JSON.stringify(list), 'application/json; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/health') {
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    }
    if (req.method === 'GET') {
      return serveStatic(res, pathname);
    }
    send(res, 404, 'Not Found');
  } catch (e) {
    send(res, 500, 'Server Error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`订阅转换服务已启动: http://${HOST}:${PORT}`);
  console.log(`网页界面:  http://localhost:${PORT}/`);
  console.log(`订阅端点:  http://localhost:${PORT}/sub?url=<订阅地址>&target=clash`);
});

module.exports = server;
