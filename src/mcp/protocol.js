export const JSONRPC = '2.0';
export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_INFO = { name: 'blender-mcp-slots', version: '1.2.0' };

export const ok = (id, result) => ({ jsonrpc: JSONRPC, id: id ?? null, result });
export const errorResponse = (id, code, message, data) => ({
  jsonrpc: JSONRPC,
  id: id ?? null,
  error: { code, message, data }
});

/** 解析入站报文：支持单条对象与批量数组。 */
export function parseIncoming(raw) {
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, batch: Array.isArray(parsed), payload: parsed };
  } catch (e) {
    return { ok: false, batch: false, payload: null, parseError: e.message };
  }
}

const TYPE_CHECK = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean'
};

/** 轻量参数校验（零依赖）：覆盖 MCP 工具所需的常见约束。 */
export function validateParams(params, schema = {}) {
  if (!schema || schema.type !== 'object') return { ok: true };
  const value = params ?? {};
  if (!TYPE_CHECK.object(value)) return { ok: false, message: 'params must be an object' };

  for (const key of schema.required || []) {
    if (value[key] === undefined) return { ok: false, message: `missing required param: ${key}` };
  }
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined) continue;
    const check = TYPE_CHECK[rule.type];
    if (check && !check(value[key])) return { ok: false, message: `param "${key}" must be ${rule.type}` };
    if (rule.enum && !rule.enum.includes(value[key])) {
      return { ok: false, message: `param "${key}" must be one of ${JSON.stringify(rule.enum)}` };
    }
    if (typeof value[key] === 'number') {
      if (rule.minimum !== undefined && value[key] < rule.minimum) {
        return { ok: false, message: `param "${key}" must be >= ${rule.minimum}` };
      }
      if (rule.maximum !== undefined && value[key] > rule.maximum) {
        return { ok: false, message: `param "${key}" must be <= ${rule.maximum}` };
      }
    }
  }
  return { ok: true };
}
