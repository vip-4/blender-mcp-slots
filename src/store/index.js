import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import { RedisStore } from './redis.js';
import { createArchive } from './r2.js';

/**
 * 可插拔存储门面（ResilientStore）
 * ------------------------------------------------------------------
 * 稳定性契约：
 *  1. 主存储不可用时自动降级到内存，游戏主流程零中断；
 *  2. 写入一律「旁路 + 超时丢弃」，绝不因数据库/缓存抖动拉高旋转延迟；
 *  3. 读取优先主存储，失败回退内存快照，保证接口永远有数据返回。
 */
class ResilientStore {
  constructor({ primary, fallback, logger, metrics, archive = null }) {
    this.name = primary?.name || 'memory';
    this.primary = primary;
    this.fallback = fallback || new MemoryStore();
    this.archive = archive;
    this.logger = logger;
    this.metrics = metrics;
    this.degraded = false;
    this.reason = null;
    this.writes = 0;
    this.dropped = 0;
  }

  async init() {
    const r = await this.primary.init();
    this.degraded = !!r.degraded;
    this.reason = r.reason || null;
    if (!this.degraded) await this.fallback.init();
    return { driver: this.name, degraded: this.degraded, reason: this.reason };
  }

  /** 旁路写入：同步入队（内存/队列后端立即生效），异步落库失败只记指标，永不抛错给调用方 */
  recordSpin(entry) {
    this.writes += 1;
    try {
      this.fallback.recordSpin(entry);
    } catch {}
    // R2 归档：同样走旁路，失败不影响主流程
    try {
      this.archive?.push(entry);
    } catch {}
    const onError = (e) => {
      this.dropped += 1;
      this.metrics?.bump('store.write.dropped');
      this.logger?.debug('store write dropped', { reason: String(e?.message) });
    };
    try {
      const p = this.primary.recordSpin(entry);
      if (p && typeof p.catch === 'function') p.catch(onError);
    } catch (e) {
      onError(e);
    }
    return Promise.resolve();
  }

  async recentSpins(query = {}) {
    try {
      const rows = await this.primary.recentSpins(query);
      if (Array.isArray(rows)) return rows;
    } catch (e) {
      this.metrics?.bump('store.read.fallback');
    }
    return this.fallback.recentSpins(query);
  }

  async leaderboard(query = {}) {
    try {
      const rows = await this.primary.leaderboard(query);
      if (Array.isArray(rows)) return rows;
    } catch (e) {
      this.metrics?.bump('store.read.fallback');
    }
    return this.fallback.leaderboard(query);
  }

  /** 立即把缓冲中的旋转流水归档到 R2（供运维/审计手动触发） */
  async flushArchive() {
    if (!this.archive) return { enabled: false, flushed: 0 };
    return this.archive.flush();
  }

  /** 机台 CONFIG 快照备份（参数化调参的回滚点） */
  async snapshotConfigs(name, payload) {
    if (!this.archive) return { enabled: false, ok: false };
    return this.archive.snapshot(name, payload);
  }

  async health() {
    const primary = await this.primary.health().catch((e) => ({ ok: false, degraded: true, reason: String(e?.message) }));
    const fallback = await this.fallback.health().catch(() => ({ ok: false }));
    return {
      driver: this.name,
      degraded: !!primary.degraded || !primary.ok,
      primary,
      fallback,
      archive: this.archive ? this.archive.health() : { enabled: false },
      counters: { writes: this.writes, dropped: this.dropped }
    };
  }

  async close() {
    await Promise.allSettled([this.primary.close?.(), this.fallback.close?.(), this.archive?.close?.()]);
  }
}

/**
 * 创建存储。
 * STORE_DRIVER=memory | postgres | redis | auto（默认 auto）
 *  - auto：有 DATABASE_URL 用 postgres，否则内存；REDIS_URL 存在时作为第二候选。
 */
export async function createStore({ driver, databaseUrl, redisUrl, logger, metrics, registry } = {}) {
  const mode = String(driver || process.env.STORE_DRIVER || 'auto').toLowerCase();
  const dbUrl = databaseUrl || process.env.DATABASE_URL;
  const cacheUrl = redisUrl || process.env.REDIS_URL;

  let primary;
  if (mode === 'postgres' || (mode === 'auto' && dbUrl)) {
    primary = new PostgresStore({ connectionString: dbUrl, logger });
  } else if (mode === 'redis' || (mode === 'auto' && !dbUrl && cacheUrl)) {
    primary = new RedisStore({ url: cacheUrl, logger });
  } else {
    primary = new MemoryStore();
  }

  // R2 归档：未配置凭据时返回 null，行为与之前完全一致
  const archive = createArchive({ logger });
  const store = new ResilientStore({ primary, logger, metrics, archive });
  const info = await store.init();
  if (archive) {
    const a = await archive.init();
    logger?.info('r2 archive initialised', a);
  }

  // Redis 作为旁路缓存：可用则登记机台键前缀，不可用静默跳过
  if (cacheUrl && primary.name !== 'redis') {
    const cache = new RedisStore({ url: cacheUrl, logger });
    const r = await cache.init();
    if (!r.degraded && registry) {
      cache.setKnownGameIds(registry.list().map((g) => g.id));
      store.cache = cache;
    } else {
      await cache.close().catch(() => {});
    }
  }

  logger?.info('store initialised', { ...info, cache: store.cache ? 'redis' : 'off' });
  return store;
}

export { MemoryStore, PostgresStore, RedisStore };
