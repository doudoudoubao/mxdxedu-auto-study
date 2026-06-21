'use strict';

/**
 * Surge 配置生成器。
 * 支持类型：ss, vmess, trojan, http, socks5, snell, hysteria2, tuic, wireguard(基础)
 * 不支持类型（vless, ssr, hysteria v1, anytls）会被跳过并记录。
 */

function kv(k, v) {
  return `${k}=${v}`;
}

function commonTLS(node, parts) {
  if (node.servername || node.sni) parts.push(kv('sni', node.servername || node.sni));
  if (node['skip-cert-verify']) parts.push(kv('skip-cert-verify', 'true'));
}

function wsOpts(node, parts) {
  if (node.network === 'ws') {
    parts.push(kv('ws', 'true'));
    const o = node['ws-opts'] || {};
    if (o.path) parts.push(kv('ws-path', o.path));
    if (o.headers && o.headers.Host) parts.push(kv('ws-headers', `Host:${o.headers.Host}`));
  }
}

function nodeToSurge(node) {
  const h = node.server, p = node.port;
  switch (node.type) {
    case 'ss': {
      const parts = [`ss`, h, p, kv('encrypt-method', node.cipher), kv('password', node.password)];
      if (node.udp) parts.push(kv('udp-relay', 'true'));
      if (node.plugin === 'obfs') {
        const o = node['plugin-opts'] || {};
        parts.push(kv('obfs', o.mode || 'http'));
        if (o.host) parts.push(kv('obfs-host', o.host));
      }
      return parts.join(', ');
    }
    case 'vmess': {
      const parts = [`vmess`, h, p, kv('username', node.uuid)];
      if (node.tls) { parts.push(kv('tls', 'true')); commonTLS(node, parts); }
      if (node.alpn) parts.push(kv('alpn', node.alpn.join(',')));
      wsOpts(node, parts);
      if (node.udp) parts.push(kv('udp-relay', 'true'));
      return parts.join(', ');
    }
    case 'trojan': {
      const parts = [`trojan`, h, p, kv('password', node.password)];
      commonTLS(node, parts);
      wsOpts(node, parts);
      if (node.udp) parts.push(kv('udp-relay', 'true'));
      return parts.join(', ');
    }
    case 'http': {
      const parts = [`http`, h, p];
      if (node.username) parts.push(node.username);
      if (node.password) parts.push(node.password);
      if (node.tls) { parts.push(kv('tls', 'true')); commonTLS(node, parts); }
      return parts.join(', ');
    }
    case 'socks5': {
      const t = node.tls ? 'socks5-tls' : 'socks5';
      const parts = [t, h, p];
      if (node.username) parts.push(node.username);
      if (node.password) parts.push(node.password);
      if (node.tls) commonTLS(node, parts);
      if (node.udp) parts.push(kv('udp-relay', 'true'));
      return parts.join(', ');
    }
    case 'snell': {
      const parts = [`snell`, h, p, kv('psk', node.psk), kv('version', node.version || 4)];
      if (node['obfs-opts'] && node['obfs-opts'].mode) {
        parts.push(kv('obfs', node['obfs-opts'].mode));
        if (node['obfs-opts'].host) parts.push(kv('obfs-host', node['obfs-opts'].host));
      }
      if (node.udp) parts.push(kv('udp-relay', 'true'));
      return parts.join(', ');
    }
    case 'hysteria2': {
      const parts = [`hysteria2`, h, p, kv('password', node.password)];
      commonTLS(node, parts);
      if (node.down) parts.push(kv('download-bandwidth', String(node.down).replace(/\D/g, '') || node.down));
      return parts.join(', ');
    }
    case 'tuic': {
      const parts = [`tuic-v5`, h, p, kv('uuid', node.uuid), kv('password', node.password)];
      commonTLS(node, parts);
      if (node.alpn) parts.push(kv('alpn', node.alpn.join(',')));
      return parts.join(', ');
    }
    case 'wireguard': {
      // Surge WireGuard 需配合 [WireGuard] 段，这里给出 proxy 引用 + 段定义
      return { __wireguard: true };
    }
    default:
      return null; // vless / ssr / hysteria(v1) / anytls 不支持
  }
}

function buildConfig(nodes) {
  const lines = [];
  const names = [];
  const wgSections = [];
  const seen = new Map();

  for (const n of nodes) {
    const r = nodeToSurge(n);
    if (!r) continue;
    let name = n.name;
    if (seen.has(name)) {
      const c = seen.get(name) + 1; seen.set(name, c); name = `${name}_${c}`;
    } else seen.set(name, 0);

    if (r && r.__wireguard) {
      const sec = `wg-${name.replace(/\s+/g, '-')}`;
      wgSections.push(
        `[WireGuard ${sec}]\n` +
        `private-key = ${n['private-key'] || ''}\n` +
        `self-ip = ${n.ip || '10.0.0.2'}\n` +
        (n.ipv6 ? `self-ip-v6 = ${n.ipv6}\n` : '') +
        `peer = (public-key = ${n['public-key'] || ''}, endpoint = ${n.server}:${n.port}${n['pre-shared-key'] ? ', preshared-key = ' + n['pre-shared-key'] : ''})\n`
      );
      lines.push(`${name} = wireguard, section-name=${sec}`);
    } else {
      lines.push(`${name} = ${r}`);
    }
    names.push(name);
  }

  const groupNames = names.length ? names.join(', ') : 'DIRECT';
  return [
    '#!MANAGED-CONFIG',
    '',
    '[General]',
    'loglevel = notify',
    'dns-server = 223.5.5.5, 119.29.29.29, system',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local',
    'ipv6 = false',
    '',
    ...wgSections,
    '[Proxy]',
    'DIRECT = direct',
    ...lines,
    '',
    '[Proxy Group]',
    `🚀 节点选择 = select, ♻️ 自动选择, DIRECT, ${groupNames}`,
    `♻️ 自动选择 = url-test, ${groupNames}, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50`,
    `🐟 漏网之鱼 = select, 🚀 节点选择, DIRECT, ${groupNames}`,
    '',
    '[Rule]',
    'DOMAIN-SUFFIX,local,DIRECT',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'GEOIP,CN,DIRECT',
    'FINAL,🐟 漏网之鱼',
    '',
  ].join('\n');
}

module.exports = { buildConfig, nodeToSurge };
