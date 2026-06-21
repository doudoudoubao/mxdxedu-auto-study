'use strict';

const PROTOCOLS = [
  'SS', 'SSR', 'VMess', 'VLESS', 'Trojan', 'Hysteria', 'Hysteria2',
  'TUIC', 'WireGuard', 'HTTP(S)', 'SOCKS5', 'Snell', 'AnyTLS',
];

const $ = (id) => document.getElementById(id);
let selectedTarget = 'clash';
let lastOutput = '';
let lastTarget = 'clash';

// 渲染协议徽章
function renderBadges() {
  const box = $('typeBadges');
  box.innerHTML = PROTOCOLS.map((p) => `<span class="badge">${p}</span>`).join('');
}

// 加载目标格式
async function loadTargets() {
  let targets;
  try {
    const r = await fetch('/api/targets');
    targets = await r.json();
  } catch (e) {
    targets = [
      { key: 'clash', label: 'Clash / Mihomo' },
      { key: 'singbox', label: 'sing-box' },
      { key: 'surge', label: 'Surge' },
      { key: 'quantumultx', label: 'Quantumult X' },
      { key: 'loon', label: 'Loon' },
      { key: 'v2ray', label: 'V2Ray / Base64' },
      { key: 'links', label: '明文链接' },
      { key: 'json', label: 'JSON 调试' },
    ];
  }
  const box = $('targets');
  box.innerHTML = targets
    .map(
      (t) => `<div class="target${t.key === selectedTarget ? ' active' : ''}" data-key="${t.key}">
        <div class="t-key">${t.key}</div>
        <div class="t-label">${t.label}</div>
      </div>`
    )
    .join('');
  box.querySelectorAll('.target').forEach((el) => {
    el.addEventListener('click', () => {
      selectedTarget = el.dataset.key;
      box.querySelectorAll('.target').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function setStatus(msg, type) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
}

function getOptions() {
  const opts = {};
  if ($('include').value.trim()) opts.includeKeyword = $('include').value.trim();
  if ($('exclude').value.trim()) opts.excludeKeyword = $('exclude').value.trim();
  if ($('prefix').value) opts.prefix = $('prefix').value;
  return opts;
}

async function convert() {
  const input = $('input').value.trim();
  const url = $('url').value.trim();
  if (!input && !url) {
    setStatus('请先粘贴节点链接，或填写订阅地址。', 'err');
    return;
  }
  setStatus('⏳ 正在转换…', 'loading');
  $('convertBtn').disabled = true;

  try {
    const resp = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, url, target: selectedTarget, options: getOptions() }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '转换失败');

    lastOutput = data.output;
    lastTarget = selectedTarget;
    $('output').innerHTML = '<code></code>';
    $('output').querySelector('code').textContent = data.output;

    const typeStr = Object.entries(data.byType || {})
      .map(([k, v]) => `${k}×${v}`)
      .join('  ');
    $('meta').textContent = `成功 ${data.count}/${data.total} 个节点  ${typeStr}`;

    let statusMsg = `✅ 转换完成，共 ${data.count} 个节点。`;
    if (data.errors && data.errors.length) {
      statusMsg += `（${data.errors.length} 条无法解析已跳过）`;
    }
    setStatus(statusMsg, 'ok');

    $('copyBtn').disabled = false;
    $('downloadBtn').disabled = false;
    $('subBtn').disabled = !url;
  } catch (e) {
    setStatus('❌ ' + e.message, 'err');
  } finally {
    $('convertBtn').disabled = false;
  }
}

function copyResult() {
  if (!lastOutput) return;
  navigator.clipboard.writeText(lastOutput).then(
    () => setStatus('📋 已复制到剪贴板。', 'ok'),
    () => setStatus('复制失败，请手动选择文本复制。', 'err')
  );
}

function downloadResult() {
  if (!lastOutput) return;
  const ext = lastTarget === 'singbox' ? 'json' : lastTarget === 'clash' || lastTarget === 'clash-proxies' ? 'yaml' : 'conf';
  const blob = new Blob([lastOutput], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${lastTarget}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function generateSubLink() {
  const url = $('url').value.trim();
  if (!url) {
    setStatus('订阅链接功能需要先填写「订阅地址」。', 'err');
    return;
  }
  const base = location.origin + '/sub';
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('target', selectedTarget);
  const opts = getOptions();
  if (opts.includeKeyword) params.set('include', opts.includeKeyword);
  if (opts.excludeKeyword) params.set('exclude', opts.excludeKeyword);
  if (opts.prefix) params.set('prefix', opts.prefix);
  const link = `${base}?${params.toString()}`;
  navigator.clipboard.writeText(link).then(
    () => setStatus('🔗 订阅链接已复制，可直接填入客户端：' + link, 'ok'),
    () => {
      $('output').querySelector('code') ? ($('output').querySelector('code').textContent = link) : ($('output').textContent = link);
      setStatus('🔗 订阅链接（请手动复制）：', 'ok');
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  renderBadges();
  loadTargets();
  $('convertBtn').addEventListener('click', convert);
  $('copyBtn').addEventListener('click', copyResult);
  $('downloadBtn').addEventListener('click', downloadResult);
  $('subBtn').addEventListener('click', generateSubLink);
});
