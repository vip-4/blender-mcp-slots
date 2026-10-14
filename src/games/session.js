import { randomUUID } from 'node:crypto';
import { createDemoWallet } from './wallet.js';
import { AppError, ErrorCode } from '../shared/errors.js';

/**
 * 会话服务：统一入口 GameService。
 * MCP 工具层与 HTTP 层只与它交互，不直接触碰引擎内部状态。
 */
export class GameService {
  constructor({ registry, logger, metrics, limiter, budget, idempotency, wallet, limits = {} }) {
    this.registry = registry;
    this.logger = logger;
    this.metrics = metrics;
    this.limiter = limiter;
    this.budget = budget;
    this.idempotency = idempotency;
    this.wallet = wallet || createDemoWallet();
    this.sessions = new Map();
    this.limits = {
      sessionTtlMs: limits.sessionTtlMs ?? 30 * 60 * 1000,
      maxSessions: limits.maxSessions ?? 500,
      maxAutoSpin: limits.maxAutoSpin ?? 100,
      startingBalance: limits.startingBalance ?? 1000
    };
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  sweep() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.state.updatedAt > this.limits.sessionTtlMs) {
        this.sessions.delete(id);
        this.budget?.release(id);
        this.metrics?.bump('session.expired');
      }
    }
    if (this.sessions.size > this.limits.maxSessions) {
      const sorted = [...this.sessions.entries()].sort((a, b) => a[1].state.updatedAt - b[1].state.updatedAt);
      while (this.sessions.size > this.limits.maxSessions) {
        const [id] = sorted.shift();
        this.sessions.delete(id);
        this.budget?.release(id);
        this.metrics?.bump('session.evicted');
      }
    }
  }

  createSession({ gameId, bet, lines, balance, serverSeed, clientSeed }) {
    const { config } = this.registry.get(gameId);
    const state = this.registry.createState(gameId, {
      bet,
      lines,
      balance: balance ?? this.limits.startingBalance,
      serverSeed,
      clientSeed
    });
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { sessionId, gameId, configVersion: config.version, state, createdAt: Date.now() });
    this.metrics?.bump('session.created');
    return this.publicSession(sessionId);
  }

  getSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new AppError(ErrorCode.SessionNotFound, `session "${sessionId}" not found`);
    s.state.updatedAt = Date.now();
    return s;
  }

  closeSession(sessionId) {
    const existed = this.sessions.delete(sessionId);
    this.budget?.release(sessionId);
    return { closed: existed, sessionId };
  }

  publicSession(sessionId) {
    const s = this.getSession(sessionId);
    const st = s.state;
    return {
      sessionId,
      gameId: s.gameId,
      configVersion: s.configVersion,
      bet: st.bet,
      lines: st.lines,
      balance: st.balance,
      phase: st.phase,
      freeSpins: st.freeSpins ? { remaining: st.freeSpins.remaining, multiplier: st.freeSpins.multiplier, awarded: st.freeSpins.awarded } : null,
      respins: st.respins ? { remaining: st.respins.remaining, coins: st.respins.held.length } : null,
      stats: st.stats,
      history: st.history.slice(0, 20),
      fairness: { serverSeedHash: st.rng.serverSeed, clientSeed: st.rng.clientSeed, nonce: st.rng.nonce }
    };
  }

  /**
   * 单轮旋转（统一入口）。自动识别当前处于 基础轮 / 免费旋转 / 重旋。
   * @param {object} p
   * @param {string} [p.sessionId] 不传则临时创建会话（无状态调用）
   * @param {string} p.gameId
   */
  spin({ sessionId, gameId, bet, lines, idempotencyKey } = {}) {
    if (idempotencyKey && this.idempotency) {
      const cached = this.idempotency.get(idempotencyKey);
      if (cached) return { ...cached, idempotentReplay: true };
    }

    let session;
    if (sessionId) session = this.getSession(sessionId);
    else {
      if (!gameId) throw new AppError(ErrorCode.InvalidParams, 'either sessionId or gameId is required');
      const created = this.createSession({ gameId, bet, lines });
      session = this.sessions.get(created.sessionId);
    }

    this.limiter?.take(session.sessionId);
    this.budget?.check(session.sessionId);

    const result = this.registry.play(session.gameId, session.state, { bet, lines });
    result.sessionId = session.sessionId;
    this.metrics?.bump(`spin.${session.gameId}`);
    if (result.totalWin > 0) this.metrics?.bump('spin.win');
    for (const t of result.triggered) this.metrics?.bump(`feature.${t.type}`);

    if (idempotencyKey && this.idempotency) this.idempotency.set(idempotencyKey, result);
    return result;
  }

  autoSpin({ sessionId, gameId, bet, lines, count = 10, stopOnFeature = false }) {
    const n = Math.min(Math.max(1, Number(count) || 1), this.limits.maxAutoSpin);
    let sid = sessionId;
    if (!sid) sid = this.createSession({ gameId, bet, lines }).sessionId;
    const rounds = [];
    let stoppedEarly = null;
    for (let i = 0; i < n; i += 1) {
      const r = this.spin({ sessionId: sid, bet, lines });
      rounds.push(r);
      if (stopOnFeature && r.triggered.length) {
        stoppedEarly = r.triggered[0].type;
        break;
      }
      if (this.getSession(sid).state.balance < r.bet) {
        stoppedEarly = 'insufficient-balance';
        break;
      }
    }
    return { sessionId: sid, rounds, stoppedEarly, session: this.publicSession(sid) };
  }

  destroy() {
    clearInterval(this.sweeper);
    this.sessions.clear();
  }
}

export function createGameService({ registry, logger, metrics, guards = {}, limits } = {}) {
  return new GameService({
    registry,
    logger,
    metrics,
    limiter: guards.limiter,
    budget: guards.budget,
    idempotency: guards.idempotency,
    limits
  });
}
