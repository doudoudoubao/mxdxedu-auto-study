'use strict';

/**
 * Clash / Mihomo(Clash.Meta) 配置生成器。
 * 内部模型字段已贴近 Clash，故主要做字段白名单清洗 + 完整配置模板包装。
 */

const yaml = require('../yaml');

// 各类型在 Clash 中保留的字段（顺序即输出顺序）
const FIELD_WHITELIST = {
  ss: ['name', 'type', 'server', 'port', 'cipher', 'password', 'udp', 'plugin', 'plugin-opts'],
  ssr: ['name', 'type', 'server', 'port', 'cipher', 'password', 'protocol', 'obfs', 'protocol-param', 'obfs-param', 'udp'],
  vmess: ['name', 'type', 'server', 'port', 'uuid', 'alterId', 'cipher', 'udp', 'tls', 'servername', 'alpn', 'client-fingerprint', 'skip-cert-verify', 'network', 'ws-opts', 'grpc-opts', 'h2-opts', 'http-opts'],
  vless: ['name', 'type', 'server', 'port', 'uuid', 'udp', 'tls', 'flow', 'servername', 'alpn', 'client-fingerprint', 'skip-cert-verify', 'network', 'ws-opts', 'grpc-opts', 'reality-opts'],
  trojan: ['name', 'type', 'server', 'port', 'password', 'udp', 'sni', 'alpn', 'client-fingerprint', 'skip-cert-verify', 'flow', 'network', 'ws-opts', 'grpc-opts'],
  hysteria: ['name', 'type', 'server', 'port', 'ports', 'auth-str', 'up', 'down', 'protocol', 'obfs', 'sni', 'alpn', 'skip-cert-verify', 'udp'],
  hysteria2: ['name', 'type', 'server', 'port', 'ports', 'password', 'up', 'down', 'obfs', 'obfs-password', 'sni', 'alpn', 'skip-cert-verify', 'udp'],
  tuic: ['name', 'type', 'server', 'port', 'uuid', 'password', 'congestion-controller', 'udp-relay-mode', 'alpn', 'sni', 'skip-cert-verify', 'disable-sni', 'reduce-rtt'],
  wireguard: ['name', 'type', 'server', 'port', 'private-key', 'public-key', 'pre-shared-key', 'ip', 'ipv6', 'mtu', 'reserved', 'udp'],
  http: ['name', 'type', 'server', 'port', 'username', 'password', 'tls', 'sni', 'skip-cert-verify'],
  socks5: ['name', 'type', 'server', 'port', 'username', 'password', 'tls', 'skip-cert-verify', 'udp'],
  snell: ['name', 'type', 'server', 'port', 'psk', 'version', 'obfs-opts', 'udp'],
  anytls: ['name', 'type', 'server', 'port', 'password', 'sni', 'alpn', 'client-fingerprint', 'skip-cert-verify', 'udp'],
};

function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (obj[k] === undefined || obj[k] === null) continue;
      out[k] = clean(obj[k]);
    }
    return out;
  }
  return obj;
}

function nodeToClash(node) {
  const wl = FIELD_WHITELIST[node.type];
  const out = {};
  if (wl) {
    for (const k of wl) {
      if (node[k] !== undefined) out[k] = node[k];
    }
  } else {
    for (const k of Object.keys(node)) {
      if (!k.startsWith('_')) out[k] = node[k];
    }
  }
  return clean(out);
}

/** Clash 不支持的类型（直接过滤）。当前内置类型全部支持。 */
function isSupported() {
  return true;
}

function buildConfig(nodes, options = {}) {
  const proxies = [];
  const seen = new Map();
  for (const n of nodes) {
    if (!isSupported(n)) continue;
    const p = nodeToClash(n);
    // 名称去重
    let name = p.name || `${p.server}:${p.port}`;
    if (seen.has(name)) {
      const c = seen.get(name) + 1;
      seen.set(name, c);
      name = `${name}_${c}`;
    } else {
      seen.set(name, 0);
    }
    p.name = name;
    proxies.push(p);
  }

  const names = proxies.map((p) => p.name);

  const config = {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    dns: {
      enable: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      nameserver: ['223.5.5.5', '119.29.29.29', 'https://dns.google/dns-query'],
    },
    proxies,
    'proxy-groups': [
      { name: '🚀 节点选择', type: 'select', proxies: ['♻️ 自动选择', 'DIRECT', ...names] },
      { name: '♻️ 自动选择', type: 'url-test', url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50, proxies: names.length ? names : ['DIRECT'] },
      { name: '🌍 国外媒体', type: 'select', proxies: ['🚀 节点选择', '♻️ 自动选择', 'DIRECT', ...names] },
      { name: '📲 电报信息', type: 'select', proxies: ['🚀 节点选择', '♻️ 自动选择', 'DIRECT', ...names] },
      { name: '🐟 漏网之鱼', type: 'select', proxies: ['🚀 节点选择', 'DIRECT', '♻️ 自动选择', ...names] },
    ],
    rules: [
      'DOMAIN-SUFFIX,local,DIRECT',
      'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
      'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
      'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
      'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
      'GEOIP,CN,DIRECT',
      'MATCH,🐟 漏网之鱼',
    ],
  };

  if (options.proxiesOnly) {
    return yaml.dump({ proxies });
  }
  return yaml.dump(config);
}

module.exports = { buildConfig, nodeToClash };
