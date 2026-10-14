/**
 * 统一错误模型：所有业务异常都携带稳定的机器可读 code，
 * 便于 MCP 客户端 / 前端做分类处理与重试决策。
 */
export const ErrorCode = {
  // 标准 JSON-RPC
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // 业务错误（保留 -32000 ~ -32099）
  GameNotFound: -32001,
  InvalidConfig: -32002,
  BetOutOfRange: -32003,
  SessionNotFound: -32004,
  RoundInFeature: -32005,
  RateLimited: -32006,
  BudgetExceeded: -32007,
  UpstreamUnavailable: -32010,
  Timeout: -32011
};

export class AppError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.data = data;
  }

  toJSON() {
    return { code: this.code, message: this.message, data: this.data };
  }
}

export const fail = (code, message, data) => new AppError(code, message, data);
