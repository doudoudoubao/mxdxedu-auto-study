'use strict';

/**
 * 极简 YAML 序列化器（零依赖）。
 * 针对 Clash/Mihomo 配置的数据结构（map / array / 标量）做了适配。
 * 策略：所有字符串一律双引号包裹并转义，保证特殊字符（: # @ 等）安全。
 */

function quoteString(s) {
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

function isScalar(v) {
  return (
    v === null ||
    v === undefined ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

function emitScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return quoteString(v);
}

function emit(value, indent) {
  const pad = '  '.repeat(indent);
  const lines = [];

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${pad}- ${emitScalar(item)}`);
      } else if (Array.isArray(item)) {
        lines.push(`${pad}-`);
        lines.push(emit(item, indent + 1));
      } else {
        // 对象：首个键跟在 "- " 后
        const inner = emitMapInline(item, indent);
        lines.push(inner);
      }
    }
    return lines.join('\n');
  }

  // 对象
  return emitMap(value, indent);
}

function emitMap(obj, indent) {
  const pad = '  '.repeat(indent);
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (keys.length === 0) return `${pad}{}`;
  const lines = [];
  for (const k of keys) {
    const v = obj[k];
    if (isScalar(v)) {
      lines.push(`${pad}${k}: ${emitScalar(v)}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${pad}${k}: []`);
      } else {
        lines.push(`${pad}${k}:`);
        lines.push(emit(v, indent + 1));
      }
    } else {
      lines.push(`${pad}${k}:`);
      lines.push(emit(v, indent + 1));
    }
  }
  return lines.join('\n');
}

// 数组中的对象元素：以 "- key: val" 起始，后续键对齐
function emitMapInline(obj, indent) {
  const pad = '  '.repeat(indent);
  const childPad = '  '.repeat(indent + 1);
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (keys.length === 0) return `${pad}- {}`;
  const lines = [];
  keys.forEach((k, i) => {
    const v = obj[k];
    const prefix = i === 0 ? `${pad}- ` : childPad;
    if (isScalar(v)) {
      lines.push(`${prefix}${k}: ${emitScalar(v)}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${prefix}${k}: []`);
      } else {
        lines.push(`${prefix}${k}:`);
        lines.push(emit(v, indent + 2));
      }
    } else {
      lines.push(`${prefix}${k}:`);
      lines.push(emit(v, indent + 2));
    }
  });
  return lines.join('\n');
}

function dump(obj) {
  return emitMap(obj, 0) + '\n';
}

module.exports = { dump };
