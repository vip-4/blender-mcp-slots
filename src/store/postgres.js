import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Neon Postgres 存储后端（可选依赖 pg）
 * 设计原则：
 *  1. 依赖缺失 / 连接失败 / 执行报错 → 一律抛错交由上层降级，绝不阻断游戏主流程；
 *  2. 写入走「旁路 + 内部队列」，超时即丢弃，保证 P99 延迟不受数据库抖动影响；
 *  3. 表结构由 db/schema.sql 定义，幂等创建。
 */
export class PostgresStore {
  constructor({
    connectionString,
    max = 4,
    connectionTimeoutMs = Number(process.env.PG_CONNECT_TIMEOUT_MS || 15000),
    statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 10000),
    logger
  } = {}) {
    this.name = 'postgres';
    this.connectionString = connectionString;
    this.max = max;
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.statementTimeoutMs = statementTimeoutMs;
    this.logger = logger;
    this.pool = null;
    this.failed = null;
    this.queue = [];
    this.flushing = false;
  }

  async init() {
    if (!this.connectionString) {
      this.failed = 'DATABASE_URL missing';
      return { ok: false, degraded: true, driver: 'postgres', reason: this.failed };
    }
    try {
      const pg = await import('pg');
      const Pool = pg.default?.Pool ?? pg.Pool;
      this.pool = new Pool({
        connectionString: this.connectionString,
        max: this.max,
        connectionTimeoutMillis: this.connectionTimeoutMs,
        statement_timeout: this.statementTimeoutMs,
        idleTimeoutMillis: 30_000
      });
      const sql = readFileSync(path.resolve(ROOT, 'db/schema.sql'), 'utf8');
      await this.pool.query(sql);
      this.logger?.info('postgres store ready');
      void this.flush(); // 补写 init 之前已入队的记录
      return { ok: true, degraded: false, driver: 'postgres' };
    } catch (e) {
      this.failed = String(e?.message || e);
      this.pool = null;
      this.logger?.warn('postgres store unavailable, will degrade', { reason: this.failed });
      return { ok: false, degraded: true, driver: 'postgres', reason: this.failed };
    }
  }

  /** 旁路写入：失败只记录，不影响调用方 */
  recordSpin(entry) {
    this.queue.push(entry);
    if (this.queue.length > 500) this.queue.splice(0, this.queue.length - 500);
    void this.flush();
    return Promise.resolve();
  }

  /** 批量落库：一次事务写整批，避免云端高延迟下逐条往返把队列拖死 */
  async flush() {
    if (this.flushing || !this.pool || !this.queue.length) return;
    this.flushing = true;
    try {
      const batch = this.queue.splice(0, this.queue.length);
      const COLS = 14;
      const tuples = [];
      const params = [];
      batch.forEach((e, i) => {
        const base = i * COLS;
        tuples.push(`(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(',')})`);
        params.push(
          e.roundId,
          e.sessionId ?? null,
          e.gameId,
          e.configVersion ?? null,
          e.phase,
          e.bet,
          e.cost,
          e.totalWin,
          e.multiplier ?? 1,
          JSON.stringify(e.triggered ?? []),
          e.balanceAfter ?? e.balance ?? 0,
          e.serverSeedHash ?? null,
          e.clientSeed ?? null,
          e.nonce ?? null
        );
      });

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `insert into slot_spins
           (round_id, session_id, game_id, config_version, phase, bet, cost, total_win, multiplier, triggered, balance_after, server_seed_hash, client_seed, nonce)
           values ${tuples.join(',')}`,
          params
        );
        await client.query(
          `insert into slot_leaderboard (game_id, session_id, round_id, best_multiplier, best_win, updated_at)
           select * from unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::numeric[])
           on conflict (game_id, session_id) do update set
             best_multiplier = greatest(slot_leaderboard.best_multiplier, excluded.best_multiplier),
             best_win = greatest(slot_leaderboard.best_win, excluded.best_win),
             round_id = case when excluded.best_multiplier > slot_leaderboard.best_multiplier then excluded.round_id else slot_leaderboard.round_id end,
             updated_at = now()`,
          [
            batch.map((e) => e.gameId),
            batch.map((e) => e.sessionId ?? 'anon'),
            batch.map((e) => e.roundId),
            batch.map((e) => String(e.bet > 0 ? e.totalWin / e.bet : 0)),
            batch.map((e) => String(e.totalWin))
          ]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        this.logger?.warn('postgres write failed, dropped batch', { size: batch.length, reason: String(e?.message) });
      } finally {
        client.release();
      }
    } finally {
      this.flushing = false;
      // 批写入期间新入队的记录需要再次驱动，否则会滞留在队列中
      if (this.queue.length) void this.flush();
    }
  }

  async recentSpins({ gameId, limit = 20 } = {}) {
    if (!this.pool) throw new Error(this.failed || 'postgres unavailable');
    if (this.queue.length) await this.flush(); // 读前补写，保证「刚转完就能查到」
    const n = Math.min(Math.max(1, Number(limit) || 20), 200);
    const { rows } = await this.pool.query(
      `select round_id, session_id, game_id, config_version, phase, bet, cost, total_win, multiplier, triggered, balance_after, created_at
       from slot_spins ${gameId ? 'where game_id = $1' : ''}
       order by id desc limit ${gameId ? '$2' : '$1'}`,
      gameId ? [gameId, n] : [n]
    );
    return rows.map((r) => ({
      roundId: r.round_id,
      sessionId: r.session_id,
      gameId: r.game_id,
      configVersion: r.config_version,
      phase: r.phase,
      bet: Number(r.bet),
      cost: Number(r.cost),
      totalWin: Number(r.total_win),
      multiplier: Number(r.multiplier),
      triggered: r.triggered,
      balanceAfter: Number(r.balance_after),
      at: r.created_at
    }));
  }

  async leaderboard({ gameId, limit = 10 } = {}) {
    if (!this.pool) throw new Error(this.failed || 'postgres unavailable');
    const n = Math.min(Math.max(1, Number(limit) || 10), 100);
    const { rows } = await this.pool.query(
      `select game_id, session_id, round_id, best_multiplier, best_win, updated_at
       from slot_leaderboard ${gameId ? 'where game_id = $1' : ''}
       order by best_multiplier desc, best_win desc limit ${gameId ? '$2' : '$1'}`,
      gameId ? [gameId, n] : [n]
    );
    return rows.map((r) => ({
      gameId: r.game_id,
      sessionId: r.session_id,
      roundId: r.round_id,
      bestMultiplier: Number(r.best_multiplier),
      bestWin: Number(r.best_win),
      updatedAt: r.updated_at
    }));
  }

  async health() {
    if (!this.pool) return { ok: false, degraded: true, driver: 'postgres', reason: this.failed || 'not initialised' };
    const t0 = Date.now();
    try {
      await this.pool.query('select 1');
      return { ok: true, degraded: false, driver: 'postgres', latencyMs: Date.now() - t0, pending: this.queue.length };
    } catch (e) {
      return { ok: false, degraded: true, driver: 'postgres', reason: String(e?.message), latencyMs: Date.now() - t0 };
    }
  }

  async close() {
    await this.pool?.end().catch(() => {});
    this.pool = null;
  }
}
