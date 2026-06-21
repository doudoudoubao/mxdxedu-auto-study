'use strict';

/**
 * 通用工具：Base64 编解码、URL 参数解析、订阅内容识别等。
 */

/** 标准 Base64 解码（自动兼容 URL-safe 与缺失填充）。 */
function b64decode(str) {
  if (str == null) return '';
  let s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  // 补齐填充
  while (s.length % 4 !== 0) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

/** Base64 解码为 Buffer（用于二进制场景）。 */
function b64decodeRaw(str) {
  let s = String(str || '').trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (s.length % 4 !== 0) s += '=';
  return Buffer.from(s, 'base64');
}

/** 标准 Base64 编码。 */
function b64encode(str) {
  return Buffer.from(String(str), 'utf8').toString('base64');
}

/** URL-safe Base64 编码（去填充）。 */
function b64encodeUrl(str) {
  return Buffer.from(String(str), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 判断字符串是否“看起来像”一段 Base64 编码的订阅内容。
 * 订阅链接抓取后通常是整段 Base64。
 */
function looksLikeBase64(str) {
  const s = String(str || '').trim();
  if (s.length < 8) return false;
  // 含有协议头说明是明文节点列表，不是 base64
  if (/(^|\n)\s*(ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|wireguard|wg|http|https|socks5?|snell|anytls):\/\//i.test(s)) {
    return false;
  }
  return /^[A-Za-z0-9+/\-_=\s]+$/.test(s);
}

/**
 * 将订阅原始文本解码为节点链接列表。
 * 兼容：整段 Base64、逐行 Base64、明文逐行。
 */
function decodeSubscription(raw) {
  let text = String(raw || '').trim();
  if (!text) return [];

  if (looksLikeBase64(text)) {
    const decoded = b64decode(text);
    if (decoded && /:\/\//.test(decoded)) {
      text = decoded;
    }
  }

  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
}

/** 解析 URL query 字符串为对象（自动 decode）。 */
function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  const s = qs.startsWith('?') ? qs.slice(1) : qs;
  for (const pair of s.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    let k, v;
    if (idx === -1) {
      k = pair;
      v = '';
    } else {
      k = pair.slice(0, idx);
      v = pair.slice(idx + 1);
    }
    try {
      k = decodeURIComponent(k);
    } catch (_) { /* keep raw */ }
    try {
      v = decodeURIComponent(v);
    } catch (_) { /* keep raw */ }
    out[k] = v;
  }
  return out;
}

/** 安全 decodeURIComponent。 */
function safeDecode(s) {
  if (s == null) return s;
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

/** 解析 URL 末尾的 #备注 为节点名称。 */
function extractName(str) {
  const idx = str.indexOf('#');
  if (idx === -1) return { body: str, name: '' };
  return { body: str.slice(0, idx), name: safeDecode(str.slice(idx + 1)).trim() };
}

/** 解析 user:pass@host:port，返回各部分。 */
function parseAuthority(authority) {
  let userinfo = '';
  let hostport = authority;
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    userinfo = authority.slice(0, at);
    hostport = authority.slice(at + 1);
  }
  // 兼容 IPv6 [::1]:443
  let host, port;
  if (hostport.startsWith('[')) {
    const close = hostport.indexOf(']');
    host = hostport.slice(1, close);
    const rest = hostport.slice(close + 1);
    port = rest.startsWith(':') ? rest.slice(1) : '';
  } else {
    const colon = hostport.lastIndexOf(':');
    if (colon === -1) {
      host = hostport;
      port = '';
    } else {
      host = hostport.slice(0, colon);
      port = hostport.slice(colon + 1);
    }
  }
  return { userinfo, host, port: port ? parseInt(port, 10) : 0 };
}

/** 把字符串/数字转布尔（"1"/"true"/true → true）。 */
function toBool(v) {
  if (v === true) return true;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/** 把逗号或竖线分隔的字符串转为数组。 */
function splitList(v) {
  if (!v) return undefined;
  if (Array.isArray(v)) return v;
  return String(v)
    .split(/[,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

module.exports = {
  b64decode,
  b64decodeRaw,
  b64encode,
  b64encodeUrl,
  looksLikeBase64,
  decodeSubscription,
  parseQuery,
  safeDecode,
  extractName,
  parseAuthority,
  toBool,
  splitList,
};
