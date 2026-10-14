import net from 'node:net';
import tls from 'node:tls';

/**
 * 零依赖 RESP 客户端：只实现本项目用到的命令（列表 + 有序集合）。
 * 不引入 ioredis，避免为一条旁路链路增加 30+ 传递依赖。
 */
class RespClient {
  constructor({ host, port, password, username, db, tls: useTls, timeoutMs = 3000, logger }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.username = username;
    this.db = db;
    this.useTls = useTls;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const opts = { host: this.host, port: this.port };
      const sock = this.useTls ? tls.connect(opts) : net.connect(opts);
      this.socket = sock;
      const done = (err) => (err ? reject(err) : resolve());
      sock.setTimeout(this.timeoutMs);
      sock.once('error', (e) => {
        this.socket = null;
        reject(e);
      });
      sock.once('timeout', () => {
        sock.destroy();
        this.socket = null;
        reject(new Error('redis connect timeout'));
      });
      sock.on('data', (d) => {
        this.buffer = Buffer.concat([this.buffer, d]);
        this.#drain();
      });
      sock.once('connect', async () => {
        try {
          if (this.password) await this.#cmd(this.username ? ['AUTH', this.username, this.password] : ['AUTH', this.password]);
          if (this.db) await this.#cmd(['SELECT', String(this.db)]);
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  }

  #enqueue() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error('redis command timeout'));
        }
      }, this.timeoutMs);
    });
  }

  #cmd(args) {
    const p = this.#enqueue();
    const out = [`*${args.length}`];
    for (const a of args) {
      const s = String(a);
      out.push(`$${Buffer.byteLength(s)}`, s);
    }
    this.socket.write(`${out.join('\r\n')}\r\n`);
    return p;
  }

  #drain() {
    while (true) {
      const parsed = this.#parse();
      if (!parsed) break;
      const waiter = this.waiters.shift();
      if (!waiter) break;
      if (parsed instanceof Error) waiter.reject(parsed);
      else waiter.resolve(parsed);
    }
  }

  #parse() {
    const buf = this.buffer;
    if (!buf.length) return null;
    const nl = buf.indexOf('\r\n');
    if (nl < 0) return null;
    const head = buf.slice(0, nl).toString();
    const bodyStart = nl + 2;
    const type = head[0];

    if (type === '+' || type === ':') {
      const value = head.slice(1);
      this.buffer = buf.slice(bodyStart);
      return type === '+' ? value : Number(value);
    }
    if (type === '-') {
      this.buffer = buf.slice(bodyStart);
      return new Error(head.slice(1));
    }
    if (type === '$') {
      const len = Number(head.slice(1));
      if (len < 0) {
        this.buffer = buf.slice(bodyStart);
        return null;
      }
      if (buf.length < bodyStart + len + 2) return null;
      const value = buf.slice(bodyStart, bodyStart + len).toString();
      this.buffer = buf.slice(bodyStart + len + 2);
      return value;
    }
    if (type === '*') {
      const count = Number(head.slice(1));
      if (count < 0) {
        this.buffer = buf.slice(bodyStart);
        return null;
      }
      let cursor = bodyStart;
      const items = [];
      for (let i = 0; i < count; i += 1) {
        const rest = this.buffer.slice(cursor);
        const sub = RespClient.#parseAt(rest);
        if (!sub) return null;
        items.push(sub.value);
        cursor += sub.consumed;
      }
      this.buffer = this.buffer.slice(cursor);
      return items;
    }
    throw new Error(`unsupported RESP type: ${type}`);
  }

  static #parseAt(buf) {
    const nl = buf.indexOf('\r\n');
    if (nl < 0) return null;
    const head = buf.slice(0, nl).toString();
    const bodyStart = nl + 2;
    const type = head[0];
    if (type === '+' || type === ':') {
      return { value: type === '+' ? head.slice(1) : Number(head.slice(1)), consumed: bodyStart };
    }
    if (type === '-') return { value: new Error(head.slice(1)), consumed: bodyStart };
    if (type === '$') {
      const len = Number(head.slice(1));
      if (len < 0) return { value: null, consumed: bodyStart };
      if (buf.length < bodyStart + len + 2) return null;
      return { value: buf.slice(bodyStart, bodyStart + len).toString(), consumed: bodyStart + len + 2 };
    }
    if (type === '*') {
      const count = Number(head.slice(1));
      if (count < 0) return { value: null, consumed: bodyStart };
      let cursor = bodyStart;
      const items = [];
      for (let i = 0; i < count; i += 1) {
        const sub = RespClient.#parseAt(buf.slice(cursor));
        if (!sub) return null;
        items.push(sub.value);
        cursor += sub.consumed;
      }
      return { value: items, consumed: cursor };
    }
    throw new Error(`unsupported RESP type: ${type}`);
  }

  command(...args) {
    if (!this.socket) return Promise.reject(new Error('redis not connected'));
    return this.#cmd(args);
  }

  close() {
    try {
      this.socket?.end();
    } catch {}
    this.socket = null;
    this.waiters.forEach((w) => w.reject(new Error('redis closed')));
    this.waiters = [];
  }
}

/** Redis 存储后端（旁路热数据：最近旋转 + 排行榜） */
export class RedisStore {
  constructor({ url, timeoutMs = 3000, logger, capacity = 2000 } = {}) {
    this.name = 'redis';
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.capacity = capacity;
    this.client = null;
    this.failed = null;
  }

  static parseUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.replace('/', '')) : undefined;
      return {
        host: u.hostname,
        port: Number(u.port || 6379),
        username: u.username || undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
        db: Number.isFinite(db) ? db : undefined,
        tls: u.protocol === 'rediss:'
      };
    } catch {
      return null;
    }
  }

  async init() {
    const cfg = RedisStore.parseUrl(this.url);
    if (!cfg) {
      this.failed = 'REDIS_URL missing or invalid';
      return { ok: false, degraded: true, driver: 'redis', reason: this.failed };
    }
    try {
      this.client = new RespClient({ ...cfg, timeoutMs: this.timeoutMs, logger: this.logger });
      await this.client.connect();
      await this.client.command('PING');
      this.logger?.info('redis store ready', { host: cfg.host, port: cfg.port });
      return { ok: true, degraded: false, driver: 'redis' };
    } catch (e) {
      this.failed = String(e?.message || e);
      this.client = null;
      this.logger?.warn('redis store unavailable, will degrade', { reason: this.failed });
      return { ok: false, degraded: true, driver: 'redis', reason: this.failed };
    }
  }

  async recordSpin(entry) {
    if (!this.client) throw new Error(this.failed || 'redis unavailable');
    const key = `slots:spins:${entry.gameId}`;
    await this.client.command('RPUSH', key, JSON.stringify(entry));
    await this.client.command('LTRIM', key, 0, this.capacity - 1);
    const mult = entry.bet > 0 ? entry.totalWin / entry.bet : 0;
    await this.client.command('ZADD', `slots:board:${entry.gameId}`, 'GT', String(mult), `${entry.sessionId ?? 'anon'}:${entry.roundId}`);
  }

  async recentSpins({ gameId, limit = 20 } = {}) {
    if (!this.client) throw new Error(this.failed || 'redis unavailable');
    const keys = gameId ? [`slots:spins:${gameId}`] : await this.#allSpinKeys();
    const n = Math.min(Math.max(1, Number(limit) || 20), 200);
    const out = [];
    for (const k of keys) {
      const items = await this.client.command('LRANGE', k, 0, n - 1);
      for (const it of items ?? []) {
        try {
          out.push(JSON.parse(it));
        } catch {}
      }
    }
    out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    return out.slice(0, n);
  }

  async #allSpinKeys() {
    // 已知机台前缀扫描：不启用 KEYS 以免阻塞，改为按注册表前缀枚举
    return this.knownKeys || [];
  }

  setKnownGameIds(ids = []) {
    this.knownKeys = ids.map((id) => `slots:spins:${id}`);
  }

  async leaderboard({ gameId, limit = 10 } = {}) {
    if (!this.client) throw new Error(this.failed || 'redis unavailable');
    const n = Math.min(Math.max(1, Number(limit) || 10), 100);
    const keys = gameId ? [`slots:board:${gameId}`] : (this.knownKeys || []).map((k) => k.replace('slots:spins:', 'slots:board:'));
    const out = [];
    for (const k of keys) {
      const rows = await this.client.command('ZREVRANGE', k, 0, n - 1, 'WITHSCORES');
      const flat = rows ?? [];
      for (let i = 0; i < flat.length; i += 2) {
        const member = flat[i];
        const score = Number(flat[i + 1]);
        const [sessionId, roundId] = String(member).split(':');
        out.push({
          gameId: k.replace('slots:board:', ''),
          sessionId,
          roundId,
          bestMultiplier: score,
          bestWin: score,
          updatedAt: null
        });
      }
    }
    out.sort((a, b) => b.bestMultiplier - a.bestMultiplier);
    return out.slice(0, n);
  }

  async health() {
    if (!this.client) return { ok: false, degraded: true, driver: 'redis', reason: this.failed || 'not initialised' };
    const t0 = Date.now();
    try {
      await this.client.command('PING');
      return { ok: true, degraded: false, driver: 'redis', latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, degraded: true, driver: 'redis', reason: String(e?.message), latencyMs: Date.now() - t0 };
    }
  }

  async close() {
    this.client?.close();
    this.client = null;
  }
}
