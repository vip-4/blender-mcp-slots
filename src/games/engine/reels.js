import { Rng } from './rng.js';

/**
 * 转轮条带（reel strip）构建：
 * 由 CONFIG 中的符号权重推导出每轴的物理条带，spin 时只需随机一个停止位。
 * 条带用 config.id 做种子确定性生成 —— 同一份 CONFIG 在任意进程/机器上条带完全一致，
 * 便于审计、复盘与 Blender 端做可视化映射。
 */
export function symbolWeight(symbol, reelIndex, overrides = {}) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, symbol.id)) {
    const w = overrides[symbol.id];
    if (typeof w === 'number') return w;
    if (Array.isArray(w)) return w[reelIndex] ?? w[w.length - 1];
  }
  const w = symbol.weight;
  if (typeof w === 'number') return w;
  if (Array.isArray(w)) return w[reelIndex] ?? w[w.length - 1];
  return 0;
}

export function buildReelStrips(config, reelSetKey = 'base') {
  const set = config.reelSets?.[reelSetKey];
  if (!set) throw new Error(`reelSet "${reelSetKey}" not found in ${config.id}`);

  const length = set.length || 64;
  const overrides = set.overrides || {};
  const exclude = new Set(set.exclude || []);
  const pool = config.symbols.filter((s) => !exclude.has(s.id));
  const strips = [];

  for (let reel = 0; reel < config.grid.reels; reel += 1) {
    const rng = new Rng({ serverSeed: `${config.id}:${reelSetKey}:${reel}` });
    const entries = pool
      .map((s) => ({ id: s.id, weight: symbolWeight(s, reel, overrides) }))
      .filter((e) => e.weight > 0);
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (!entries.length || total <= 0) throw new Error(`reel ${reel} of ${config.id}/${reelSetKey} has no weighted symbols`);

    // 最大余额法分配名额：保证每个有权重的符号至少出现 1 次，且总数精确等于 length
    const exact = entries.map((e) => (e.weight / total) * length);
    const quota = exact.map((x) => Math.max(1, Math.floor(x)));
    let diff = length - quota.reduce((a, b) => a + b, 0);
    const byFrac = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
    let k = 0;
    while (diff > 0 && byFrac.length) {
      quota[byFrac[k % byFrac.length].i] += 1;
      diff -= 1;
      k += 1;
    }
    while (diff < 0) {
      let best = -1;
      let bestValue = 1;
      for (let i = 0; i < quota.length; i += 1) {
        if (quota[i] > bestValue) {
          bestValue = quota[i];
          best = i;
        }
      }
      if (best < 0) break;
      quota[best] -= 1;
      diff += 1;
    }

    const cells = [];
    entries.forEach((e, i) => {
      for (let n = 0; n < quota[i]; n += 1) cells.push(e.id);
    });
    strips.push(rng.shuffle(cells.slice(0, length)));
  }
  return strips;
}

/** 旋转一次：每轴随机一个停止位，取连续 rows 个格子作为可见窗口。 */
export function spinGrid(strips, rows, rng) {
  const grid = [];
  const stops = [];
  for (let reel = 0; reel < strips.length; reel += 1) {
    const strip = strips[reel];
    const stop = rng.int(strip.length);
    stops.push(stop);
    const column = [];
    for (let row = 0; row < rows; row += 1) column.push(strip[(stop + row) % strip.length]);
    grid.push(column);
  }
  return { grid, stops };
}

/**
 * 重旋（Hold & Respin）场景：被锁定的格子沿用上一盘面，其余格子重掷。
 * @param {string[][]} baseGrid 上一轮盘面
 * @param {boolean[][]} lockedMask true = 锁定
 */
export function respinColumns(strips, rows, rng, baseGrid, lockedMask) {
  const grid = [];
  for (let reel = 0; reel < strips.length; reel += 1) {
    const column = [];
    for (let row = 0; row < rows; row += 1) {
      column.push(lockedMask?.[reel]?.[row] ? baseGrid[reel][row] : null);
    }
    grid.push(column);
  }
  for (let reel = 0; reel < strips.length; reel += 1) {
    const strip = strips[reel];
    for (let row = 0; row < rows; row += 1) {
      if (grid[reel][row] === null) grid[reel][row] = strip[rng.int(strip.length)];
    }
  }
  return grid;
}
