import { defineConfig } from './_schema.js';

/** 新增热门机台 ③：5x3 243 WAYS 霓虹水果，倍率 WILD + 免费旋转倍率递进 */
export default defineConfig({
  id: 'neon-fruits',
  name: '霓虹水果 Neon Fruits',
  version: '1.1.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'neon',
    tagline: '243 WAYS · 倍率 WILD · 霓虹夜市',
    primary: '#00f5d4',
    secondary: '#f15bb5',
    accent: '#fee440',
    background: ['#12002b', '#05010f'],
    frame: '#5a189a',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'ways', direction: 'leftToRight', ways: 243, minMatch: 3 },
  symbols: [
    { id: 'cherry', kind: 'standard', label: '樱桃', shape: 'cherry', color: '#ff2d55', weight: 120, pay: { 3: 3, 4: 9, 5: 24 } },
    { id: 'lemon', kind: 'standard', label: '柠檬', shape: 'lemon', color: '#fee440', weight: 110, pay: { 3: 3, 4: 9, 5: 24 } },
    { id: 'grape', kind: 'standard', label: '葡萄', shape: 'grape', color: '#9d4edd', weight: 95, pay: { 3: 6, 4: 15, 5: 36 } },
    { id: 'melon', kind: 'standard', label: '西瓜', shape: 'watermelon', color: '#06d6a0', weight: 85, pay: { 3: 6, 4: 18, 5: 45 } },
    { id: 'bell', kind: 'standard', label: '铃铛', shape: 'bell', color: '#ffd166', weight: 60, pay: { 3: 9, 4: 30, 5: 75 } },
    { id: 'seven', kind: 'standard', label: '7', shape: 'seven', color: '#00f5d4', weight: 25, pay: { 3: 15, 4: 45, 5: 120 } },
    { id: 'wild', kind: 'wild', label: '霓虹 WILD', shape: 'gem', color: '#f15bb5', weight: 20, pay: { 3: 18, 4: 60, 5: 180 } },
    {
      id: 'star',
      kind: 'scatter',
      label: '星钻 SCATTER',
      shape: 'star',
      color: '#00f5d4',
      weight: 18,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { wild: 44, seven: 40, star: 12 } }
  },
  bet: { currency: 'CREDIT', levels: [0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    multiplierWild: { values: [2, 3, 5], weights: [70, 25, 5] },
    freeSpins: {
      trigger: { symbolId: 'star', counts: { 3: 8, 4: 12, 5: 16 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 4 },
      retrigger: { counts: { 3: 4, 4: 8, 5: 12 }, maxSpins: 200 }
    }
  },
  tuning: { payScale: 1.04 },
  limits: { maxWinMultiplier: 4000 },
  rtp: { target: 0.96, tolerance: 0.015 },
  volatility: 'high'
});
