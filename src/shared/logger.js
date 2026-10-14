/**
 * 结构化日志。默认输出到 stderr，
 * 以保证 stdio 传输模式下 stdout 只承载 JSON-RPC 报文。
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger({ level = 'info', base = {}, sink = process.stderr } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const write = (name, payload) => {
    if (LEVELS[name] < threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: name,
      ...base,
      ...payload
    });
    try {
      sink.write(line + '\n');
    } catch {
      /* 日志通道不可用时静默降级，绝不影响主流程 */
    }
  };

  return {
    level,
    debug: (msg, extra) => write('debug', { msg, ...extra }),
    info: (msg, extra) => write('info', { msg, ...extra }),
    warn: (msg, extra) => write('warn', { msg, ...extra }),
    error: (msg, extra) => write('error', { msg, ...extra }),
    child: (extra) => createLogger({ level, base: { ...base, ...extra }, sink })
  };
}

export const logger = createLogger({ level: process.env.MCP_LOG_LEVEL || 'info' });
