'use strict';

/**
 * sing-box 配置生成器（JSON）。
 * 将内部模型转换为 sing-box outbound，并包装为完整可用配置。
 * 不受支持的类型（ssr / snell）会被跳过并记录。
 */

function buildTLS(node) {
  if (!node.tls && !node.sni && !node.servername && !node['reality-opts']) return undefined;
  const tls = { enabled: true };
  const sni = node.servername || node.sni;
  if (sni) tls.server_name = sni;
  if (node.alpn) tls.alpn = node.alpn;
  if (node['skip-cert-verify']) tls.insecure = true;
  if (node['client-fingerprint']) {
    tls.utls = { enabled: true, fingerprint: node['client-fingerprint'] };
  }
  if (node['reality-opts']) {
    tls.reality = {
      enabled: true,
      public_key: node['reality-opts']['public-key'],
      short_id: node['reality-opts']['short-id'],
    };
    if (!tls.utls) tls.utls = { enabled: true, fingerprint: node['client-fingerprint'] || 'chrome' };
  }
  return tls;
}

function buildTransport(node) {
  const net = node.network;
  if (!net || net === 'tcp') return undefined;
  if (net === 'ws') {
    const t = { type: 'ws' };
    const o = node['ws-opts'] || {};
    if (o.path) t.path = o.path;
    if (o.headers) t.headers = o.headers;
    return t;
  }
  if (net === 'grpc') {
    return { type: 'grpc', service_name: (node['grpc-opts'] || {})['grpc-service-name'] || '' };
  }
  if (net === 'h2') {
    const o = node['h2-opts'] || {};
    return { type: 'http', host: o.host, path: o.path };
  }
  if (net === 'http') {
    const o = node['http-opts'] || {};
    return { type: 'http', host: (o.headers && o.headers.Host) || undefined, path: Array.isArray(o.path) ? o.path[0] : o.path };
  }
  if (net === 'httpupgrade') {
    const o = node['httpupgrade-opts'] || {};
    return { type: 'httpupgrade', path: o.path, host: o.host };
  }
  return undefined;
}

function defined(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

function nodeToOutbound(node) {
  const tag = node.name;
  const base = { tag, server: node.server, server_port: node.port };

  switch (node.type) {
    case 'ss': {
      const o = { type: 'shadowsocks', ...base, method: node.cipher, password: node.password };
      if (node.plugin === 'obfs') {
        o.plugin = 'obfs-local';
        const po = node['plugin-opts'] || {};
        o.plugin_opts = `obfs=${po.mode || 'http'}${po.host ? ';obfs-host=' + po.host : ''}`;
      } else if (node.plugin === 'v2ray-plugin') {
        o.plugin = 'v2ray-plugin';
        const po = node['plugin-opts'] || {};
        o.plugin_opts = `mode=${po.mode || 'websocket'}${po.tls ? ';tls' : ''}${po.host ? ';host=' + po.host : ''}${po.path ? ';path=' + po.path : ''}`;
      }
      return defined(o);
    }
    case 'vmess':
      return defined({
        type: 'vmess', ...base,
        uuid: node.uuid,
        security: node.cipher || 'auto',
        alter_id: node.alterId || 0,
        tls: buildTLS(node),
        transport: buildTransport(node),
      });
    case 'vless':
      return defined({
        type: 'vless', ...base,
        uuid: node.uuid,
        flow: node.flow || undefined,
        tls: buildTLS(node),
        transport: buildTransport(node),
      });
    case 'trojan':
      return defined({
        type: 'trojan', ...base,
        password: node.password,
        tls: buildTLS({ ...node, tls: true }),
        transport: buildTransport(node),
      });
    case 'hysteria':
      return defined({
        type: 'hysteria', ...base,
        up_mbps: node.up ? parseInt(node.up, 10) : undefined,
        down_mbps: node.down ? parseInt(node.down, 10) : undefined,
        auth_str: node['auth-str'],
        obfs: node.obfs,
        tls: defined({ enabled: true, server_name: node.sni, alpn: node.alpn, insecure: node['skip-cert-verify'] }),
      });
    case 'hysteria2':
      return defined({
        type: 'hysteria2', ...base,
        password: node.password,
        up_mbps: node.up ? parseInt(node.up, 10) : undefined,
        down_mbps: node.down ? parseInt(node.down, 10) : undefined,
        obfs: node.obfs ? { type: node.obfs, password: node['obfs-password'] } : undefined,
        tls: defined({ enabled: true, server_name: node.sni, alpn: node.alpn, insecure: node['skip-cert-verify'] }),
      });
    case 'tuic':
      return defined({
        type: 'tuic', ...base,
        uuid: node.uuid,
        password: node.password,
        congestion_control: node['congestion-controller'],
        udp_relay_mode: node['udp-relay-mode'],
        tls: defined({ enabled: true, server_name: node.sni, alpn: node.alpn, insecure: node['skip-cert-verify'] }),
      });
    case 'wireguard':
      return defined({
        type: 'wireguard', ...base,
        local_address: [node.ip ? `${node.ip}/32` : undefined, node.ipv6 ? `${node.ipv6}/128` : undefined].filter(Boolean),
        private_key: node['private-key'],
        peer_public_key: node['public-key'],
        pre_shared_key: node['pre-shared-key'],
        mtu: node.mtu,
        reserved: node.reserved,
      });
    case 'http':
      return defined({
        type: 'http', ...base,
        username: node.username,
        password: node.password,
        tls: node.tls ? defined({ enabled: true, server_name: node.sni, insecure: node['skip-cert-verify'] }) : undefined,
      });
    case 'socks5':
      return defined({ type: 'socks', ...base, version: '5', username: node.username, password: node.password });
    case 'anytls':
      return defined({
        type: 'anytls', ...base,
        password: node.password,
        tls: buildTLS({ ...node, tls: true }),
      });
    default:
      return null; // ssr / snell 等不支持
  }
}

function buildConfig(nodes, options = {}) {
  const outbounds = [];
  const tags = [];
  const skipped = [];
  const seen = new Map();

  for (const n of nodes) {
    const ob = nodeToOutbound(n);
    if (!ob) {
      skipped.push(n.type);
      continue;
    }
    let tag = ob.tag;
    if (seen.has(tag)) {
      const c = seen.get(tag) + 1;
      seen.set(tag, c);
      tag = `${tag}_${c}`;
    } else seen.set(tag, 0);
    ob.tag = tag;
    outbounds.push(ob);
    tags.push(tag);
  }

  const config = {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [
        { tag: 'google', address: 'tls://8.8.8.8' },
        { tag: 'local', address: '223.5.5.5', detour: 'direct' },
      ],
      rules: [{ rule_set: 'geosite-cn', server: 'local' }],
      final: 'google',
    },
    inbounds: [
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 7890 },
    ],
    outbounds: [
      { type: 'selector', tag: '🚀 节点选择', outbounds: ['♻️ 自动选择', ...tags, 'direct'], default: '♻️ 自动选择' },
      { type: 'urltest', tag: '♻️ 自动选择', outbounds: tags.length ? tags : ['direct'], url: 'http://www.gstatic.com/generate_204', interval: '5m' },
      ...outbounds,
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_is_private: true, outbound: 'direct' },
        { rule_set: 'geoip-cn', outbound: 'direct' },
        { rule_set: 'geosite-cn', outbound: 'direct' },
      ],
      rule_set: [
        { type: 'remote', tag: 'geoip-cn', format: 'binary', url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs' },
        { type: 'remote', tag: 'geosite-cn', format: 'binary', url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs' },
      ],
      final: '🚀 节点选择',
      auto_detect_interface: true,
    },
  };

  if (options.outboundsOnly) {
    return JSON.stringify({ outbounds }, null, 2);
  }
  return JSON.stringify(config, null, 2);
}

module.exports = { buildConfig, nodeToOutbound };
