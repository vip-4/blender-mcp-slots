import { ok, errorResponse, validateParams, SERVER_INFO, PROTOCOL_VERSION } from './protocol.js';
import { AppError, ErrorCode } from '../shared/errors.js';
import { withTimeout } from '../shared/guard.js';

/**
 * JSON-RPC 方法调度器：统一负责 参数校验 / 超时 / 错误码映射 / 指标。
 * MCP 的 tools/list、tools/call 与内部直连方法共用同一条链路。
 */
export class Dispatcher {
  constructor({ logger, metrics, timeoutMs = 5000 } = {}) {
    this.logger = logger;
    this.metrics = metrics;
    this.timeoutMs = timeoutMs;
    this.methods = new Map();

    this.method('ping', { description: '健康检查', inputSchema: { type: 'object', properties: {} }, handler: () => ({ pong: true }) });
    this.method('initialize', {
      description: 'MCP 握手',
      inputSchema: { type: 'object', properties: {} },
      handler: () => ({
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: { listChanged: true } }
      })
    });
  }

  method(name, definition) {
    this.methods.set(name, definition);
  }

  listTools() {
    return [...this.methods.entries()]
      .filter(([name]) => !['ping', 'initialize'].includes(name))
      .map(([name, def]) => ({
        name,
        description: def.description || '',
        inputSchema: def.inputSchema || { type: 'object', properties: {} }
      }));
  }

  async handle(request) {
    const { id, method, params } = request || {};
    if (!method) return errorResponse(id, ErrorCode.InvalidRequest, 'method is required');

    const def = this.methods.get(method);
    if (!def) return errorResponse(id, ErrorCode.MethodNotFound, `method not found: ${method}`);

    const validation = validateParams(params, def.inputSchema);
    if (!validation.ok) return errorResponse(id, ErrorCode.InvalidParams, validation.message);

    try {
      const result = await withTimeout(Promise.resolve(def.handler(params || {})), this.timeoutMs, `method ${method} timed out`);
      return ok(id, result ?? { ok: true });
    } catch (e) {
      const code = e instanceof AppError ? e.code : ErrorCode.InternalError;
      this.logger?.warn('method failed', { method, code, message: e.message });
      return errorResponse(id, code, e.message, e.data);
    }
  }
}
