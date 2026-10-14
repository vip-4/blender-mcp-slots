import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 运行时配置：所有可调参数集中在此，便于部署时通过环境变量覆盖。 */
export function loadRuntime(argv = process.argv.slice(2)) {
  const arg = (name, fallback) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i === -1) return fallback;
    const raw = argv[i];
    return raw.includes('=') ? raw.split('=').slice(1).join('=') : argv[i + 1] ?? true;
  };

  return {
    root: ROOT,
    transport: String(arg('transport', process.env.MCP_TRANSPORT || 'http')),
    httpPort: Number(arg('port', process.env.MCP_HTTP_PORT || 5173)),
    httpHost: String(arg('host', process.env.MCP_HTTP_HOST || '0.0.0.0')),
    staticDir: path.resolve(ROOT, String(arg('static', process.env.MCP_STATIC_DIR || 'public'))),
    configDir: arg('config-dir', process.env.SLOT_CONFIG_DIR) || undefined,
    logLevel: String(arg('log-level', process.env.MCP_LOG_LEVEL || 'info')),
    timeoutMs: Number(arg('timeout', process.env.MCP_TIMEOUT_MS || 5000)),
    startingBalance: Number(process.env.SLOT_START_BALANCE || 1000),
    blender: {
      enabled: String(process.env.BLENDER_MCP_ENABLED || 'false') === 'true',
      endpoint: process.env.BLENDER_MCP_URL || 'http://127.0.0.1:8765/rpc',
      timeoutMs: Number(process.env.BLENDER_MCP_TIMEOUT_MS || 1500)
    },
    limits: {
      maxSessions: Number(process.env.SLOT_MAX_SESSIONS || 500),
      maxAutoSpin: Number(process.env.SLOT_MAX_AUTOSPIN || 100),
      rateCapacity: Number(process.env.SLOT_RATE_CAPACITY || 120),
      rateRefill: Number(process.env.SLOT_RATE_REFILL || 40)
    }
  };
}
