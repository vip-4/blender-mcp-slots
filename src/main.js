import { loadRuntime } from './config/runtime.js';
import { loadEnv } from './config/dotenv.js';
import { createStore } from './store/index.js';
import { createLogger } from './shared/logger.js';
import { createMetrics } from './shared/metrics.js';
import { RateLimiter, IdempotencyCache, SpinBudget } from './shared/guard.js';
import { createRegistry } from './games/registry.js';
import { createGameService } from './games/session.js';
import { Dispatcher } from './mcp/dispatcher.js';
import { registerTools } from './mcp/tools.js';
import { createBlenderBridge } from './mcp/blender/bridge.js';
import { startStdio } from './mcp/transports/stdio.js';
import { startHttp } from './mcp/transports/http.js';

loadEnv();
const runtime = loadRuntime();
const logger = createLogger({ level: runtime.logLevel });
const metrics = createMetrics();

process.on('unhandledRejection', (e) => logger.error('unhandledRejection', { error: String(e) }));
process.on('uncaughtException', (e) => logger.error('uncaughtException', { error: e.message, stack: e.stack }));

async function bootstrap() {
  const registry = await createRegistry({ configDir: runtime.configDir, logger });
  const store = await createStore({ logger, metrics, registry });
  const service = createGameService({
    registry,
    logger,
    metrics,
    store,
    guards: {
      limiter: new RateLimiter({ capacity: runtime.limits.rateCapacity, refillPerSec: runtime.limits.rateRefill }),
      budget: new SpinBudget(),
      idempotency: new IdempotencyCache()
    },
    limits: { maxSessions: runtime.limits.maxSessions, maxAutoSpin: runtime.limits.maxAutoSpin, startingBalance: runtime.startingBalance }
  });
  const blender = createBlenderBridge(runtime.blender, { logger, metrics });

  const dispatcher = new Dispatcher({ logger, metrics, timeoutMs: runtime.timeoutMs });
  registerTools({ dispatcher, registry, service, blender, metrics, logger, store });

  const transports = [];
  if (runtime.transport === 'stdio' || runtime.transport === 'both') transports.push(startStdio({ dispatcher, logger }));
  if (runtime.transport === 'http' || runtime.transport === 'both') transports.push(await startHttp({ dispatcher, registry, service, metrics, runtime, logger }));

  logger.info('blender-mcp-slots ready', {
    transport: runtime.transport,
    games: registry.list().map((g) => g.id),
    configFailures: registry.failures
  });

  const shutdown = async (signal) => {
    logger.info('shutdown', { signal });
    service.destroy();
    await Promise.allSettled(transports.map((t) => t.stop?.()));
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { registry, service, dispatcher, transports };
}

bootstrap().catch((e) => {
  logger.error('bootstrap failed', { error: e.message, stack: e.stack });
  process.exit(1);
});
