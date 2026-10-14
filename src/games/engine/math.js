import { createState, playRound } from './round.js';
import { lineCount } from './paylines.js';
import { roundMoney } from './evaluate.js';

/**
 * 蒙特卡洛自检：用于验证 CONFIG 的实际 RTP / 命中率 / 波动水平是否落在设计区间。
 * 既是一个 MCP 工具，也是 CI 中的回归测试手段。
 */
export function simulate({ config, derived, spins = 100000, bet, lines, seed = 'rtp-simulation' }) {
  const useBet = bet ?? config.bet?.default ?? config.bet?.levels?.[0] ?? 1;
  const useLines = lines ?? lineCount(config);
  const state = createState(config, { bet: useBet, lines: useLines, balance: Number.MAX_SAFE_INTEGER / 4, serverSeed: seed });

  let totalBet = 0;
  let totalWin = 0;
  let hits = 0;
  let maxWin = 0;
  const features = {};
  const perSpin = [];

  // 以「付费轮次」为计数口径：免费旋转/重旋不消耗预算，不计入 spins
  let guard = 0;
  while (state.stats.paidRounds < spins && guard < spins * 10) {
    guard += 1;
    const r = playRound({ config, derived, state });
    if (r.cost > 0) {
      totalBet += r.cost;
      perSpin.push(r.totalWin / r.cost);
      if (r.totalWin > 0) hits += 1;
    }
    totalWin += r.totalWin;
    maxWin = Math.max(maxWin, r.totalWin);
    for (const t of r.triggered) {
      const key = t.type;
      features[key] = (features[key] || 0) + 1;
    }
  }

  const paidRounds = Math.max(1, state.stats.paidRounds);
  const mean = perSpin.reduce((a, b) => a + b, 0) / Math.max(1, perSpin.length);
  const variance = perSpin.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, perSpin.length);
  const stdDev = Math.sqrt(variance);

  return {
    gameId: config.id,
    configVersion: config.version,
    spins,
    bet: useBet,
    lines: useLines,
    totalBet: roundMoney(totalBet),
    totalWin: roundMoney(totalWin),
    rtp: +(totalWin / Math.max(1e-9, totalBet)).toFixed(4),
    target: config.rtp?.target ?? null,
    hitFrequency: +(hits / paidRounds).toFixed(4),
    maxWin: roundMoney(maxWin),
    maxWinMultiplier: +(maxWin / useBet).toFixed(2),
    stdDevPerSpin: +stdDev.toFixed(3),
    volatilityIndex: +(stdDev / Math.max(1e-9, mean || 1)).toFixed(3),
    features
  };
}
