import { defineConfig } from './_schema.js';

/** 新增热门机台 ②：5x3 二十线埃及主题，金币 Hold & Respin + 四档固定奖池 + 收集符号 + 免费旋转 */
export default defineConfig({
  id: 'pharaoh-gold',
  name: '黄金法老 Pharaoh Gold',
  version: '1.1.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'pharaoh',
    tagline: '20 线 · 金币重旋 · 四档奖池 · 收集符',
    primary: '#f2b705',
    secondary: '#e0a106',
    accent: '#3c6e71',
    background: ['#1d2a33', '#0b1116'],
    frame: '#b8860b',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#9ca3af', weight: 100, pay: { 3: 13, 4: 29, 5: 71 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#d1d5db', weight: 100, pay: { 3: 13, 4: 36, 5: 82 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#60a5fa', weight: 95, pay: { 3: 17, 4: 46, 5: 105 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#34d399', weight: 95, pay: { 3: 17, 4: 53, 5: 130 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#fbbf24', weight: 85, pay: { 3: 23, 4: 71, 5: 164 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#f87171', weight: 75, pay: { 3: 29, 4: 82, 5: 200 } },
    { id: 'ankh', kind: 'standard', label: '安卡', shape: 'ankh', color: '#4cc9f0', weight: 55, pay: { 3: 36, 4: 105, 5: 258 } },
    { id: 'scarab', kind: 'standard', label: '圣甲虫', shape: 'scarab', color: '#2ec4b6', weight: 40, pay: { 3: 46, 4: 141, 5: 353 } },
    { id: 'pharaoh', kind: 'standard', label: '法老', shape: 'crown', color: '#ffd166', weight: 22, pay: { 3: 71, 4: 212, 5: 588 } },
    { id: 'eye', kind: 'wild', label: '荷鲁斯之眼 WILD', shape: 'eye', color: '#f2b705', weight: 20, pay: { 3: 82, 4: 258, 5: 823 } },
    { id: 'coin', kind: 'bonus', label: '金币', shape: 'coin', color: '#ffd60a', weight: 75 },
    { id: 'anubis', kind: 'collect', label: '阿努比斯 收集', shape: 'anubis', color: '#9d4edd', weight: 14 },
    {
      id: 'tomb',
      kind: 'scatter',
      label: '陵墓 SCATTER',
      shape: 'tomb',
      color: '#e0a106',
      weight: 19,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { eye: 34, coin: 55, pharaoh: 34, tomb: 10 } },
    respin: { length: 72, overrides: { coin: 45 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    freeSpins: {
      trigger: { symbolId: 'tomb', counts: { 3: 10, 4: 15, 5: 20 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 5, 4: 8, 5: 12 }, maxSpins: 200 }
    },
    holdAndRespin: {
      trigger: { symbolId: 'coin' },
      triggerCount: 6,
      respins: 3,
      coin: { values: [2, 3, 5, 8, 10], weights: [30, 25, 20, 15, 10] },
      jackpots: {
        mini: { cells: 8, multiplier: 6 },
        minor: { cells: 10, multiplier: 12 },
        major: { cells: 12, multiplier: 30 },
        grand: { cells: 15, multiplier: 150 }
      }
    },
    collect: {
      symbolId: 'anubis',
      reels: [4],
      coin: { values: [2, 3, 5, 8, 10], weights: [30, 25, 20, 15, 10] }
    }
  },
  tuning: { payScale: 0.944 },
  limits: { maxWinMultiplier: 5000 },
  rtp: { target: 0.96, tolerance: 0.015 },
  volatility: 'high'
});
