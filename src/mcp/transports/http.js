import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseIncoming, errorResponse } from '../protocol.js';
import { ErrorCode } from '../../shared/errors.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  res.end(payload);
};

/**
 * HTTP 传输：同时提供
 *  - /rpc        MCP over HTTP（供 Agent / 后端调用）
 *  - /api/*      前端轻量 REST（免解析 JSON-RPC 信封）
 *  - /healthz /metrics  运维端点
 *  - 静态站点    前端机台界面
 */
export function startHttp({ dispatcher, registry, service, metrics, runtime, logger }) {
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // CORS（本地/沙箱预览跨域）
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type,authorization');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === 'POST' && (pathname === '/rpc' || pathname === '/mcp')) {
        const raw = await readBody(req, 4 * 1024 * 1024);
        const parsed = parseIncoming(raw);
        if (!parsed.ok) return json(res, 400, errorResponse(null, ErrorCode.ParseError, parsed.parseError));
        const response = parsed.batch
          ? await Promise.all(parsed.payload.map((r) => dispatcher.handle(r)))
          : await dispatcher.handle(parsed.payload);
        metrics?.observe('http.rpc', Date.now() - started);
        return json(res, 200, response);
      }

      if (req.method === 'GET' && pathname === '/healthz') {
        return json(res, 200, {
          ok: true,
          games: registry.list().length,
          configFailures: registry.failures,
          sessions: service.sessions.size,
          uptimeSec: Math.round(process.uptime())
        });
      }

      if (req.method === 'GET' && pathname === '/metrics') {
        return json(res, 200, metrics?.snapshot() ?? {});
      }

      if (req.method === 'GET' && pathname === '/api/games') {
        return json(res, 200, { games: registry.list() });
      }

      const gameMatch = pathname.match(/^\/api\/games\/([\w-]+)$/);
      if (req.method === 'GET' && gameMatch) {
        try {
          return json(res, 200, registry.describeById(gameMatch[1]));
        } catch (e) {
          return json(res, 404, { error: e.message });
        }
      }

      if (req.method === 'POST' && pathname === '/api/spin') {
        const raw = await readBody(req, 1024 * 1024);
        const params = JSON.parse(raw || '{}');
        return json(res, 200, service.spin(params));
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        return await serveStatic(res, pathname, runtime.staticDir, logger);
      }

      return json(res, 404, { error: 'not found', path: pathname });
    } catch (e) {
      logger?.error('http handler error', { path: pathname, error: e.message });
      return json(res, 500, { error: e.message });
    }
  });

  server.on('error', (e) => logger?.error('http server error', { error: e.message }));

  return new Promise((resolve) => {
    server.listen(runtime.httpPort, runtime.httpHost, () => {
      logger?.info('http transport listening', { port: runtime.httpPort, staticDir: runtime.staticDir });
      resolve({
        kind: 'http',
        server,
        url: `http://${runtime.httpHost === '0.0.0.0' ? '127.0.0.1' : runtime.httpHost}:${runtime.httpPort}`,
        stop: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(res, pathname, staticDir, logger) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(staticDir, rel);
  // 防目录穿越
  if (!target.startsWith(path.resolve(staticDir))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const info = await stat(target);
    const file = info.isDirectory() ? path.join(target, 'index.html') : target;
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': data.length
    });
    res.end(data);
  } catch {
    try {
      const data = await readFile(path.join(staticDir, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': data.length });
      res.end(data);
    } catch (e) {
      logger?.error('static serve failed', { error: e.message });
      res.writeHead(404);
      res.end('not found');
    }
  }
}
