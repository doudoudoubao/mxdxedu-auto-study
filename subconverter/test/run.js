'use strict';

/**
 * 端到端自测：覆盖所有节点类型的解析 + 所有目标格式的生成。
 * 运行: node test/run.js
 */

const assert = require('assert');
const U = require('../src/util');
const { parseLine, parseAll } = require('../src/parsers');
const { convert, TARGETS } = require('../src/convert');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + name);
  } catch (e) {
    fail++;
    console.log('  ✗ ' + name + '  ->  ' + e.message);
  }
}

// 构造各类型示例链接
const vmessCfg = {
  v: '2', ps: '测试VMess', add: 'a.example.com', port: '443', id: '11111111-2222-3333-4444-555555555555',
  aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'a.example.com', path: '/ray', tls: 'tls', sni: 'a.example.com',
};
const VMESS = 'vmess://' + U.b64encode(JSON.stringify(vmessCfg));

const SAMPLES = {
  ss: 'ss://' + U.b64encodeUrl('aes-256-gcm:password123') + '@ss.example.com:8388#测试SS',
  ssWithPlugin: 'ss://' + U.b64encodeUrl('chacha20-ietf-poly1305:pw') + '@ss2.example.com:443?plugin=' +
    encodeURIComponent('obfs-local;obfs=tls;obfs-host=www.bing.com') + '#SS插件',
  ssr: 'ssr://' + U.b64encodeUrl('ssr.example.com:8080:auth_aes128_md5:aes-256-cfb:tls1.2_ticket_auth:' +
    U.b64encodeUrl('passwd') + '/?obfsparam=' + U.b64encodeUrl('obfs.host') + '&remarks=' + U.b64encodeUrl('测试SSR')),
  vmess: VMESS,
  vless: 'vless://11111111-2222-3333-4444-555555555555@v.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=abcdefg&sid=88&type=grpc&serviceName=grpcsvc&flow=xtls-rprx-vision#测试VLESS',
  trojan: 'trojan://password123@t.example.com:443?sni=t.example.com&type=ws&path=%2Ftrojan&host=t.example.com&allowInsecure=1#测试Trojan',
  hysteria: 'hysteria://h.example.com:443?protocol=udp&auth=secret&peer=h.example.com&upmbps=50&downmbps=200&alpn=h3&insecure=1#测试HY1',
  hysteria2: 'hysteria2://password@h2.example.com:443?sni=h2.example.com&insecure=1&obfs=salamander&obfs-password=ob123#测试HY2',
  tuic: 'tuic://11111111-2222-3333-4444-555555555555:tuicpass@tuic.example.com:443?congestion_control=bbr&alpn=h3&sni=tuic.example.com&udp_relay_mode=native&allow_insecure=1#测试TUIC',
  wireguard: 'wireguard://' + encodeURIComponent('privkeybase64==') + '@wg.example.com:51820?publickey=pubkeybase64&address=10.0.0.2,fd00::2&mtu=1420&reserved=1,2,3#测试WG',
  http: 'http://user:pass@proxy.example.com:8080#测试HTTP',
  https: 'https://user:pass@proxy.example.com:443?sni=proxy.example.com#测试HTTPS',
  socks: 'socks://' + U.b64encodeUrl('user:pass') + '@socks.example.com:1080#测试SOCKS',
  snell: 'snell://psk12345@snell.example.com:443?version=4&obfs=http&obfs-host=www.bing.com#测试Snell',
  anytls: 'anytls://password@any.example.com:443?sni=any.example.com&insecure=1#测试AnyTLS',
};

console.log('\n== 解析测试 ==');

test('SS 基础解析', () => {
  const n = parseLine(SAMPLES.ss);
  assert.strictEqual(n.type, 'ss');
  assert.strictEqual(n.server, 'ss.example.com');
  assert.strictEqual(n.port, 8388);
  assert.strictEqual(n.cipher, 'aes-256-gcm');
  assert.strictEqual(n.password, 'password123');
  assert.strictEqual(n.name, '测试SS');
});

test('SS 插件解析', () => {
  const n = parseLine(SAMPLES.ssWithPlugin);
  assert.strictEqual(n.plugin, 'obfs');
  assert.strictEqual(n['plugin-opts'].mode, 'tls');
  assert.strictEqual(n['plugin-opts'].host, 'www.bing.com');
});

test('SSR 解析', () => {
  const n = parseLine(SAMPLES.ssr);
  assert.strictEqual(n.type, 'ssr');
  assert.strictEqual(n.server, 'ssr.example.com');
  assert.strictEqual(n.protocol, 'auth_aes128_md5');
  assert.strictEqual(n.cipher, 'aes-256-cfb');
  assert.strictEqual(n.obfs, 'tls1.2_ticket_auth');
  assert.strictEqual(n.password, 'passwd');
  assert.strictEqual(n.name, '测试SSR');
});

test('VMess 解析', () => {
  const n = parseLine(SAMPLES.vmess);
  assert.strictEqual(n.type, 'vmess');
  assert.strictEqual(n.uuid, '11111111-2222-3333-4444-555555555555');
  assert.strictEqual(n.network, 'ws');
  assert.strictEqual(n.tls, true);
  assert.strictEqual(n['ws-opts'].path, '/ray');
  assert.strictEqual(n['ws-opts'].headers.Host, 'a.example.com');
});

test('VLESS Reality+gRPC 解析', () => {
  const n = parseLine(SAMPLES.vless);
  assert.strictEqual(n.type, 'vless');
  assert.strictEqual(n.flow, 'xtls-rprx-vision');
  assert.strictEqual(n.tls, true);
  assert.strictEqual(n.network, 'grpc');
  assert.strictEqual(n['grpc-opts']['grpc-service-name'], 'grpcsvc');
  assert.strictEqual(n['reality-opts']['public-key'], 'abcdefg');
  assert.strictEqual(n['reality-opts']['short-id'], '88');
  assert.strictEqual(n.servername, 'www.microsoft.com');
});

test('Trojan WS 解析', () => {
  const n = parseLine(SAMPLES.trojan);
  assert.strictEqual(n.type, 'trojan');
  assert.strictEqual(n.password, 'password123');
  assert.strictEqual(n.network, 'ws');
  assert.strictEqual(n['ws-opts'].path, '/trojan');
  assert.strictEqual(n['skip-cert-verify'], true);
});

test('Hysteria v1 解析', () => {
  const n = parseLine(SAMPLES.hysteria);
  assert.strictEqual(n.type, 'hysteria');
  assert.strictEqual(n['auth-str'], 'secret');
  assert.strictEqual(n.up, '50');
  assert.strictEqual(n.down, '200');
  assert.strictEqual(n['skip-cert-verify'], true);
});

test('Hysteria2 解析', () => {
  const n = parseLine(SAMPLES.hysteria2);
  assert.strictEqual(n.type, 'hysteria2');
  assert.strictEqual(n.password, 'password');
  assert.strictEqual(n.obfs, 'salamander');
  assert.strictEqual(n['obfs-password'], 'ob123');
});

test('TUIC 解析', () => {
  const n = parseLine(SAMPLES.tuic);
  assert.strictEqual(n.type, 'tuic');
  assert.strictEqual(n.uuid, '11111111-2222-3333-4444-555555555555');
  assert.strictEqual(n.password, 'tuicpass');
  assert.strictEqual(n['congestion-controller'], 'bbr');
});

test('WireGuard 解析', () => {
  const n = parseLine(SAMPLES.wireguard);
  assert.strictEqual(n.type, 'wireguard');
  assert.strictEqual(n['private-key'], 'privkeybase64==');
  assert.strictEqual(n['public-key'], 'pubkeybase64');
  assert.strictEqual(n.ip, '10.0.0.2');
  assert.strictEqual(n.ipv6, 'fd00::2');
  assert.deepStrictEqual(n.reserved, [1, 2, 3]);
});

test('HTTP 解析', () => {
  const n = parseLine(SAMPLES.http);
  assert.strictEqual(n.type, 'http');
  assert.strictEqual(n.username, 'user');
  assert.strictEqual(n.password, 'pass');
});

test('SOCKS 解析', () => {
  const n = parseLine(SAMPLES.socks);
  assert.strictEqual(n.type, 'socks5');
  assert.strictEqual(n.username, 'user');
  assert.strictEqual(n.password, 'pass');
});

test('Snell 解析', () => {
  const n = parseLine(SAMPLES.snell);
  assert.strictEqual(n.type, 'snell');
  assert.strictEqual(n.psk, 'psk12345');
  assert.strictEqual(n.version, 4);
});

test('AnyTLS 解析', () => {
  const n = parseLine(SAMPLES.anytls);
  assert.strictEqual(n.type, 'anytls');
  assert.strictEqual(n.password, 'password');
  assert.strictEqual(n['skip-cert-verify'], true);
});

console.log('\n== Base64 订阅解析测试 ==');
test('整段 Base64 订阅解码', () => {
  const list = Object.values(SAMPLES).join('\n');
  const b64 = U.b64encode(list);
  const { nodes, errors } = parseAll(b64);
  assert.ok(nodes.length >= 14, '应解析出至少 14 个节点，实际 ' + nodes.length);
  assert.strictEqual(errors.length, 0, '不应有错误: ' + JSON.stringify(errors));
});

console.log('\n== 生成器测试（全部目标格式）==');
const allLinks = Object.values(SAMPLES).join('\n');

for (const target of Object.keys(TARGETS)) {
  test(`生成 ${target}`, () => {
    const r = convert(allLinks, target);
    assert.ok(typeof r.output === 'string' && r.output.length > 0, '输出为空');
    assert.ok(r.count >= 1, '节点数为 0');
  });
}

test('Clash 输出为合法 YAML 结构（含 proxies 与 proxy-groups）', () => {
  const r = convert(allLinks, 'clash');
  assert.ok(r.output.includes('proxies:'));
  assert.ok(r.output.includes('proxy-groups:'));
  assert.ok(r.output.includes('type: "vless"'));
});

test('sing-box 输出为合法 JSON', () => {
  const r = convert(allLinks, 'singbox');
  const obj = JSON.parse(r.output);
  assert.ok(Array.isArray(obj.outbounds));
  assert.ok(obj.outbounds.length > 2);
});

test('v2ray Base64 可往返解码', () => {
  const r = convert(allLinks, 'v2ray');
  const decoded = U.b64decode(r.output);
  assert.ok(decoded.includes('vmess://'));
  assert.ok(decoded.includes('vless://'));
  const { nodes } = parseAll(r.output); // 直接喂回 base64
  assert.ok(nodes.length >= 10, '往返后节点数过少: ' + nodes.length);
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
