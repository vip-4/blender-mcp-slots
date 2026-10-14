/** 进程内指标采集：计数、耗时分布、最近错误。零依赖，可直接暴露给 /metrics。 */
export function createMetrics() {
  const counters = new Map();
  const timings = new Map();
  const lastErrors = [];

  const bump = (key, n = 1) => counters.set(key, (counters.get(key) || 0) + n);

  return {
    bump,
    count: (key) => counters.get(key) || 0,
    observe(key, ms) {
      const cur = timings.get(key) || { n: 0, total: 0, max: 0 };
      cur.n += 1;
      cur.total += ms;
      cur.max = Math.max(cur.max, ms);
      timings.set(key, cur);
    },
    error(code, message) {
      bump(`error.${code}`);
      lastErrors.unshift({ ts: Date.now(), code, message });
      if (lastErrors.length > 20) lastErrors.pop();
    },
    snapshot() {
      const t = {};
      for (const [k, v] of timings) t[k] = { n: v.n, avgMs: +(v.total / v.n).toFixed(2), maxMs: +v.max.toFixed(2) };
      return {
        counters: Object.fromEntries(counters),
        timings: t,
        lastErrors,
        uptimeSec: Math.round(process.uptime()),
        memory: process.memoryUsage()
      };
    },
    reset() {
      counters.clear();
      timings.clear();
      lastErrors.length = 0;
    }
  };
}

/** 包裹异步函数，统一记录调用次数、耗时与错误分类。 */
export function withMetrics(metrics, name, fn) {
  return async (...args) => {
    const started = Date.now();
    metrics.bump(`call.${name}`);
    try {
      const result = await fn(...args);
      metrics.bump(`ok.${name}`);
      return result;
    } catch (e) {
      metrics.bump(`fail.${name}`);
      metrics.error(e?.code ?? 'UNKNOWN', e?.message ?? String(e));
      throw e;
    } finally {
      metrics.observe(name, Date.now() - started);
    }
  };
}
