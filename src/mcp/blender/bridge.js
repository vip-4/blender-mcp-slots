import { AppError, ErrorCode } from '../../shared/errors.js';

/**
 * 与既有 Blender MCP 服务的通信桥。
 * 设计原则：
 *  1) 未配置 / 上游不可用 → 一律降级返回，绝不阻断 SLOT 主流程；
 *  2) 熔断器自动隔离故障上游，冷却后半开探测；
 *  3) 所有调用带超时，避免拖垮主服务。
 */
export class BlenderBridge {
  constructor({ enabled = false, endpoint, timeoutMs = 1500, failureThreshold = 3, cooldownMs = 30_000, logger, metrics } = {}) {
    this.enabled = enabled;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.logger = logger;
    this.metrics = metrics;
    this.failures = 0;
    this.openedAt = 0;
    this.state = enabled ? 'closed' : 'disabled';
  }

  getState() {
    if (!this.enabled) return 'disabled';
    if (this.state === 'open' && Date.now() - this.openedAt > this.cooldownMs) this.state = 'half-open';
    return this.state;
  }

  #noteFailure(err) {
    this.failures += 1;
    this.metrics?.bump('blender.failure');
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      this.logger?.warn('blender circuit opened', { error: err.message });
    }
  }

  #noteSuccess() {
    this.failures = 0;
    this.state = 'closed';
    this.metrics?.bump('blender.success');
  }

  async callTool(name, args = {}) {
    const state = this.getState();
    if (state === 'disabled') return { degraded: true, reason: 'blender bridge not configured' };
    if (state === 'open') return { degraded: true, reason: 'blender circuit open', retryAfterMs: this.cooldownMs - (Date.now() - this.openedAt) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `blender-${Date.now()}`, method: 'tools/call', params: { name, arguments: args } }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`upstream http ${res.status}`);
      const json = await res.json();
      this.#noteSuccess();
      return { degraded: false, result: json?.result ?? json };
    } catch (e) {
      this.#noteFailure(e);
      return { degraded: true, reason: e.message, upstream: this.endpoint };
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    const state = this.getState();
    if (state === 'disabled') return { enabled: false, state, degraded: true };
    const r = await this.callTool('blender.ping', {});
    return { enabled: true, state, endpoint: this.endpoint, ...r };
  }

  /** 把盘面 / 转轮帧推送给 Blender 做 3D 演出，失败静默降级。 */
  async renderSpin({ gameId, roundId, grid, theme }) {
    return this.callTool('blender.render_reel_frame', { gameId, roundId, grid, theme });
  }
}

export function createBlenderBridge(cfg, deps = {}) {
  return new BlenderBridge({ ...cfg, ...deps });
}
