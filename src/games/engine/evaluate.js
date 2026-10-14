import { resolveLines, lineCount } from './paylines.js';

export const roundMoney = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;

export function indexSymbols(config) {
  const map = new Map();
  for (const s of config.symbols) map.set(s.id, s);
  return map;
}

export function betPerLine(config, bet, activeLines) {
  const n = config.evaluation.mode === 'ways' ? lineCount(config) : Math.max(1, activeLines);
  return bet / n;
}

const isWild = (s) => s?.kind === 'wild';

/**
 * 中奖判定：同一份实现同时支持 lines 与 ways 两种评估模式，
 * 由 CONFIG.evaluation.mode 决定，新增机台无需改动此处代码。
 *
 * @param {object} params
 * @param {object} params.config      机台 CONFIG
 * @param {string[][]} params.grid    grid[reel][row]
 * @param {number} params.bet         本轮总投注额
 * @param {number} params.activeLines 生效线数
 * @param {number} params.globalMultiplier 特性全局倍率（免费旋转递进倍率等）
 * @param {Map<string, number>} params.wildMultipliers key=`reel,row` → wild 携带倍率
 * @param {Map<string, number>} params.cellValues      key=`reel,row` → 金币面值（倍率）
 */
export function evaluateGrid({
  config,
  grid,
  bet,
  activeLines,
  globalMultiplier = 1,
  wildMultipliers = new Map(),
  cellValues = new Map()
}) {
  const symbolMap = indexSymbols(config);
  const minMatch = config.evaluation.minMatch || 3;
  const perUnit = betPerLine(config, bet, activeLines);
  const lineWins = [];
  let total = 0;

  const payOf = (symbolId, count) => symbolMap.get(symbolId)?.pay?.[count] ?? 0;

  if (config.evaluation.mode === 'ways') {
    const waysCount = lineCount(config);
    const perWay = bet / waysCount;
    const candidates = config.symbols
      .filter((s) => s.kind === 'standard' || s.kind === 'wild')
      .map((s) => s.id);
    for (const id of candidates) {
      let count = 0;
      let ways = 1;
      const positions = [];
      for (let reel = 0; reel < grid.length; reel += 1) {
        const hits = [];
        for (let row = 0; row < grid[reel].length; row += 1) {
          const cell = grid[reel][row];
          const sym = symbolMap.get(cell);
          if (cell === id || isWild(sym)) hits.push({ reel, row });
        }
        if (!hits.length) break;
        ways *= hits.length;
        count += 1;
        positions.push(...hits);
      }
      if (count < minMatch) continue;
      const pay = payOf(id, count);
      if (pay <= 0) continue;
      let mult = globalMultiplier;
      for (const p of positions) mult *= wildMultipliers.get(`${p.reel},${p.row}`) ?? 1;
      const win = roundMoney(pay * perWay * ways * mult);
      if (win <= 0) continue;
      lineWins.push({ line: -1, symbol: id, count, ways, positions, multiplier: mult, pay: win });
      total += win;
    }
  } else {
    const lines = resolveLines(config);
    const count = Math.min(activeLines || lines.length, lines.length);
    for (let li = 0; li < count; li += 1) {
      const pattern = lines[li];
      const seq = pattern.map((p) => grid[p.reel]?.[p.row]);
      if (seq.some((x) => x === undefined)) continue;

      let baseId = null;
      for (const id of seq) {
        if (!isWild(symbolMap.get(id))) {
          baseId = id;
          break;
        }
      }
      if (baseId === null) baseId = seq[0];

      const matched = [];
      for (let i = 0; i < seq.length; i += 1) {
        const id = seq[i];
        if (id === baseId || isWild(symbolMap.get(id))) matched.push({ ...pattern[i], symbol: id });
        else break;
      }
      if (matched.length < minMatch) continue;
      const pay = payOf(baseId, matched.length);
      if (pay <= 0) continue;

      let mult = globalMultiplier;
      for (const m of matched) mult *= wildMultipliers.get(`${m.reel},${m.row}`) ?? 1;
      const win = roundMoney(pay * perUnit * mult);
      if (win <= 0) continue;
      lineWins.push({
        line: li,
        symbol: baseId,
        count: matched.length,
        positions: matched.map(({ reel, row }) => ({ reel, row })),
        multiplier: mult,
        pay: win
      });
      total += win;
    }
  }

  // 散射（scatter）：任意位置计数，按总投注额结算
  const scatterWins = [];
  for (const s of config.symbols.filter((x) => x.kind === 'scatter')) {
    let count = 0;
    for (let reel = 0; reel < grid.length; reel += 1) {
      for (let row = 0; row < grid[reel].length; row += 1) if (grid[reel][row] === s.id) count += 1;
    }
    if (!count) continue;
    const pay = s.pay?.[count] ?? 0;
    const basis = s.payBasis === 'line' ? perUnit : bet;
    const win = roundMoney(pay * basis * globalMultiplier);
    if (win > 0) {
      scatterWins.push({ symbol: s.id, count, pay: win });
      total += win;
    }
  }

  // 金币类符号（bonus）：记录位置，供 Hold & Respin / 收集类特性消费
  const bonusCells = [];
  for (const s of config.symbols.filter((x) => x.kind === 'bonus')) {
    for (let reel = 0; reel < grid.length; reel += 1) {
      for (let row = 0; row < grid[reel].length; row += 1) {
        if (grid[reel][row] === s.id) {
          bonusCells.push({ reel, row, symbol: s.id, value: cellValues.get(`${reel},${row}`) ?? null });
        }
      }
    }
  }

  return {
    lineWins: lineWins.sort((a, b) => b.pay - a.pay),
    scatterWins,
    bonusCells,
    totalWin: roundMoney(total)
  };
}

/** 收集类特殊符号：收集者落在指定轴时，兑现盘面所有金币面值。 */
export function evaluateCollect({ config, grid, bet, bonusCells, cellValues }) {
  const cfg = config.features?.collect;
  if (!cfg || !bonusCells.length) return null;
  const collectReels = cfg.reels || [grid.length - 1];
  let hit = null;
  for (const reel of collectReels) {
    for (let row = 0; row < grid[reel].length; row += 1) {
      if (grid[reel][row] === cfg.symbolId) hit = { reel, row };
    }
  }
  if (!hit) return null;
  let sum = 0;
  for (const c of bonusCells) sum += cellValues.get(`${c.reel},${c.row}`) ?? c.value ?? 0;
  if (sum <= 0) return null;
  return { symbol: cfg.symbolId, at: hit, collected: bonusCells.length, pay: roundMoney(sum * bet) };
}
