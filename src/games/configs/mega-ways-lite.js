import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑫：5x3 243 WAYS 通路制 + 雪崩连锁（Megaways-lite）
 * 核心机制：
 *  - 通路制（ways）：不设固定线，左起相邻轴同符号即中奖，通路数 = 各轴命中格数之积（最多 3^5）
 *  - 雪崩连锁（cascades）：中奖格消除 → 上方下落 → 顶部补新符号，倍率按阶梯 [1,1,2,3,5] 递增
 *  - carryInFreeSpins=true：连锁倍率在整段免费旋转内跨轮累积，形成「越滚越大」的爆点
 *  - 3+ 焰核散射 → 8/12/15 次免费旋转，可再触发 +4/+6/+8（封顶 60 次）
 *
 * 调参说明：通路制下每个符号都会按「命中格数之积」计通路数，叠加雪崩与倍率累积后
 * 赔付极易放大。因此本台刻意不使用 multiplierWild，并把倍率阶梯与免费旋转次数压平，
 * 使整体落在 0.96 附近的高波动区间。
 */
export default defineConfig({
  id: 'mega-ways-lite',
  name: '裂空通路 Mega Ways Lite',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'rift',
    tagline: '243 WAYS · 雪崩连锁 · 累积倍率',
    primary: '#4cc9f0',
    secondary: '#4361ee',
    accent: '#f72585',
    background: ['#0b1026', '#03040d'],
    frame: '#1b2a6b',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'ways', direction: 'leftToRight', ways: 243, minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#8ea0ff', weight: 100, pay: { 3: 8, 4: 24, 5: 64 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#b6c2ff', weight: 100, pay: { 3: 8, 4: 24, 5: 72 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#5fd0ff', weight: 95, pay: { 3: 16, 4: 32, 5: 88 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#7cf0d0', weight: 95, pay: { 3: 16, 4: 40, 5: 104 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#c6a4ff', weight: 85, pay: { 3: 16, 4: 48, 5: 128 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#ff9ecb', weight: 75, pay: { 3: 24, 4: 64, 5: 176 } },
    { id: 'crystal', kind: 'standard', label: '裂晶', shape: 'crystal', color: '#7de2fc', weight: 55, pay: { 3: 32, 4: 80, 5: 224 } },
    { id: 'comet', kind: 'standard', label: '陨彗', shape: 'comet', color: '#c2f261', weight: 40, pay: { 3: 40, 4: 104, 5: 304 } },
    { id: 'orb', kind: 'standard', label: '星核', shape: 'orb', color: '#ffb703', weight: 24, pay: { 3: 64, 4: 160, 5: 480 } },
    { id: 'wild', kind: 'wild', label: '裂空 WILD', shape: 'gem', color: '#f72585', weight: 12, pay: { 3: 80, 4: 208, 5: 640 } },
    {
      id: 'flame',
      kind: 'scatter',
      label: '焰核 SCATTER',
      shape: 'flame',
      color: '#ff6b6b',
      weight: 16,
      payBasis: 'totalBet',
      pay: { 3: 4, 4: 20, 5: 80 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { flame: 10, wild: 16, orb: 30, comet: 48 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    cascades: {
      ladder: [1, 1, 2, 3, 5],
      maxSteps: 6,
      removeWild: false,
      // true = 倍率在整段免费旋转内跨轮累积，不随每轮重置
      carryInFreeSpins: true
    },
    freeSpins: {
      trigger: { symbolId: 'flame', counts: { 3: 8, 4: 12, 5: 15 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 4, 4: 6, 5: 8 }, maxSpins: 60 }
    }
  },
  // 运营调参：赔付表全局系数（改后请用 slots.simulate 复核实际 RTP）
  tuning: { payScale: 1.202 },
  limits: { maxWinMultiplier: 10000 },
  rtp: { target: 0.96, tolerance: 0.02 },
  volatility: 'high'
});
