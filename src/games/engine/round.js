import { Rng, hashServerSeed, randomSeed } from './rng.js';
import { spinGrid, respinColumns } from './reels.js';
import { evaluateGrid, evaluateCollect, roundMoney } from './evaluate.js';
import {
  scatterAward,
  applyExpandingWilds,
  assignWildMultipliers,
  rollCoinValue,
  jackpotFor,
  stepMultiplier,
  cascadeMultiplier,
  collapseGrid,
  pickExpandingSymbol,
  applyExpandingSymbol
} from './features.js';
import { lineCount } from './paylines.js';
import { AppError, ErrorCode } from '../../shared/errors.js';

export function normalizeBet(config, bet) {
  const levels = config.bet?.levels;
  const value = Number(bet);
  if (!Number.isFinite(value) || value <= 0) throw new AppError(ErrorCode.BetOutOfRange, 'bet must be a positive number');
  if (levels?.length) {
    const hit = levels.find((l) => Math.abs(l - value) < 1e-9);
    if (hit === undefined) {
      throw new AppError(ErrorCode.BetOutOfRange, `bet must be one of ${JSON.stringify(levels)}`, { levels });
    }
    return hit;
  }
  const min = config.bet?.min ?? 0.01;
  const max = config.bet?.max ?? 1000;
  if (value < min || value > max) throw new AppError(ErrorCode.BetOutOfRange, `bet out of range [${min}, ${max}]`);
  return value;
}

export function normalizeLines(config, lines) {
  const max = lineCount(config);
  if (config.evaluation.mode === 'ways') return max;
  const n = lines === undefined || lines === null ? max : Number(lines);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new AppError(ErrorCode.InvalidParams, `lines must be an integer in [1, ${max}]`, { max });
  }
  return n;
}

export function createState(config, { bet, lines, balance = 1000, serverSeed, clientSeed = '' } = {}) {
  const useBet = normalizeBet(config, bet ?? config.bet?.default ?? config.bet?.levels?.[0] ?? 1);
  const useLines = normalizeLines(config, lines);
  return {
    gameId: config.id,
    configVersion: config.version,
    bet: useBet,
    lines: useLines,
    balance: Number(balance ?? 1000),
    phase: 'base',
    rng: new Rng({ serverSeed: serverSeed || randomSeed(), clientSeed }).state,
    freeSpins: null,
    respins: null,
    // 同一轮同时命中「免费旋转」与「锁仓重旋」时，后者排队，避免两个状态机互相覆盖
    pendingRespin: null,
    history: [],
    stats: { rounds: 0, paidRounds: 0, totalBet: 0, totalWin: 0, biggestWin: 0, features: { freeSpins: 0, holdAndRespin: 0 } },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

const countSymbol = (grid, id) => grid.reduce((n, col) => n + col.filter((x) => x === id).length, 0);
const emptyMask = (reels, rows) => Array.from({ length: reels }, () => Array.from({ length: rows }, () => false));

/** 扫描盘面上的金币类符号（雪崩后盘面变化时需要重新定位） */
const scanBonusCells = (config, grid, cellValues) => {
  const out = [];
  for (const s of config.symbols.filter((x) => x.kind === 'bonus')) {
    for (let reel = 0; reel < grid.length; reel += 1) {
      for (let row = 0; row < grid[reel].length; row += 1) {
        if (grid[reel][row] === s.id) {
          out.push({ reel, row, symbol: s.id, value: cellValues.get(`${reel},${row}`) ?? null });
        }
      }
    }
  }
  return out;
};

/**
 * 单轮游戏流程（纯函数式：只依赖 config/derived/state）。
 * 同一 state + 同一 seed 必得同一结果 —— 可回放、可审计。
 */
export function playRound({ config, derived, state, bet, lines }) {
  const rng = Rng.from(state.rng);
  const useBet = normalizeBet(config, bet ?? state.bet);
  const useLines = normalizeLines(config, lines ?? state.lines);
  state.bet = useBet;
  state.lines = useLines;

  const isFree = state.phase === 'freeSpins';
  const isRespin = state.phase === 'holdAndRespin';
  const cost = isFree || isRespin ? 0 : useBet;

  if (state.balance + 1e-9 < cost) {
    throw new AppError(ErrorCode.BetOutOfRange, 'insufficient balance', { balance: state.balance, cost });
  }
  state.balance = roundMoney(state.balance - cost);
  state.stats.totalBet = roundMoney(state.stats.totalBet + cost);
  state.stats.rounds += 1;
  if (cost > 0) state.stats.paidRounds += 1;

  const fsCfg = config.features?.freeSpins;
  const hrCfg = config.features?.holdAndRespin;
  const mwCfg = config.features?.multiplierWild;
  const colCfg = config.features?.collect;
  const wildId = config.symbols.find((s) => s.kind === 'wild')?.id;

  // ---------- 1. 生成盘面 ----------
  let grid;
  let reelSet = 'base';
  if (isRespin) {
    reelSet = derived.strips.respin ? 'respin' : 'base';
    grid = respinColumns(derived.strips[reelSet], config.grid.rows, rng, state.respins.grid, state.respins.lockedMask);
  } else {
    reelSet = isFree && derived.strips.free ? 'free' : 'base';
    grid = spinGrid(derived.strips[reelSet], config.grid.rows, rng).grid;
  }

  // ---------- 2. 特性改写盘面 ----------
  let expanded = [];
  if (isFree && wildId && state.freeSpins.stickyWilds.length) {
    for (const p of state.freeSpins.stickyWilds) grid[p.reel][p.row] = wildId;
  }
  if (isFree && fsCfg?.expandingWild) {
    const r = applyExpandingWilds({ config, cfg: fsCfg.expandingWild, grid, rng });
    expanded = r.expanded;
    if (fsCfg.expandingWild.sticky) state.freeSpins.stickyWilds.push(...expanded);
  }

  // 扩展符号：免费旋转内选定的符号达到 minCount 即整轴展开（先于判定执行）
  let expandedSymbol = null;
  if (isFree && fsCfg?.expandingSymbol && state.freeSpins.selectedSymbol) {
    const r = applyExpandingSymbol({
      grid,
      symbolId: state.freeSpins.selectedSymbol,
      reels: fsCfg.expandingSymbol.reels,
      minCount: fsCfg.expandingSymbol.minCount ?? 2
    });
    if (r.reels?.length) {
      expandedSymbol = { symbolId: state.freeSpins.selectedSymbol, reels: r.reels, cells: r.expanded };
      expanded = expanded.concat(r.expanded);
    }
  }

  // ---------- 3. Wild 倍率 / 金币面值 ----------
  const { map: wildMultMap, list: wildMultipliers } = assignWildMultipliers({ config, cfg: mwCfg, grid, rng });
  const cellValues = new Map();
  if (colCfg || hrCfg) {
    for (let reel = 0; reel < grid.length; reel += 1) {
      for (let row = 0; row < grid[reel].length; row += 1) {
        const sym = config.symbols.find((s) => s.id === grid[reel][row]);
        if (sym?.kind !== 'bonus') continue;
        if (isRespin && state.respins.lockedMask[reel][row]) continue;
        const value = rollCoinValue(rng, (hrCfg?.coin ?? colCfg?.coin) || {});
        cellValues.set(`${reel},${row}`, value);
      }
    }
  }

  // ---------- 4. 中奖判定（可选：雪崩连锁） ----------
  const cascadesCfg = config.features?.cascades;
  const globalMultiplier = isFree ? state.freeSpins.multiplier : 1;
  const wildIds = config.symbols.filter((s) => s.kind === 'wild').map((s) => s.id);
  // carryInFreeSpins=true 时连锁倍率跨轮累积（更爆），否则每轮从阶梯起点重来（RTP 更可控）
  const carryCascades = !!(cascadesCfg?.carryInFreeSpins && isFree);
  let cascadeIndex = carryCascades ? state.freeSpins.cascadeIndex ?? 0 : 0;
  const cascadeSegments = [];
  const allLineWins = [];
  let evaluated = null;
  let evaluatedWin = 0;

  for (let step = 0; ; step += 1) {
    const cm = cascadesCfg ? cascadeMultiplier(cascadesCfg, cascadeIndex) : 1;
    const ev = evaluateGrid({
      config,
      grid,
      bet: useBet,
      activeLines: useLines,
      globalMultiplier: globalMultiplier * cm,
      wildMultipliers: wildMultMap,
      cellValues
    });
    if (step === 0) {
      evaluated = ev;
    } else {
      // 散射只在首段结算，避免连锁过程中重复计数
      ev.scatterWins = [];
    }
    evaluatedWin = roundMoney(evaluatedWin + ev.totalWin);
    allLineWins.push(...ev.lineWins);
    cascadeSegments.push({
      step,
      multiplier: cm,
      grid: grid.map((col) => col.slice()),
      win: ev.totalWin,
      winCells: ev.lineWins.flatMap((w) => w.positions),
      // 本段结束后被消除的格子与新落位（前端据此播放落位动画，审计据此复盘）
      removed: 0,
      newCells: []
    });

    const canCascade = !isRespin && cascadesCfg && ev.lineWins.length > 0 && step < (cascadesCfg.maxSteps ?? 8) - 1;
    if (!canCascade) break;

    const collapsed = collapseGrid({
      grid,
      winCells: ev.lineWins.flatMap((w) => w.positions),
      strips: derived.strips[reelSet],
      rng,
      removeWild: !!cascadesCfg.removeWild,
      wildIds
    });
    if (!collapsed.removed.length) break;

    cascadeSegments[cascadeSegments.length - 1].removed = collapsed.removed.length;
    cascadeSegments[cascadeSegments.length - 1].newCells = collapsed.newCells;
    grid = collapsed.grid;
    cascadeIndex += 1;
    for (const c of collapsed.removed) cellValues.delete(`${c.reel},${c.row}`);
    // 新落位补充金币面值与 Wild 倍率（旧位置倍率随符号一起消失）
    if (colCfg || hrCfg) {
      for (const c of collapsed.newCells) {
        const sym = config.symbols.find((s) => s.id === grid[c.reel][c.row]);
        if (sym?.kind === 'bonus') cellValues.set(`${c.reel},${c.row}`, rollCoinValue(rng, (hrCfg?.coin ?? colCfg?.coin) || {}));
      }
    }
    const remap = assignWildMultipliers({ config, cfg: mwCfg, grid, rng });
    wildMultMap.clear();
    for (const [k, v] of remap.map) wildMultMap.set(k, v);
    wildMultipliers.length = 0;
    wildMultipliers.push(...remap.list);
  }

  // 盘面经过连锁后已变化：按最终盘面重算金币格，保证重旋/收集取到正确位置
  if (cascadeSegments.length > 1) {
    evaluated.bonusCells = scanBonusCells(config, grid, cellValues);
  }
  evaluated.lineWins = allLineWins;
  evaluated.totalWin = roundMoney(evaluatedWin);
  if (isFree && state.freeSpins) state.freeSpins.cascadeIndex = carryCascades ? cascadeIndex : 0;

  if (isRespin) {
    // 重旋轮次只结算金币，不结算线赢/散射，保证 Hold & Respin 数学模型干净
    evaluated.lineWins = [];
    evaluated.scatterWins = [];
    evaluated.totalWin = 0;
  }

  const collect = !isRespin ? evaluateCollect({ config, grid, bet: useBet, bonusCells: evaluated.bonusCells, cellValues }) : null;
  let totalWin = roundMoney(evaluated.totalWin + (collect?.pay || 0));

  // ---------- 5. 奖励触发 ----------
  const triggered = [];
  const scatterId = fsCfg?.trigger?.symbolId;

  if (!isRespin) {
    const scatterCount = scatterId ? countSymbol(grid, scatterId) : 0;
    if (scatterCount > 0 && fsCfg) {
      const award = scatterAward(fsCfg, scatterCount);
      if (!isFree && award.spins > 0) {
        state.phase = 'freeSpins';
        state.freeSpins = {
          remaining: award.spins,
          played: 0,
          awarded: 0,
          totalSpins: award.spins,
          multiplier: fsCfg.multiplier?.start ?? 1,
          stickyWilds: [],
          cascadeIndex: 0,
          selectedSymbol: fsCfg.expandingSymbol ? pickExpandingSymbol({ config, cfg: fsCfg.expandingSymbol, rng }) : null,
          triggerBet: useBet,
          reelSet: derived.strips.free ? 'free' : 'base'
        };
        state.stats.features.freeSpins += 1;
        triggered.push({ type: 'freeSpins', spins: award.spins, scatterCount });
      } else if (isFree && award.retrigger > 0) {
        const cap = fsCfg.retrigger?.maxSpins ?? 200;
        const add = Math.min(award.retrigger, Math.max(0, cap - state.freeSpins.remaining));
        state.freeSpins.remaining += add;
        state.freeSpins.totalSpins += add;
        if (add > 0) state.freeSpins.multiplier = stepMultiplier(state.freeSpins.multiplier, fsCfg, 'retrigger');
        triggered.push({ type: 'freeSpinsRetrigger', spins: add, scatterCount, multiplier: state.freeSpins.multiplier });
      }
    }

    if (!isFree && hrCfg && evaluated.bonusCells.length >= (hrCfg.triggerCount ?? 6)) {
      const held = evaluated.bonusCells.map((c) => ({ ...c, value: c.value ?? rollCoinValue(rng, hrCfg.coin || {}) }));
      const mask = emptyMask(config.grid.reels, config.grid.rows);
      for (const c of held) mask[c.reel][c.row] = true;
      const payload = {
        remaining: hrCfg.respins ?? 3,
        held,
        lockedMask: mask,
        grid,
        awarded: 0,
        triggerBet: useBet,
        jackpot: null
      };
      if (state.phase === 'base') {
        state.phase = 'holdAndRespin';
        state.respins = payload;
        state.stats.features.holdAndRespin += 1;
        triggered.push({ type: 'holdAndRespin', coins: held.length, respins: payload.remaining });
      } else {
        // 本轮已先触发免费旋转：重旋排队，免费旋转结算后自动启动
        state.pendingRespin = payload;
        state.stats.features.holdAndRespin += 1;
        triggered.push({ type: 'holdAndRespinQueued', coins: held.length, respins: payload.remaining });
      }
    }
  }

  // ---------- 6. 重旋轮次推进 ----------
  let respinSettlement = null;
  if (isRespin) {
    const rs = state.respins;
    const fresh = evaluated.bonusCells.filter((c) => !rs.lockedMask[c.reel][c.row]);
    if (fresh.length) {
      for (const c of fresh) {
        rs.held.push({ ...c, value: cellValues.get(`${c.reel},${c.row}`) ?? rollCoinValue(rng, hrCfg.coin || {}) });
        rs.lockedMask[c.reel][c.row] = true;
      }
      rs.remaining = hrCfg?.respins ?? 3;
    } else {
      rs.remaining -= 1;
    }
    rs.grid = grid;
    const full = rs.held.length >= config.grid.reels * config.grid.rows;
    if (rs.remaining < 0 || full) {
      const sum = rs.held.reduce((a, c) => a + (c.value || 0), 0);
      const jp = jackpotFor(rs.held.length, hrCfg || {});
      const award = roundMoney((sum + (jp?.multiplier || 0)) * rs.triggerBet);
      totalWin = roundMoney(totalWin + award);
      rs.awarded = award;
      rs.jackpot = jp;
      respinSettlement = { coins: rs.held.length, values: rs.held.map((c) => c.value), jackpot: jp, pay: award };
      state.phase = 'base';
      state.respins = null;
      triggered.push({ type: 'holdAndRespinSettled', ...respinSettlement });
    }
  }

  // ---------- 7. 免费旋转推进 ----------
  if (isFree && state.phase === 'freeSpins') {
    state.freeSpins.remaining -= 1;
    state.freeSpins.played += 1;
    state.freeSpins.awarded = roundMoney(state.freeSpins.awarded + totalWin);
    if (state.freeSpins.remaining <= 0) {
      const summary = { ...state.freeSpins };
      state.phase = 'base';
      state.freeSpins = null;
      triggered.push({ type: 'freeSpinsSettled', spins: summary.played, pay: summary.awarded });
      const queued = state.pendingRespin;
      if (queued) {
        state.pendingRespin = null;
        state.phase = 'holdAndRespin';
        state.respins = queued;
        triggered.push({ type: 'holdAndRespin', coins: queued.held.length, respins: queued.remaining, queued: true });
      }
    }
  }

  // ---------- 8. 封顶与结算 ----------
  const cap = (config.limits?.maxWinMultiplier ?? 0) * useBet;
  let capped = false;
  if (cap > 0 && totalWin > cap) {
    totalWin = roundMoney(cap);
    capped = true;
  }
  state.balance = roundMoney(state.balance + totalWin);
  state.stats.totalWin = roundMoney(state.stats.totalWin + totalWin);
  state.stats.biggestWin = Math.max(state.stats.biggestWin, totalWin);
  state.rng = rng.state;
  state.updatedAt = Date.now();

  const result = {
    roundId: `${config.id}-${state.stats.rounds}-${state.rng.nonce}`,
    gameId: config.id,
    configVersion: config.version,
    phase: isFree ? 'freeSpins' : isRespin ? 'holdAndRespin' : 'base',
    reelSet,
    bet: useBet,
    cost,
    lines: useLines,
    grid,
    multiplier: globalMultiplier,
    lineWins: evaluated.lineWins,
    scatterWins: evaluated.scatterWins,
    bonusCells: evaluated.bonusCells.map((c) => ({ ...c, value: cellValues.get(`${c.reel},${c.row}`) ?? c.value ?? null })),
    wildMultipliers,
    expandedWilds: expanded,
    expandingSymbol: expandedSymbol,
    selectedSymbol: state.freeSpins?.selectedSymbol ?? null,
    cascadeCount: cascadesCfg ? cascadeSegments.length : 0,
    cascadeMultiplier: cascadesCfg ? cascadeMultiplier(cascadesCfg, cascadeIndex) : 1,
    cascades: cascadesCfg && cascadeSegments.length > 1 ? cascadeSegments : null,
    collect,
    totalWin,
    capped,
    triggered,
    freeSpins: state.freeSpins ? { ...state.freeSpins } : null,
    respins: state.respins
      ? { remaining: state.respins.remaining, coins: state.respins.held.length, held: state.respins.held }
      : null,
    nextPhase: state.phase,
    balance: state.balance,
    fairness: {
      serverSeedHash: hashServerSeed(state.rng.serverSeed),
      clientSeed: state.rng.clientSeed,
      nonce: state.rng.nonce
    }
  };

  if (respinSettlement) result.respinSettlement = respinSettlement;
  state.history.unshift({ roundId: result.roundId, bet: useBet, win: totalWin, phase: result.phase, at: Date.now() });
  if (state.history.length > 50) state.history.length = 50;
  return result;
}
