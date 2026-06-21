'use strict';

/**
 * 节点链接解析器集合。
 * 将各类代理 URI 解析为统一的内部模型（字段命名贴近 Clash/Mihomo）。
 *
 * 支持类型：
 *   ss, ssr, vmess, vless, trojan, hysteria(v1), hysteria2(hy2),
 *   tuic, wireguard(wg), http(s), socks5, snell, anytls
 */

const U = require('./util');

/* ----------------------------- 工具 ----------------------------- */

function num(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// 通用 TLS / 传输层字段填充（vless / trojan 共用）
function applyStreamSettings(node, q) {
  const network = (q.type || q.net || 'tcp').toLowerCase();
  node.network = network;

  // 传输层
  if (network === 'ws') {
    const headers = {};
    if (q.host) headers.Host = q.host;
    node['ws-opts'] = {
      path: q.path || '/',
      headers: Object.keys(headers).length ? headers : undefined,
    };
  } else if (network === 'grpc') {
    node['grpc-opts'] = {
      'grpc-service-name': q.serviceName || q.servicename || q.path || '',
    };
  } else if (network === 'h2' || network === 'http') {
    node['h2-opts'] = {
      host: q.host ? U.splitList(q.host) : undefined,
      path: q.path || '/',
    };
  } else if (network === 'httpupgrade') {
    node['network'] = 'httpupgrade';
    node['httpupgrade-opts'] = { path: q.path || '/', host: q.host || undefined };
  }

  // TLS / Reality
  const security = (q.security || '').toLowerCase();
  if (security === 'tls' || security === 'reality' || security === 'xtls') {
    node.tls = true;
    if (q.sni) node.servername = q.sni;
    else if (q.host && network === 'ws') node.servername = q.host;
    if (q.alpn) node.alpn = U.splitList(q.alpn);
    if (q.fp) node['client-fingerprint'] = q.fp;
    if (U.toBool(q.allowInsecure) || U.toBool(q.insecure)) node['skip-cert-verify'] = true;
  }
  if (security === 'reality') {
    node['reality-opts'] = {
      'public-key': q.pbk || '',
      'short-id': q.sid || undefined,
    };
    if (q.spx) node['_spiderX'] = q.spx;
  }
  return node;
}

/* --------------------------- Shadowsocks --------------------------- */

function parseSS(uri) {
  const { body, name } = U.extractName(uri);
  let rest = body.slice('ss://'.length);

  let cipher, password, server, port, query = '';

  // 拆出 query
  const qIdx = rest.indexOf('?');
  if (qIdx !== -1) {
    query = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }

  const at = rest.lastIndexOf('@');
  if (at !== -1) {
    // SIP002: base64(method:password)@host:port  或  明文 method:password@host:port
    let userinfo = rest.slice(0, at);
    const hostpart = rest.slice(at + 1);
    if (!userinfo.includes(':')) {
      userinfo = U.b64decode(userinfo);
    }
    const ci = userinfo.indexOf(':');
    cipher = userinfo.slice(0, ci);
    password = userinfo.slice(ci + 1);
    const { host, port: p } = U.parseAuthority(hostpart);
    server = host;
    port = p;
  } else {
    // 旧版：base64(method:password@host:port)
    const decoded = U.b64decode(rest);
    const a = decoded.lastIndexOf('@');
    const userinfo = decoded.slice(0, a);
    const ci = userinfo.indexOf(':');
    cipher = userinfo.slice(0, ci);
    password = userinfo.slice(ci + 1);
    const { host, port: p } = U.parseAuthority(decoded.slice(a + 1));
    server = host;
    port = p;
  }

  const node = {
    type: 'ss',
    name: name || `${server}:${port}`,
    server,
    port,
    cipher,
    password,
    udp: true,
  };

  // 插件
  const q = U.parseQuery(query);
  if (q.plugin) {
    const pluginStr = q.plugin;
    const parts = pluginStr.split(';');
    const pname = parts[0];
    const opts = {};
    for (let i = 1; i < parts.length; i++) {
      const [k, v] = parts[i].split('=');
      opts[k] = v === undefined ? true : v;
    }
    if (pname === 'obfs-local' || pname === 'simple-obfs') {
      node.plugin = 'obfs';
      node['plugin-opts'] = {
        mode: opts.obfs || 'http',
        host: opts['obfs-host'] || undefined,
      };
    } else if (pname === 'v2ray-plugin') {
      node.plugin = 'v2ray-plugin';
      node['plugin-opts'] = {
        mode: opts.mode || 'websocket',
        host: opts.host || undefined,
        path: opts.path || undefined,
        tls: opts.tls !== undefined,
      };
    } else if (pname === 'shadow-tls') {
      node.plugin = 'shadow-tls';
      node['plugin-opts'] = {
        host: opts.host || undefined,
        password: opts.password || undefined,
        version: num(opts.version, 3),
      };
    } else {
      node.plugin = pname;
      node['plugin-opts'] = opts;
    }
  }
  return node;
}

/* -------------------------- ShadowsocksR -------------------------- */

function parseSSR(uri) {
  let rest = uri.slice('ssr://'.length);
  const decoded = U.b64decode(rest);
  // host:port:protocol:method:obfs:base64pass/?params
  const mainAndQuery = decoded.split('/?');
  const main = mainAndQuery[0];
  const query = mainAndQuery[1] || '';
  const segs = main.split(':');
  // 协议、混淆字段在中间，host 可能含冒号? 一般不含。取后五段。
  const obfs = segs.pop();
  const method = segs.pop();
  const protocol = segs.pop();
  const port = segs.pop();
  const host = segs.join(':');
  let passBase = '';
  // 密码在 obfs 之后通常以 ":" 连接但上面已 pop；实际格式 host:port:proto:method:obfs:passBase
  // 重新正确切分：
  const all = main.split(':');
  const server2 = all[0];
  const port2 = all[1];
  const protocol2 = all[2];
  const method2 = all[3];
  const obfs2 = all[4];
  const passB64 = all.slice(5).join(':');
  const password = U.b64decode(passB64);

  const q = U.parseQuery(query);
  const node = {
    type: 'ssr',
    server: server2,
    port: num(port2, 0),
    protocol: protocol2,
    cipher: method2,
    obfs: obfs2,
    password,
    'protocol-param': q.protoparam ? U.b64decode(q.protoparam) : undefined,
    'obfs-param': q.obfsparam ? U.b64decode(q.obfsparam) : undefined,
    udp: true,
  };
  node.name = (q.remarks ? U.b64decode(q.remarks) : '') || `${node.server}:${node.port}`;
  return node;
}

/* ------------------------------ VMess ------------------------------ */

function parseVMess(uri) {
  const rest = uri.slice('vmess://'.length);
  let cfg;
  try {
    cfg = JSON.parse(U.b64decode(rest));
  } catch (e) {
    // 部分变体：vmess://method:pass@host:port?... 这里仅处理标准 JSON
    throw new Error('VMess 链接解析失败（非标准 JSON 格式）');
  }

  const network = (cfg.net || 'tcp').toLowerCase();
  const node = {
    type: 'vmess',
    name: cfg.ps || `${cfg.add}:${cfg.port}`,
    server: cfg.add,
    port: num(cfg.port, 0),
    uuid: cfg.id,
    alterId: num(cfg.aid, 0),
    cipher: cfg.scy || cfg.security || 'auto',
    udp: true,
    network,
  };

  const tls = String(cfg.tls || '').toLowerCase();
  if (tls === 'tls' || tls === 'reality') {
    node.tls = true;
    if (cfg.sni) node.servername = cfg.sni;
    else if (cfg.host) node.servername = cfg.host;
    if (cfg.alpn) node.alpn = U.splitList(cfg.alpn);
    if (cfg.fp) node['client-fingerprint'] = cfg.fp;
  }

  if (network === 'ws') {
    const headers = {};
    if (cfg.host) headers.Host = cfg.host;
    node['ws-opts'] = {
      path: cfg.path || '/',
      headers: Object.keys(headers).length ? headers : undefined,
    };
  } else if (network === 'grpc') {
    node['grpc-opts'] = { 'grpc-service-name': cfg.path || '' };
  } else if (network === 'h2') {
    node['h2-opts'] = {
      host: cfg.host ? U.splitList(cfg.host) : undefined,
      path: cfg.path || '/',
    };
  } else if (network === 'http') {
    node['http-opts'] = {
      path: cfg.path ? U.splitList(cfg.path) : ['/'],
      headers: cfg.host ? { Host: U.splitList(cfg.host) } : undefined,
    };
  } else if (network === 'tcp' && (cfg.type === 'http')) {
    node.network = 'http';
    node['http-opts'] = {
      path: cfg.path ? U.splitList(cfg.path) : ['/'],
      headers: cfg.host ? { Host: U.splitList(cfg.host) } : undefined,
    };
  }
  return node;
}

/* ------------------------------ VLESS ------------------------------ */

function parseVLESS(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.slice('vless://'.length);
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'vless',
    name: name || `${host}:${port}`,
    server: host,
    port,
    uuid: U.safeDecode(userinfo),
    udp: true,
  };
  if (q.flow) node.flow = q.flow;
  if (q.encryption && q.encryption !== 'none') node['encryption'] = q.encryption;

  applyStreamSettings(node, q);

  // 未走 TLS 但有 sni 的情况
  if (!node.tls && (q.security === '' || q.security === 'none')) {
    node.tls = false;
  }
  return node;
}

/* ------------------------------ Trojan ----------------------------- */

function parseTrojan(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.slice('trojan://'.length);
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'trojan',
    name: name || `${host}:${port}`,
    server: host,
    port,
    password: U.safeDecode(userinfo),
    udp: true,
    tls: true,
  };
  if (q.sni || q.peer) node.sni = q.sni || q.peer;
  if (q.alpn) node.alpn = U.splitList(q.alpn);
  if (q.fp) node['client-fingerprint'] = q.fp;
  if (q.flow) node.flow = q.flow;
  if (U.toBool(q.allowInsecure) || U.toBool(q.insecure)) node['skip-cert-verify'] = true;

  const network = (q.type || 'tcp').toLowerCase();
  if (network === 'ws') {
    node.network = 'ws';
    const headers = {};
    if (q.host) headers.Host = q.host;
    node['ws-opts'] = { path: q.path || '/', headers: Object.keys(headers).length ? headers : undefined };
  } else if (network === 'grpc') {
    node.network = 'grpc';
    node['grpc-opts'] = { 'grpc-service-name': q.serviceName || q.path || '' };
  }
  return node;
}

/* --------------------------- Hysteria v1 --------------------------- */

function parseHysteria(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.replace(/^hysteria:\/\//, '');
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'hysteria',
    name: name || `${host}:${port}`,
    server: host,
    port,
    'auth-str': q.auth || q.authStr || undefined,
    up: q.upmbps || q.up || undefined,
    down: q.downmbps || q.down || undefined,
    protocol: q.protocol || undefined,
    sni: q.peer || q.sni || undefined,
    alpn: q.alpn ? U.splitList(q.alpn) : undefined,
    obfs: q.obfs || undefined,
    'skip-cert-verify': U.toBool(q.insecure) || undefined,
    udp: true,
  };
  if (q.mport) node.ports = q.mport;
  return node;
}

/* --------------------------- Hysteria2 ----------------------------- */

function parseHysteria2(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.replace(/^(hysteria2|hy2):\/\//, '');
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'hysteria2',
    name: name || `${host}:${port}`,
    server: host,
    port: port || 443,
    password: U.safeDecode(userinfo),
    sni: q.sni || q.peer || undefined,
    'skip-cert-verify': U.toBool(q.insecure) || undefined,
    alpn: q.alpn ? U.splitList(q.alpn) : undefined,
    udp: true,
  };
  if (q.obfs) {
    node.obfs = q.obfs;
    if (q['obfs-password'] || q.obfsParam) node['obfs-password'] = q['obfs-password'] || q.obfsParam;
  }
  if (q.up) node.up = q.up;
  if (q.down) node.down = q.down;
  if (q.mport || q.ports) node.ports = q.mport || q.ports;
  return node;
}

/* ------------------------------ TUIC ------------------------------- */

function parseTUIC(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.slice('tuic://'.length);
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  // userinfo = uuid:password
  const ci = userinfo.indexOf(':');
  const uuid = ci === -1 ? userinfo : userinfo.slice(0, ci);
  const password = ci === -1 ? '' : userinfo.slice(ci + 1);

  const node = {
    type: 'tuic',
    name: name || `${host}:${port}`,
    server: host,
    port,
    uuid: U.safeDecode(uuid),
    password: U.safeDecode(password),
    'congestion-controller': q.congestion_control || q.congestion || undefined,
    'udp-relay-mode': q.udp_relay_mode || undefined,
    alpn: q.alpn ? U.splitList(q.alpn) : undefined,
    sni: q.sni || undefined,
    'skip-cert-verify': U.toBool(q.allow_insecure) || U.toBool(q.insecure) || undefined,
    'disable-sni': U.toBool(q.disable_sni) || undefined,
    'reduce-rtt': U.toBool(q.reduce_rtt) || undefined,
    udp: true,
  };
  return node;
}

/* ---------------------------- WireGuard ---------------------------- */

function parseWireGuard(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.replace(/^(wireguard|wg):\/\//, '');
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'wireguard',
    name: name || `${host}:${port}`,
    server: host,
    port,
    'private-key': U.safeDecode(userinfo) || q.privatekey || q.privateKey || undefined,
    'public-key': q.publickey || q.publicKey || q.peer || undefined,
    'pre-shared-key': q.presharedkey || q.presharedKey || undefined,
    ip: q.address ? U.splitList(q.address)[0] : (q.ip || undefined),
    udp: true,
  };
  const addrs = U.splitList(q.address);
  if (addrs) {
    for (const a of addrs) {
      if (a.includes(':')) node.ipv6 = a;
      else node.ip = a.split('/')[0];
    }
  }
  if (q.mtu) node.mtu = num(q.mtu, undefined);
  if (q.reserved) node.reserved = U.splitList(q.reserved).map((x) => num(x, 0));
  return node;
}

/* ----------------------------- HTTP(S) ----------------------------- */

function parseHTTP(uri) {
  const { body, name } = U.extractName(uri);
  const isTls = body.startsWith('https://');
  const rest = body.replace(/^https?:\/\//, '');
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  let username = '', password = '';
  if (userinfo) {
    const ci = userinfo.indexOf(':');
    username = U.safeDecode(ci === -1 ? userinfo : userinfo.slice(0, ci));
    password = ci === -1 ? '' : U.safeDecode(userinfo.slice(ci + 1));
  }
  return {
    type: 'http',
    name: name || `${host}:${port}`,
    server: host,
    port: port || (isTls ? 443 : 80),
    username: username || undefined,
    password: password || undefined,
    tls: isTls || undefined,
    sni: q.sni || undefined,
    'skip-cert-verify': U.toBool(q.insecure) || undefined,
  };
}

/* ----------------------------- SOCKS5 ------------------------------ */

function parseSOCKS(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.replace(/^socks5?:\/\//, '');
  const qIdx = rest.indexOf('?');
  let authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const q = U.parseQuery(query);

  let username = '', password = '';
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    let ui = authority.slice(0, at);
    if (!ui.includes(':')) ui = U.b64decode(ui); // 部分实现 base64(user:pass)
    const ci = ui.indexOf(':');
    username = U.safeDecode(ci === -1 ? ui : ui.slice(0, ci));
    password = ci === -1 ? '' : U.safeDecode(ui.slice(ci + 1));
    authority = authority.slice(at + 1);
  }
  const { host, port } = U.parseAuthority(authority);
  return {
    type: 'socks5',
    name: name || `${host}:${port}`,
    server: host,
    port,
    username: username || undefined,
    password: password || undefined,
    tls: U.toBool(q.tls) || undefined,
    'skip-cert-verify': U.toBool(q.insecure) || undefined,
    udp: true,
  };
}

/* ------------------------------ Snell ------------------------------ */

function parseSnell(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.replace(/^snell:\/\//, '');
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  const node = {
    type: 'snell',
    name: name || `${host}:${port}`,
    server: host,
    port,
    psk: U.safeDecode(userinfo) || q.psk || undefined,
    version: num(q.version, 1),
    udp: true,
  };
  if (q.obfs) {
    node['obfs-opts'] = { mode: q.obfs, host: q['obfs-host'] || undefined };
  }
  return node;
}

/* ----------------------------- AnyTLS ------------------------------ */

function parseAnyTLS(uri) {
  const { body, name } = U.extractName(uri);
  const rest = body.slice('anytls://'.length);
  const qIdx = rest.indexOf('?');
  const authority = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
  const { userinfo, host, port } = U.parseAuthority(authority);
  const q = U.parseQuery(query);

  return {
    type: 'anytls',
    name: name || `${host}:${port}`,
    server: host,
    port,
    password: U.safeDecode(userinfo),
    sni: q.sni || undefined,
    alpn: q.alpn ? U.splitList(q.alpn) : undefined,
    'client-fingerprint': q.fp || undefined,
    'skip-cert-verify': U.toBool(q.insecure) || U.toBool(q.allowInsecure) || undefined,
    udp: true,
  };
}

/* ---------------------------- 调度入口 ----------------------------- */

const SCHEME_MAP = [
  [/^ssr:\/\//i, parseSSR],
  [/^ss:\/\//i, parseSS],
  [/^vmess:\/\//i, parseVMess],
  [/^vless:\/\//i, parseVLESS],
  [/^trojan:\/\//i, parseTrojan],
  [/^hysteria2:\/\//i, parseHysteria2],
  [/^hy2:\/\//i, parseHysteria2],
  [/^hysteria:\/\//i, parseHysteria],
  [/^tuic:\/\//i, parseTUIC],
  [/^wireguard:\/\//i, parseWireGuard],
  [/^wg:\/\//i, parseWireGuard],
  [/^https?:\/\//i, parseHTTP],
  [/^socks5?:\/\//i, parseSOCKS],
  [/^snell:\/\//i, parseSnell],
  [/^anytls:\/\//i, parseAnyTLS],
];

/** 解析单条链接，失败抛错。 */
function parseLine(line) {
  const trimmed = line.trim();
  for (const [re, fn] of SCHEME_MAP) {
    if (re.test(trimmed)) return fn(trimmed);
  }
  throw new Error('未知或不支持的协议: ' + trimmed.slice(0, 24));
}

/**
 * 解析多行/订阅文本，返回 { nodes, errors }。
 */
function parseAll(raw) {
  const links = U.decodeSubscription(raw);
  const nodes = [];
  const errors = [];
  for (const link of links) {
    try {
      const node = parseLine(link);
      if (node && node.server && node.port) nodes.push(node);
      else errors.push({ link: link.slice(0, 40), error: '缺少必要字段' });
    } catch (e) {
      errors.push({ link: link.slice(0, 40), error: e.message });
    }
  }
  return { nodes, errors };
}

module.exports = { parseLine, parseAll, applyStreamSettings };
