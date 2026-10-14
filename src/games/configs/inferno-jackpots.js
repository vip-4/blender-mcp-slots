import { defineConfig } from './_schema.js';

/** 新增热门机台 ⑥：5x3 二十线烈焰金库 —— Hold & Respin 固定奖池 + 倍率 WILD + 免费旋转 */
export default defineConfig({
  id: 'inferno-jackpots',
  name: '烈焰金库 Inferno Jackpots',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'inferno',
    tagline: '20 线 · 6 币锁仓重旋 · 四档奖池 · 倍率 WILD',
    primary: '#ff6b35',
    secondary: '#e03131',
    accent: '#ffd43b',
    background: ['#3b0d0c', '#120404'],
    frame: '#7a1b12',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#9ca3af', weight: 100, pay: { 3: 12, 4: 28, 5: 68 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#d1d5db', weight: 100, pay: { 3: 12, 4: 34, 5: 78 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#60a5fa', weight: 95, pay: { 3: 16, 4: 44, 5: 100 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#34d399', weight: 95, pay: { 3: 16, 4: 50, 5: 124 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#fbbf24', weight: 85, pay: { 3: 22, 4: 68, 5: 156 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#f87171', weight: 75, pay: { 3: 28, 4: 78, 5: 190 } },
    { id: 'torch', kind: 'standard', label: '火把', shape: 'torch', color: '#ff922b', weight: 55, pay: { 3: 34, 4: 100, 5: 246 } },
    { id: 'ruby', kind: 'standard', label: '红宝石', shape: 'gem', color: '#e64980', weight: 40, pay: { 3: 44, 4: 134, 5: 336 } },
    { id: 'phoenix', kind: 'standard', label: '凤凰', shape: 'phoenix', color: '#ffc078', weight: 22, pay: { 3: 68, 4: 202, 5: 560 } },
    { id: 'flame', kind: 'wild', label: '烈焰 WILD', shape: 'flame', color: '#ff6b35', weight: 20, pay: { 3: 78, 4: 246, 5: 784 } },
    { id: 'coin', kind: 'bonus', label: '金币', shape: 'coin', color: '#ffd43b', weight: 80 },
    {
      id: 'vault',
      kind: 'scatter',
      label: '金库 SCATTER',
      shape: 'vault',
      color: '#ffd43b',
      weight: 18,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { flame: 34, coin: 60, phoenix: 34, vault: 10 } },
    respin: { length: 72, overrides: { coin: 45 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    freeSpins: {
      trigger: { symbolId: 'vault', counts: { 3: 8, 4: 12, 5: 16 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 4, 4: 6, 5: 8 }, maxSpins: 200 }
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
    }
  },
  tuning: { payScale: 1.68 },
  limits: { maxWinMultiplier: 5000 },
  rtp: { target: 0.96, tolerance: 0.02 },
  volatility: 'high'
});
