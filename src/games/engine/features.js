/**
 * 特性（Feature）工具集：所有行为都由 CONFIG.features 驱动。
 * 新增一种玩法只需在这里加一个纯函数 + 在 CONFIG 中声明，不触碰判定与会话层。
 */

/** scatter 数量 → 免费旋转次数（未命中返回 0） */
export function scatterAward(freeSpinsCfg, count) {
  if (!freeSpinsCfg) return { spins: 0, retrigger: 0 };
  const counts = freeSpinsCfg.trigger?.counts || {};
  const spins = counts[count] || 0;
  const retrigger = freeSpinsCfg.retrigger?.counts?.[count] || 0;
  return { spins, retrigger };
}

/** 扩张 Wild：指定轴上出现 Wild 时，整轴变为 Wild（可配置为黏性）。 */
export function applyExpandingWilds({ config, cfg, grid, rng, sticky = false }) {
  if (!cfg) return { expanded: [], sticky: [] };
  const wildIds = config.symbols.filter((s) => s.kind === 'wild').map((s) => s.id);
  if (!wildIds.length) return { expanded: [], sticky: [] };
  const expanded = [];
  for (const reel of cfg.reelIndexes || []) {
    if (reel < 0 || reel >= grid.length) continue;
    const hasWild = grid[reel].some((id) => wildIds.includes(id));
    const roll = cfg.probability === undefined ? 1 : rng.float();
    if (!hasWild || roll > cfg.probability) continue;
    const wild = wildIds.includes(grid[reel][0]) ? grid[reel][0] : wildIds[0];
    for (let row = 0; row < grid[reel].length; row += 1) {
      if (grid[reel][row] !== wild) {
        grid[reel][row] = wild;
        expanded.push({ reel, row });
      }
    }
  }
  return { expanded, sticky: sticky ? expanded : [] };
}

/** 倍率 Wild：Wild 落位时按权重随机携带倍率。 */
export function assignWildMultipliers({ config, cfg, grid, rng }) {
  if (!cfg) return { map: new Map(), list: [] };
  const wildIds = config.symbols.filter((s) => s.kind === 'wild').map((s) => s.id);
  const map = new Map();
  const list = [];
  const values = cfg.values || [2];
  const weights = cfg.weights || values.map(() => 1);
  for (let reel = 0; reel < grid.length; reel += 1) {
    for (let row = 0; row < grid[reel].length; row += 1) {
      if (!wildIds.includes(grid[reel][row])) continue;
      const idx = rng.weighted(values.map((v, i) => ({ v, weight: weights[i] ?? 1 }))).v;
      map.set(`${reel},${row}`, idx);
      list.push({ reel, row, value: idx });
    }
  }
  return { map, list };
}

/** 金币面值抽取（倍率，最终乘以总投注额） */
export function rollCoinValue(rng, cfg) {
  const values = cfg?.values || [1, 2, 3, 5, 10];
  const weights = cfg?.weights || values.map(() => 1);
  return rng.weighted(values.map((v, i) => ({ v, weight: weights[i] ?? 1 }))).v;
}

/** Hold & Respin 结束时的固定奖池判定 */
export function jackpotFor(heldCount, cfg) {
  const tiers = cfg?.jackpots || {};
  if (heldCount >= (tiers.grand?.cells ?? Infinity)) return { tier: 'GRAND', multiplier: tiers.grand.multiplier };
  if (heldCount >= (tiers.major?.cells ?? Infinity)) return { tier: 'MAJOR', multiplier: tiers.major.multiplier };
  if (heldCount >= (tiers.minor?.cells ?? Infinity)) return { tier: 'MINOR', multiplier: tiers.minor.multiplier };
  if (heldCount >= (tiers.mini?.cells ?? Infinity)) return { tier: 'MINI', multiplier: tiers.mini.multiplier };
  return null;
}

/* ============================================================
 *  雪崩连锁（Cascading / Avalanche Reels）
 *  中奖符号消除 → 上方符号下落 → 顶部补新符号 → 倍率按阶梯递增
 *  纯数据驱动：CONFIG.features.cascades = { ladder, maxSteps, removeWild }
 * ============================================================ */

/** 第 step 段雪崩对应的倍率（超出 ladder 长度则取最后一级） */
export function cascadeMultiplier(cfg, step) {
  const ladder = cfg?.ladder?.length ? cfg.ladder : [1];
  return ladder[Math.min(Math.max(step, 0), ladder.length - 1)];
}

/**
 * 消除中奖格并让上方符号下落，顶部用条带补新符号。
 * @returns {{grid: string[][], removed: object[], newCells: object[]}}
 */
export function collapseGrid({ grid, winCells, strips, rng, removeWild = false, wildIds = [] }) {
  const reels = grid.length;
  const rows = grid[0].length;
  const mask = Array.from({ length: reels }, () => Array.from({ length: rows }, () => false));
  const removed = [];
  for (const p of winCells) {
    if (!mask[p.reel] || p.row >= rows) continue;
    if (!removeWild && wildIds.includes(grid[p.reel][p.row])) continue;
    if (mask[p.reel][p.row]) continue;
    mask[p.reel][p.row] = true;
    removed.push({ reel: p.reel, row: p.row, symbol: grid[p.reel][p.row] });
  }
  if (!removed.length) return { grid, removed, newCells: [] };

  const next = [];
  const newCells = [];
  for (let reel = 0; reel < reels; reel += 1) {
    const survivors = [];
    for (let row = 0; row < rows; row += 1) if (!mask[reel][row]) survivors.push(grid[reel][row]);
    const freshCount = rows - survivors.length;
    const strip = strips?.[reel]?.length ? strips[reel] : null;
    const column = [];
    for (let i = 0; i < freshCount; i += 1) {
      column.push(strip ? strip[rng.int(strip.length)] : survivors[0] ?? grid[reel][0]);
      newCells.push({ reel, row: i });
    }
    for (const s of survivors) column.push(s);
    next.push(column);
  }
  return { grid: next, removed, newCells };
}

/* ============================================================
 *  扩展符号（Expanding Symbol，Book 系经典玩法）
 *  进入免费旋转时随机选定一个符号；盘面出现 >= minCount 个时整轴展开
 * ============================================================ */

export function pickExpandingSymbol({ config, cfg, rng }) {
  const pool = config.symbols.filter((s) => s.kind === 'standard' && s.pay);
  const candidates = (cfg?.candidates || []).filter((id) => pool.some((s) => s.id === id));
  const list = candidates.length ? candidates : pool.map((s) => s.id);
  if (!list.length) return null;
  return list[rng.int(list.length)];
}

export function applyExpandingSymbol({ grid, symbolId, reels, minCount = 2 }) {
  if (!symbolId) return { expanded: [], reels: [] };
  const count = grid.reduce((n, col) => n + col.filter((x) => x === symbolId).length, 0);
  if (count < minCount) return { expanded: [], reels: [], count };
  const targets = [];
  for (let reel = 0; reel < grid.length; reel += 1) {
    if (!grid[reel].includes(symbolId)) continue;
    if (reels?.length && !reels.includes(reel)) continue;
    targets.push(reel);
    for (let row = 0; row < grid[reel].length; row += 1) grid[reel][row] = symbolId;
  }
  return {
    expanded: targets.flatMap((reel) => grid[reel].map((_, row) => ({ reel, row }))),
    reels: targets,
    count
  };
}

/** 免费旋转倍率递进 */
export function stepMultiplier(current, cfg, reason) {
  if (!cfg?.multiplier) return current;
  const step = reason === 'retrigger' ? cfg.multiplier.onRetrigger || 0 : cfg.multiplier.onSpin || 0;
  const next = current + step;
  return Math.min(next, cfg.multiplier.max ?? 10);
}
