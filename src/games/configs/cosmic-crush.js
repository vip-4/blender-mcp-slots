import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑧：5x3 二十线星际消除 —— 雪崩连锁（Cascading）+ 递增倍率
 * 核心机制：
 *  - 中奖符号消除 → 上方下落 → 顶部补新符号，同一轮可连续连锁
 *  - 连锁倍率阶梯 [1,1,2,3,5,8,12]，单次旋转最多 8 段
 *  - 免费旋转内连锁倍率跨轮累积（不重置），形成经典「越滚越大」的爆点
 *  - 3+ 陨石散射 → 8/12/16 次免费旋转，可再触发 +4/+8/+12
 */
export default defineConfig({
  id: 'cosmic-crush',
  name: '星海消除 Cosmic Crush',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'cosmic',
    tagline: '20 线 · 雪崩连锁 · 倍率阶梯 · 免费旋转累积倍率',
    primary: '#7c5cff',
    secondary: '#3b2a8c',
    accent: '#4cc9f0',
    background: ['#1b1145', '#05030f'],
    frame: '#2a1f6b',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#8ea0ff', weight: 100, pay: { 3: 1, 4: 2, 5: 4 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#b6c2ff', weight: 100, pay: { 3: 1, 4: 2, 5: 5 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#5fd0ff', weight: 95, pay: { 3: 1, 4: 3, 5: 6 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#7cf0d0', weight: 95, pay: { 3: 1, 4: 3, 5: 8 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#c6a4ff', weight: 85, pay: { 3: 1, 4: 4, 5: 10 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#ff9ecb', weight: 75, pay: { 3: 2, 4: 5, 5: 12 } },
    { id: 'crystal', kind: 'standard', label: '星晶', shape: 'crystal', color: '#7de2fc', weight: 55, pay: { 3: 2, 4: 6, 5: 16 } },
    { id: 'comet', kind: 'standard', label: '彗星', shape: 'comet', color: '#c2f261', weight: 40, pay: { 3: 3, 4: 9, 5: 22 } },
    { id: 'planet', kind: 'standard', label: '行星', shape: 'orb', color: '#ffb703', weight: 24, pay: { 3: 4, 4: 13, 5: 36 } },
    { id: 'nova', kind: 'wild', label: '星爆 WILD', shape: 'star', color: '#ffe066', weight: 20, pay: { 3: 5, 4: 16, 5: 50 } },
    {
      id: 'meteor',
      kind: 'scatter',
      label: '陨石 SCATTER',
      shape: 'flame',
      color: '#ff6b6b',
      weight: 16,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { meteor: 6, nova: 26, planet: 30, comet: 48 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    cascades: {
      ladder: [1, 1, 2, 3, 5, 8, 12],
      maxSteps: 8,
      removeWild: false,
      // false（默认）= 每轮从阶梯起点重来；置 true 可让倍率在整段免费旋转内累积
      carryInFreeSpins: false
    },
    freeSpins: {
      trigger: { symbolId: 'meteor', counts: { 3: 8, 4: 12, 5: 16 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 0, max: 1 },
      retrigger: { counts: { 3: 4, 4: 8, 5: 12 }, maxSpins: 120 }
    }
  },
  tuning: { payScale: 0.949 },
  limits: { maxWinMultiplier: 10000 },
  rtp: { target: 0.96, tolerance: 0.02 },
  volatility: 'high'
});
