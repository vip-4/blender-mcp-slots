import crypto from 'node:crypto';

/**
 * Cloudflare R2 归档存储（S3 兼容，零第三方依赖）
 * ------------------------------------------------------------------
 * 用途：
 *  1. 旋转流水按小时分片归档为 JSONL（审计 / 离线建模 / 回放）；
 *  2. 机台 CONFIG 快照备份与恢复（参数化调参的回滚点）。
 *
 * 稳定性契约：
 *  - 所有读写都带超时（默认 4s），失败只记录 lastError 并标记 degraded；
 *  - 归档与主流程完全旁路：写入失败绝不阻断旋转；
 *  - 未配置凭据时 createArchive() 返回 null，服务行为与之前完全一致。
 */

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();

function amzDate(d) {
  return (
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T` +
    `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`
  );
}

/** AWS Signature V4（S3 / R2 通用） */
export function signRequest({ method, host, path, query = '', headers = {}, payload = '', accessKeyId, secretAccessKey, region = 'auto', now = new Date() }) {
  const payloadHash = sha256hex(payload);
  const all = {
    ...headers,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate(now)
  };
  const keys = Object.keys(all).sort();
  const canonicalHeaders = keys.map((k) => `${k}:${String(all[k]).trim()}\n`).join('');
  const signedHeaders = keys.join(';');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const dateStamp = amzDate(now).slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate(now), scope, sha256hex(canonicalRequest)].join('\n');
  let k = hmac(`AWS4${secretAccessKey}`, dateStamp);
  for (const part of [region, 's3', 'aws4_request']) k = hmac(k, part);
  return {
    headers: { ...headers, ...all, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${crypto.createHmac('sha256', k).update(stringToSign).digest('hex')}` }
  };
}

export class R2Client {
  constructor({ accountId, accessKeyId, secretAccessKey, bucket, endpoint, timeoutMs = 4000 } = {}) {
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.endpoint = endpoint || `https://${accountId}.r2.cloudflarestorage.com`;
    this.host = new URL(this.endpoint).host;
    this.timeoutMs = timeoutMs;
  }

  static fromEnv(env = process.env) {
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    const accountId = env.R2_ACCOUNT_ID;
    if (!accessKeyId || !secretAccessKey || !bucket || !accountId) return null;
    return new R2Client({ accountId, accessKeyId, secretAccessKey, bucket, endpoint: env.R2_ENDPOINT, timeoutMs: Number(env.R2_TIMEOUT_MS || 4000) });
  }

  async request(method, { key = '', query = '', body = null, contentType = 'application/octet-stream' } = {}) {
    const path = `/${this.bucket}${key ? `/${encodeR2Key(key)}` : ''}`;
    const payload = body === null || body === undefined ? '' : String(body);
    const { headers } = signRequest({
      method,
      host: this.host,
      path,
      query,
      headers: body ? { 'content-type': contentType } : {},
      payload,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}${path}${query ? `?${query}` : ''}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' || method === 'DELETE' ? undefined : payload,
        signal: ctrl.signal
      });
      const text = method === 'HEAD' ? '' : await res.text();
      if (!res.ok) throw new Error(`R2 ${method} ${key || '/'} -> ${res.status} ${text.slice(0, 160)}`);
      return { status: res.status, text };
    } finally {
      clearTimeout(timer);
    }
  }

  headBucket() {
    return this.request('HEAD', { key: '' });
  }

  put(key, body, contentType) {
    return this.request('PUT', { key, body, contentType });
  }

  get(key) {
    return this.request('GET', { key });
  }
}

/** R2 key 逐段编码（保留 / 分隔符） */
export function encodeR2Key(key) {
  return String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * 旋转流水归档器：内存缓冲 → 按小时分片写入 R2（JSONL）
 * 分片策略：spins/YYYY-MM-DD/HH.jsonl；单分片超过 maxBytes 时滚动到带序号的新分片
 */
export class ArchiveStore {
  constructor({ client, prefix = 'blender-mcp-slots', maxBytes = 4 * 1024 * 1024, flushIntervalMs = 60000, flushThreshold = 200, logger } = {}) {
    this.name = 'r2';
    this.client = client;
    this.prefix = prefix;
    this.maxBytes = maxBytes;
    this.flushIntervalMs = flushIntervalMs;
    this.flushThreshold = flushThreshold;
    this.logger = logger;
    this.buffer = [];
    this.degraded = true;
    this.reason = 'not initialised';
    this.lastError = null;
    this.flushed = 0;
    this.dropped = 0;
    this.timer = null;
  }

  async init() {
    try {
      await this.client.headBucket();
      this.degraded = false;
      this.reason = null;
      this.timer = setInterval(() => {
        this.flush().catch(() => {});
      }, this.flushIntervalMs);
      this.timer.unref?.();
      return { driver: 'r2', degraded: false };
    } catch (e) {
      this.degraded = true;
      this.reason = String(e?.message || e);
      this.lastError = this.reason;
      this.logger?.warn('r2 archive disabled', { reason: this.reason });
      return { driver: 'r2', degraded: true, reason: this.reason };
    }
  }

  shardKey() {
    const d = new Date();
    const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const hour = String(d.getUTCHours()).padStart(2, '0');
    return `${this.prefix}/spins/${day}/${hour}.jsonl`;
  }

  push(entry) {
    if (this.degraded) return { accepted: false, reason: this.reason };
    this.buffer.push(entry);
    if (this.buffer.length >= this.flushThreshold) this.flush().catch(() => {});
    return { accepted: true, pending: this.buffer.length };
  }

  /** 立即归档：读取现有分片 → 追加 → 整体回写（R2 不支持 append，按分片重写） */
  async flush() {
    if (this.degraded || !this.buffer.length) return { flushed: 0, degraded: this.degraded };
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      let key = this.shardKey();
      let existing = '';
      try {
        existing = (await this.client.get(key)).text || '';
      } catch {
        existing = '';
      }
      if (Buffer.byteLength(existing, 'utf8') > this.maxBytes) {
        key = key.replace('.jsonl', `-${Date.now()}.jsonl`);
        existing = '';
      }
      const payload = existing + batch.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await this.client.put(key, payload, 'application/jsonl');
      this.flushed += batch.length;
      return { flushed: batch.length, key, bytes: Buffer.byteLength(payload, 'utf8'), degraded: false };
    } catch (e) {
      this.dropped += batch.length;
      this.lastError = String(e?.message || e);
      this.logger?.debug('r2 archive flush failed', { reason: this.lastError, count: batch.length });
      return { flushed: 0, dropped: batch.length, degraded: true, reason: this.lastError };
    }
  }

  async snapshot(name, payload) {
    if (this.degraded) return { ok: false, degraded: true, reason: this.reason };
    const key = `${this.prefix}/snapshots/${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.json`;
    const body = JSON.stringify(payload, null, 2);
    try {
      await this.client.put(key, body, 'application/json');
      return { ok: true, key, bytes: Buffer.byteLength(body, 'utf8'), degraded: false };
    } catch (e) {
      this.lastError = String(e?.message || e);
      return { ok: false, degraded: true, reason: this.lastError };
    }
  }

  health() {
    return {
      ok: !this.degraded,
      driver: 'r2',
      degraded: this.degraded,
      reason: this.reason,
      bucket: this.client?.bucket,
      endpoint: this.client?.endpoint,
      pending: this.buffer.length,
      flushed: this.flushed,
      dropped: this.dropped,
      lastError: this.lastError
    };
  }

  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.flush().catch(() => {});
  }
}

export function createArchive({ logger, env = process.env } = {}) {
  const client = R2Client.fromEnv(env);
  if (!client) return null;
  return new ArchiveStore({ client, logger, prefix: env.R2_PREFIX || 'blender-mcp-slots' });
}
