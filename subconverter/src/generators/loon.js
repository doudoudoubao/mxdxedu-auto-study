'use strict';

/**
 * Loon 配置生成器。
 * 支持类型：ss, ssr, vmess, vless, trojan, http, socks5, hysteria2, tuic, wireguard(基础)
 */

function nodeToLoon(node) {
  const h = node.server, p = node.port;
  switch (node.type) {
    case 'ss': {
      const parts = [`Shadowsocks`, h, p, node.cipher, `"${node.password}"`];
      if (node.plugin === 'obfs') {
        const o = node['plugin-opts'] || {};
        parts.push(`obfs-name=${o.mode || 'http'}`);
        if (o.host) parts.push(`obfs-host=${o.host}`);
      }
      parts.push(`fast-open=false`, `udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'ssr': {
      const parts = [`ShadowsocksR`, h, p, node.cipher, `"${node.password}"`, `protocol=${node.protocol}`];
      if (node['protocol-param']) parts.push(`protocol-param=${node['protocol-param']}`);
      parts.push(`obfs=${node.obfs}`);
      if (node['obfs-param']) parts.push(`obfs-param=${node['obfs-param']}`);
      parts.push(`udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'vmess': {
      const parts = [`vmess`, h, p, node.cipher || 'auto', `"${node.uuid}"`];
      if (node.network === 'ws') {
        const o = node['ws-opts'] || {};
        parts.push('transport=ws', `path=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`host=${o.headers.Host}`);
      } else {
        parts.push('transport=tcp');
      }
      if (node.tls) {
        parts.push('over-tls=true');
        if (node.servername) parts.push(`tls-name=${node.servername}`);
        parts.push(`skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`);
      }
      parts.push(`udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'vless': {
      const parts = [`VLESS`, h, p, `"${node.uuid}"`];
      if (node.flow) parts.push(`flow=${node.flow}`);
      if (node.network === 'ws') {
        const o = node['ws-opts'] || {};
        parts.push('transport=ws', `path=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`host=${o.headers.Host}`);
      } else {
        parts.push('transport=tcp');
      }
      if (node.tls) {
        parts.push('over-tls=true');
        if (node.servername) parts.push(`tls-name=${node.servername}`);
        parts.push(`skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`);
      }
      if (node['reality-opts']) {
        parts.push(`public-key=${node['reality-opts']['public-key']}`);
        if (node['reality-opts']['short-id']) parts.push(`short-id=${node['reality-opts']['short-id']}`);
      }
      parts.push(`udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'trojan': {
      const parts = [`trojan`, h, p, `"${node.password}"`];
      if (node.sni) parts.push(`tls-name=${node.sni}`);
      if (node.network === 'ws') {
        const o = node['ws-opts'] || {};
        parts.push('transport=ws', `path=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`host=${o.headers.Host}`);
      }
      parts.push(`skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`, `udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'http': {
      const parts = [`http`, h, p];
      if (node.username) parts.push(node.username);
      if (node.password) parts.push(node.password);
      if (node.tls) parts.push('over-tls=true', `skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'socks5': {
      const parts = [`socks5`, h, p];
      if (node.username) parts.push(node.username);
      if (node.password) parts.push(node.password);
      if (node.tls) parts.push('over-tls=true');
      parts.push(`udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'hysteria2': {
      const parts = [`Hysteria2`, h, p, `"${node.password}"`];
      if (node.sni) parts.push(`sni=${node.sni}`);
      if (node.down) parts.push(`download-bandwidth=${String(node.down).replace(/\D/g, '') || 0}`);
      parts.push(`skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`, `udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'tuic': {
      const parts = [`tuic`, h, p, `"${node.uuid}"`, `"${node.password}"`];
      if (node.sni) parts.push(`sni=${node.sni}`);
      if (node.alpn) parts.push(`alpn=${node.alpn.join(':')}`);
      if (node['congestion-controller']) parts.push(`congestion-control=${node['congestion-controller']}`);
      parts.push(`skip-cert-verify=${node['skip-cert-verify'] ? 'true' : 'false'}`, `udp=${node.udp ? 'true' : 'false'}`);
      return parts.join(',');
    }
    case 'wireguard': {
      const parts = [`wireguard`, `interface-ip=${node.ip || '10.0.0.2'}`];
      if (node.ipv6) parts.push(`interface-ipv6=${node.ipv6}`);
      parts.push(`private-key="${node['private-key'] || ''}"`, `mtu=${node.mtu || 1420}`);
      parts.push(`peers=[{public-key="${node['public-key'] || ''}",endpoint=${node.server}:${node.port}${node['pre-shared-key'] ? ',preshared-key="' + node['pre-shared-key'] + '"' : ''},allowed-ips="0.0.0.0/0"}]`);
      return parts.join(',');
    }
    default:
      return null; // hysteria(v1) / snell / anytls 不支持
  }
}

function buildConfig(nodes) {
  const lines = [];
  const names = [];
  const seen = new Map();
  for (const n of nodes) {
    let name = n.name;
    if (seen.has(name)) { const c = seen.get(name) + 1; seen.set(name, c); name = `${name}_${c}`; }
    else seen.set(name, 0);
    const node = { ...n, name };
    const r = nodeToLoon(node);
    if (!r) continue;
    lines.push(`${name} = ${r}`);
    names.push(name);
  }

  const groupNames = names.length ? names.join(',') : 'DIRECT';
  return [
    '[General]',
    'ipv6 = false',
    'dns-server = 223.5.5.5,119.29.29.29',
    '',
    '[Proxy]',
    ...lines,
    '',
    '[Proxy Group]',
    `🚀 节点选择 = select,♻️ 自动选择,DIRECT,${groupNames}`,
    `♻️ 自动选择 = url-test,${groupNames},url=http://www.gstatic.com/generate_204,interval=300,tolerance=50`,
    '',
    '[Rule]',
    'GEOIP,CN,DIRECT',
    'FINAL,🚀 节点选择',
    '',
  ].join('\n');
}

module.exports = { buildConfig, nodeToLoon };
