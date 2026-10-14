import { parseIncoming, errorResponse } from '../protocol.js';
import { ErrorCode } from '../../shared/errors.js';

/**
 * stdio 传输：MCP 客户端（Claude Desktop / Cursor / 其它 Agent）通过 stdio 拉起本服务时使用。
 * 严格保证 stdout 只输出 JSON-RPC 报文，日志走 stderr。
 */
export function startStdio({ dispatcher, logger }) {
  let buffer = '';

  const send = (msg) => {
    if (msg === undefined) return;
    try {
      process.stdout.write(`${JSON.stringify(msg)}\n`);
    } catch (e) {
      logger?.error('stdio write failed', { error: e.message });
    }
  };

  const handleLine = async (line) => {
    const parsed = parseIncoming(line);
    if (!parsed.ok) {
      send(errorResponse(null, ErrorCode.ParseError, `parse error: ${parsed.parseError}`));
      return;
    }
    if (parsed.batch) {
      const results = await Promise.all(parsed.payload.map((r) => dispatcher.handle(r)));
      send(results.filter(Boolean));
      return;
    }
    const req = parsed.payload;
    if (!req || typeof req !== 'object') {
      send(errorResponse(null, ErrorCode.InvalidRequest, 'invalid request'));
      return;
    }
    if (req.id === undefined) {
      await dispatcher.handle(req); // 通知类消息不回包
      return;
    }
    send(await dispatcher.handle(req));
  };

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleLine(line).catch((e) => logger?.error('stdio handler crashed', { error: e.message }));
    }
  });
  process.stdin.on('end', () => logger?.info('stdio transport closed'));

  return { kind: 'stdio', send, stop: () => process.stdin.pause() };
}
