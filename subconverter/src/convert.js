'use strict';

const { parseAll } = require('./parsers');
const clash = require('./generators/clash');
const singbox = require('./generators/singbox');
const surge = require('./generators/surge');
const quantumultx = require('./generators/quantumultx');
const loon = require('./generators/loon');
const links = require('./generators/links');

const TARGETS = {
  clash: { label: 'Clash / Mihomo', contentType: 'text/yaml; charset=utf-8' },
  'clash-proxies': { label: 'Clash 仅节点', contentType: 'text/yaml; charset=utf-8' },
  singbox: { label: 'sing-box', contentType: 'application/json; charset=utf-8' },
  surge: { label: 'Surge', contentType: 'text/plain; charset=utf-8' },
  quantumultx: { label: 'Quantumult X', contentType: 'text/plain; charset=utf-8' },
  loon: { label: 'Loon', contentType: 'text/plain; charset=utf-8' },
  v2ray: { label: 'V2Ray / 通用 Base64', contentType: 'text/plain; charset=utf-8' },
  links: { label: '明文节点链接', contentType: 'text/plain; charset=utf-8' },
  json: { label: 'JSON（调试/查看解析结果）', contentType: 'application/json; charset=utf-8' },
};

/**
 * 在节点名前加序号 emoji 旗帜（可选小功能）。这里仅做基础重命名钩子，默认不改名。
 */
function applyOptions(nodes, options = {}) {
  let result = nodes;
  if (options.includeKeyword) {
    const kw = options.includeKeyword.toLowerCase();
    result = result.filter((n) => n.name.toLowerCase().includes(kw));
  }
  if (options.excludeKeyword) {
    const kw = options.excludeKeyword.toLowerCase();
    result = result.filter((n) => !n.name.toLowerCase().includes(kw));
  }
  if (options.prefix) {
    result = result.map((n) => ({ ...n, name: options.prefix + n.name }));
  }
  return result;
}

/**
 * 主转换入口。
 * @param {string} raw  原始订阅文本（链接列表 / base64）
 * @param {string} target  目标格式
 * @param {object} options  过滤/重命名等
 */
function convert(raw, target, options = {}) {
  if (!TARGETS[target]) {
    throw new Error(`不支持的目标格式: ${target}`);
  }
  const { nodes, errors } = parseAll(raw);
  const filtered = applyOptions(nodes, options);

  let output;
  switch (target) {
    case 'clash':
      output = clash.buildConfig(filtered);
      break;
    case 'clash-proxies':
      output = clash.buildConfig(filtered, { proxiesOnly: true });
      break;
    case 'singbox':
      output = singbox.buildConfig(filtered);
      break;
    case 'surge':
      output = surge.buildConfig(filtered);
      break;
    case 'quantumultx':
      output = quantumultx.buildConfig(filtered);
      break;
    case 'loon':
      output = loon.buildConfig(filtered);
      break;
    case 'v2ray':
      output = links.buildBase64(filtered);
      break;
    case 'links':
      output = links.buildLinks(filtered);
      break;
    case 'json':
      output = JSON.stringify(filtered, null, 2);
      break;
    default:
      throw new Error('未知目标');
  }

  return {
    output,
    contentType: TARGETS[target].contentType,
    count: filtered.length,
    total: nodes.length,
    errors,
    byType: countByType(filtered),
  };
}

function countByType(nodes) {
  const m = {};
  for (const n of nodes) m[n.type] = (m[n.type] || 0) + 1;
  return m;
}

module.exports = { convert, TARGETS };
