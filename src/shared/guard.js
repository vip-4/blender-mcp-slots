import { AppError, ErrorCode } from './errors.js';

/** 令牌桶限流：按 key（sessionId / clientId）维度保护引擎不被打爆。 */
export class RateLimiter {
  constructor({ capacity = 60, refillPerSec = 20 } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.buckets = new Map();
  }

  take(key, cost = 1) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.updatedAt = now;
    if (b.tokens < cost) {
      throw new AppError(ErrorCode.RateLimited, `rate limit exceeded for ${key}`, {
        retryAfterMs: Math.ceil(((cost - b.tokens) / this.refillPerSec) * 1000)
      });
    }
    b.tokens -= cost;
    if (this.buckets.size > 5000) {
      for (const [k, v] of this.buckets) if (now - v.updatedAt > 60_000) this.buckets.delete(k);
    }
  }
}

/** 幂等缓存：相同 idempotencyKey 的写请求在 TTL 内返回首次结果，避免网络重试造成重复下注。 */
export class IdempotencyCache {
  constructor({ ttlMs = 60_000, max = 2000 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(key, { at: Date.now(), value });
  }
}

/** 会话旋转预算：防止脚本/自动化无限刷分导致进程资源被吃满。 */
export class SpinBudget {
  constructor({ maxPerSession = 20000, maxPerHour = 200000 } = {}) {
    this.maxPerSession = maxPerSession;
    this.maxPerHour = maxPerHour;
    this.perSession = new Map();
    this.window = { hour: Math.floor(Date.now() / 3_600_000), total: 0 };
  }

  check(sessionId) {
    const hour = Math.floor(Date.now() / 3_600_000);
    if (hour !== this.window.hour) this.window = { hour, total: 0 };
    if (this.window.total >= this.maxPerHour) {
      throw new AppError(ErrorCode.BudgetExceeded, 'global spin budget exceeded');
    }
    const used = this.perSession.get(sessionId) || 0;
    if (used >= this.maxPerSession) {
      throw new AppError(ErrorCode.BudgetExceeded, 'session spin budget exceeded', { used });
    }
    this.perSession.set(sessionId, used + 1);
    this.window.total += 1;
  }

  release(sessionId) {
    this.perSession.delete(sessionId);
  }
}

/** 超时包装：任何一次调用都不得无限期挂住事件循环之外的资源。 */
export async function withTimeout(promise, ms, message = 'execution timeout') {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AppError(ErrorCode.Timeout, message, { timeoutMs: ms })), ms);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}
