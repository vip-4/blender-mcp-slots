import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑬：3x3 五线果盘嘉年华 —— 经典 3 轴补齐「免费旋转」
 * 与既有 classic-fruits 的差异（同尺寸、不同玩法，避免重复）：
 *  - classic-fruits：3x3 五线，仅倍率 WILD，无免费旋转，低波动
 *  - fruit-fiesta：3x3 五线，新增 SCATTER 触发 10 次免费旋转（起始 2x 全局倍率，可再触发）
 *  - 免费旋转使用独立 reelSet（WILD/7 权重上调），形成明确的高光段落
 */
export default defineConfig({
  id: 'fruit-fiesta',
  name: '果盘嘉年华 Fruit Fiesta',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'fiesta',
    tagline: '3 轴 5 线 · SCATTER 免费旋转 · 倍率 WILD',
    primary: '#ff7b00',
    secondary: '#ffdd00',
    accent: '#00b4d8',
    background: ['#3a1505', '#140701'],
    frame: '#8c3b0e',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 3, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '3x3:5', minMatch: 3 },
  symbols: [
    { id: 'cherry', kind: 'standard', label: '樱桃', shape: 'cherry', color: '#e5383b', weight: 30, pay: { 3: 3 } },
    { id: 'lemon', kind: 'standard', label: '柠檬', shape: 'lemon', color: '#ffd60a', weight: 28, pay: { 3: 2 } },
    { id: 'grape', kind: 'standard', label: '葡萄', shape: 'grape', color: '#9d4edd', weight: 20, pay: { 3: 5 } },
    { id: 'bell', kind: 'standard', label: '铃铛', shape: 'bell', color: '#ffb703', weight: 14, pay: { 3: 9 } },
    { id: 'bar', kind: 'standard', label: 'BAR', shape: 'bar', color: '#f1faee', weight: 8, pay: { 3: 21 } },
    { id: 'seven', kind: 'standard', label: '7', shape: 'seven', color: '#ef233c', weight: 5, pay: { 3: 53 } },
    { id: 'wild', kind: 'wild', label: '嘉年华 WILD', shape: 'star', color: '#ffdd00', weight: 4, pay: { 3: 74 } },
    {
      id: 'gem',
      kind: 'scatter',
      label: '彩钻 SCATTER',
      shape: 'gem',
      color: '#00b4d8',
      weight: 7,
      payBasis: 'totalBet',
      pay: { 3: 1 }
    }
  ],
  reelSets: {
    base: { length: 60 },
    free: { length: 60, overrides: { wild: 10, seven: 9, bar: 12, gem: 4 } }
  },
  bet: { currency: 'CREDIT', levels: [0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    multiplierWild: { values: [2, 3], weights: [85, 15] },
    freeSpins: {
      trigger: { symbolId: 'gem', counts: { 3: 10 } },
      reelSet: 'free',
      // 起始 2x 全局倍率，每次再触发 +1x，封顶 5x
      multiplier: { start: 2, onRetrigger: 1, max: 5 },
      retrigger: { counts: { 3: 5 }, maxSpins: 50 }
    }
  },
  // 运营调参：赔付表全局系数（改后请用 slots.simulate 复核实际 RTP）
  tuning: { payScale: 1.056 },
  limits: { maxWinMultiplier: 2000 },
  rtp: { target: 0.955, tolerance: 0.02 },
  volatility: 'medium'
});
