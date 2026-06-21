'use strict';

/**
 * Quantumult X 配置生成器（[server_local] + [policy] + [filter_local]）。
 * 支持类型：ss, ssr, vmess, vless, trojan, http
 * 不支持类型会被跳过。
 */

function nodeToQX(node) {
  const addr = `${node.server}:${node.port}`;
  switch (node.type) {
    case 'ss': {
      const parts = [`shadowsocks=${addr}`, `method=${node.cipher}`, `password=${node.password}`];
      if (node.plugin === 'obfs') {
        const o = node['plugin-opts'] || {};
        parts.push(`obfs=${o.mode || 'http'}`);
        if (o.host) parts.push(`obfs-host=${o.host}`);
      }
      parts.push('fast-open=false', `udp-relay=${node.udp ? 'true' : 'false'}`, `tag=${node.name}`);
      return parts.join(', ');
    }
    case 'ssr': {
      const parts = [
        `shadowsocks=${addr}`, `method=${node.cipher}`, `password=${node.password}`,
        `ssr-protocol=${node.protocol}`,
      ];
      if (node['protocol-param']) parts.push(`ssr-protocol-param=${node['protocol-param']}`);
      parts.push(`obfs=${node.obfs}`);
      if (node['obfs-param']) parts.push(`obfs-host=${node['obfs-param']}`);
      parts.push('fast-open=false', `udp-relay=${node.udp ? 'true' : 'false'}`, `tag=${node.name}`);
      return parts.join(', ');
    }
    case 'vmess': {
      const parts = [`vmess=${addr}`, `method=${node.cipher === 'auto' ? 'chacha20-poly1305' : node.cipher}`, `password=${node.uuid}`];
      if (node.network === 'ws') {
        parts.push(node.tls ? 'obfs=wss' : 'obfs=ws');
        const o = node['ws-opts'] || {};
        parts.push(`obfs-uri=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`obfs-host=${o.headers.Host}`);
      } else if (node.tls) {
        parts.push('obfs=over-tls');
        if (node.servername) parts.push(`obfs-host=${node.servername}`);
      }
      if (node.tls) parts.push(`tls-verification=${node['skip-cert-verify'] ? 'false' : 'true'}`);
      parts.push('fast-open=false', `udp-relay=${node.udp ? 'true' : 'false'}`, `tag=${node.name}`);
      return parts.join(', ');
    }
    case 'vless': {
      const parts = [`vless=${addr}`, `method=none`, `password=${node.uuid}`];
      if (node.flow) parts.push(`flow=${node.flow}`);
      if (node.network === 'ws') {
        parts.push(node.tls ? 'obfs=wss' : 'obfs=ws');
        const o = node['ws-opts'] || {};
        parts.push(`obfs-uri=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`obfs-host=${o.headers.Host}`);
      } else if (node.tls) {
        parts.push('obfs=over-tls');
        if (node.servername) parts.push(`obfs-host=${node.servername}`);
      }
      if (node.tls) parts.push(`tls-verification=${node['skip-cert-verify'] ? 'false' : 'true'}`);
      parts.push('fast-open=false', `udp-relay=${node.udp ? 'true' : 'false'}`, `tag=${node.name}`);
      return parts.join(', ');
    }
    case 'trojan': {
      const parts = [`trojan=${addr}`, `password=${node.password}`, 'over-tls=true'];
      if (node.sni) parts.push(`tls-host=${node.sni}`);
      parts.push(`tls-verification=${node['skip-cert-verify'] ? 'false' : 'true'}`);
      if (node.network === 'ws') {
        parts.push('obfs=wss');
        const o = node['ws-opts'] || {};
        parts.push(`obfs-uri=${o.path || '/'}`);
        if (o.headers && o.headers.Host) parts.push(`obfs-host=${o.headers.Host}`);
      }
      parts.push('fast-open=false', `udp-relay=${node.udp ? 'true' : 'false'}`, `tag=${node.name}`);
      return parts.join(', ');
    }
    case 'http': {
      const parts = [`http=${addr}`];
      if (node.username) parts.push(`username=${node.username}`);
      if (node.password) parts.push(`password=${node.password}`);
      if (node.tls) parts.push('over-tls=true', `tls-verification=${node['skip-cert-verify'] ? 'false' : 'true'}`);
      parts.push(`tag=${node.name}`);
      return parts.join(', ');
    }
    default:
      return null;
  }
}

function buildConfig(nodes) {
  const servers = [];
  const names = [];
  const seen = new Map();
  for (const n of nodes) {
    let name = n.name;
    if (seen.has(name)) { const c = seen.get(name) + 1; seen.set(name, c); name = `${name}_${c}`; }
    else seen.set(name, 0);
    const node = { ...n, name };
    const line = nodeToQX(node);
    if (!line) continue;
    servers.push(line);
    names.push(name);
  }

  const policyNames = names.join(', ');
  return [
    '[general]',
    'network_check_url=http://www.gstatic.com/generate_204',
    'server_check_url=http://www.gstatic.com/generate_204',
    '',
    '[server_local]',
    ...servers,
    '',
    '[policy]',
    `static=🚀 节点选择, ♻️ 自动选择, direct${names.length ? ', ' + policyNames : ''}`,
    `url-latency-benchmark=♻️ 自动选择, ${policyNames || 'direct'}, check-interval=300, tolerance=50`,
    '',
    '[filter_local]',
    'geoip, cn, direct',
    'final, 🚀 节点选择',
    '',
  ].join('\n');
}

module.exports = { buildConfig, nodeToQX };
