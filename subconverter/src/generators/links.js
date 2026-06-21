'use strict';

/**
 * 将内部模型重新序列化为节点 URI 链接（用于 V2Ray/Base64 通用订阅与明文输出）。
 */

const U = require('../util');

function enc(s) {
  return encodeURIComponent(String(s == null ? '' : s));
}

function frag(name) {
  return name ? '#' + enc(name) : '';
}

function hostport(node) {
  const h = node.server.includes(':') ? `[${node.server}]` : node.server;
  return `${h}:${node.port}`;
}

// 收集 vless/trojan 的传输+TLS query
function streamQuery(node) {
  const q = [];
  if (node.flow) q.push(`flow=${enc(node.flow)}`);
  if (node['reality-opts']) {
    q.push('security=reality');
    q.push(`pbk=${enc(node['reality-opts']['public-key'])}`);
    if (node['reality-opts']['short-id']) q.push(`sid=${enc(node['reality-opts']['short-id'])}`);
  } else if (node.tls) {
    q.push('security=tls');
  } else {
    q.push('security=none');
  }
  const sni = node.servername || node.sni;
  if (sni) q.push(`sni=${enc(sni)}`);
  if (node.alpn) q.push(`alpn=${enc(node.alpn.join(','))}`);
  if (node['client-fingerprint']) q.push(`fp=${enc(node['client-fingerprint'])}`);
  const net = node.network || 'tcp';
  q.push(`type=${net}`);
  if (net === 'ws') {
    const o = node['ws-opts'] || {};
    if (o.path) q.push(`path=${enc(o.path)}`);
    if (o.headers && o.headers.Host) q.push(`host=${enc(o.headers.Host)}`);
  } else if (net === 'grpc') {
    const o = node['grpc-opts'] || {};
    if (o['grpc-service-name']) q.push(`serviceName=${enc(o['grpc-service-name'])}`);
  }
  if (node['skip-cert-verify']) q.push('allowInsecure=1');
  return q.join('&');
}

function nodeToLink(node) {
  switch (node.type) {
    case 'ss': {
      const userinfo = U.b64encodeUrl(`${node.cipher}:${node.password}`);
      let link = `ss://${userinfo}@${hostport(node)}`;
      if (node.plugin) {
        const o = node['plugin-opts'] || {};
        let pluginStr = '';
        if (node.plugin === 'obfs') {
          pluginStr = `obfs-local;obfs=${o.mode || 'http'}${o.host ? ';obfs-host=' + o.host : ''}`;
        } else if (node.plugin === 'v2ray-plugin') {
          pluginStr = `v2ray-plugin;mode=${o.mode || 'websocket'}${o.tls ? ';tls' : ''}${o.host ? ';host=' + o.host : ''}${o.path ? ';path=' + o.path : ''}`;
        } else {
          pluginStr = node.plugin;
        }
        link += `?plugin=${enc(pluginStr)}`;
      }
      return link + frag(node.name);
    }
    case 'ssr': {
      const pass = U.b64encodeUrl(node.password);
      let main = `${node.server}:${node.port}:${node.protocol}:${node.cipher}:${node.obfs}:${pass}`;
      const params = [];
      if (node['obfs-param']) params.push(`obfsparam=${U.b64encodeUrl(node['obfs-param'])}`);
      if (node['protocol-param']) params.push(`protoparam=${U.b64encodeUrl(node['protocol-param'])}`);
      if (node.name) params.push(`remarks=${U.b64encodeUrl(node.name)}`);
      main += '/?' + params.join('&');
      return 'ssr://' + U.b64encodeUrl(main);
    }
    case 'vmess': {
      const cfg = {
        v: '2',
        ps: node.name,
        add: node.server,
        port: String(node.port),
        id: node.uuid,
        aid: String(node.alterId || 0),
        scy: node.cipher || 'auto',
        net: node.network || 'tcp',
        type: 'none',
        host: '',
        path: '',
        tls: node.tls ? 'tls' : '',
        sni: node.servername || '',
      };
      if (node.network === 'ws') {
        const o = node['ws-opts'] || {};
        cfg.path = o.path || '/';
        if (o.headers && o.headers.Host) cfg.host = o.headers.Host;
      } else if (node.network === 'grpc') {
        cfg.path = (node['grpc-opts'] || {})['grpc-service-name'] || '';
      }
      if (node.alpn) cfg.alpn = node.alpn.join(',');
      if (node['client-fingerprint']) cfg.fp = node['client-fingerprint'];
      return 'vmess://' + U.b64encode(JSON.stringify(cfg));
    }
    case 'vless': {
      const q = streamQuery(node);
      return `vless://${enc(node.uuid)}@${hostport(node)}?${q}${frag(node.name)}`;
    }
    case 'trojan': {
      const q = streamQuery({ ...node, tls: true });
      return `trojan://${enc(node.password)}@${hostport(node)}?${q}${frag(node.name)}`;
    }
    case 'hysteria': {
      const q = [];
      if (node['auth-str']) q.push(`auth=${enc(node['auth-str'])}`);
      if (node.up) q.push(`upmbps=${enc(node.up)}`);
      if (node.down) q.push(`downmbps=${enc(node.down)}`);
      if (node.protocol) q.push(`protocol=${enc(node.protocol)}`);
      if (node.sni) q.push(`peer=${enc(node.sni)}`);
      if (node.alpn) q.push(`alpn=${enc(node.alpn.join(','))}`);
      if (node.obfs) q.push(`obfs=${enc(node.obfs)}`);
      if (node['skip-cert-verify']) q.push('insecure=1');
      return `hysteria://${hostport(node)}?${q.join('&')}${frag(node.name)}`;
    }
    case 'hysteria2': {
      const q = [];
      if (node.sni) q.push(`sni=${enc(node.sni)}`);
      if (node['skip-cert-verify']) q.push('insecure=1');
      if (node.obfs) { q.push(`obfs=${enc(node.obfs)}`); if (node['obfs-password']) q.push(`obfs-password=${enc(node['obfs-password'])}`); }
      if (node.alpn) q.push(`alpn=${enc(node.alpn.join(','))}`);
      return `hysteria2://${enc(node.password)}@${hostport(node)}${q.length ? '?' + q.join('&') : ''}${frag(node.name)}`;
    }
    case 'tuic': {
      const q = [];
      if (node['congestion-controller']) q.push(`congestion_control=${enc(node['congestion-controller'])}`);
      if (node['udp-relay-mode']) q.push(`udp_relay_mode=${enc(node['udp-relay-mode'])}`);
      if (node.alpn) q.push(`alpn=${enc(node.alpn.join(','))}`);
      if (node.sni) q.push(`sni=${enc(node.sni)}`);
      if (node['skip-cert-verify']) q.push('allow_insecure=1');
      return `tuic://${enc(node.uuid)}:${enc(node.password)}@${hostport(node)}${q.length ? '?' + q.join('&') : ''}${frag(node.name)}`;
    }
    case 'anytls': {
      const q = [];
      if (node.sni) q.push(`sni=${enc(node.sni)}`);
      if (node.alpn) q.push(`alpn=${enc(node.alpn.join(','))}`);
      if (node['client-fingerprint']) q.push(`fp=${enc(node['client-fingerprint'])}`);
      if (node['skip-cert-verify']) q.push('insecure=1');
      return `anytls://${enc(node.password)}@${hostport(node)}${q.length ? '?' + q.join('&') : ''}${frag(node.name)}`;
    }
    case 'http': {
      const auth = node.username ? `${enc(node.username)}:${enc(node.password || '')}@` : '';
      return `${node.tls ? 'https' : 'http'}://${auth}${hostport(node)}${frag(node.name)}`;
    }
    case 'socks5': {
      const auth = node.username ? `${U.b64encodeUrl(`${node.username}:${node.password || ''}`)}@` : '';
      return `socks://${auth}${hostport(node)}${frag(node.name)}`;
    }
    case 'wireguard': {
      const q = [];
      if (node['public-key']) q.push(`publickey=${enc(node['public-key'])}`);
      if (node['pre-shared-key']) q.push(`presharedkey=${enc(node['pre-shared-key'])}`);
      const addrs = [node.ip, node.ipv6].filter(Boolean).join(',');
      if (addrs) q.push(`address=${enc(addrs)}`);
      if (node.mtu) q.push(`mtu=${node.mtu}`);
      if (node.reserved) q.push(`reserved=${enc(node.reserved.join(','))}`);
      return `wireguard://${enc(node['private-key'] || '')}@${hostport(node)}?${q.join('&')}${frag(node.name)}`;
    }
    case 'snell':
      return `snell://${enc(node.psk || '')}@${hostport(node)}?version=${node.version || 1}${frag(node.name)}`;
    default:
      return null;
  }
}

function buildLinks(nodes) {
  return nodes.map(nodeToLink).filter(Boolean).join('\n');
}

function buildBase64(nodes) {
  return U.b64encode(buildLinks(nodes) + '\n');
}

module.exports = { nodeToLink, buildLinks, buildBase64 };
