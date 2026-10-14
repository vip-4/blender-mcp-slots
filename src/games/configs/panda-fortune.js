import { defineConfig } from './_schema.js';

/** 新增热门机台 ⑤：5x3 二十线国潮熊猫主题 —— 金币收集 + 黏性扩张 WILD 免费旋转 + 倍率 WILD */
export default defineConfig({
  id: 'panda-fortune',
  name: '熊猫财神 Panda Fortune',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'panda',
    tagline: '20 线 · 金币收集 · 黏性扩张 WILD · 倍率 WILD',
    primary: '#2f9e44',
    secondary: '#1c7c3c',
    accent: '#f59f00',
    background: ['#12351f', '#06110a'],
    frame: '#0b3d2c',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
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
    { id: 'bamboo', kind: 'standard', label: '翠竹', shape: 'bamboo', color: '#37b24d', weight: 55, pay: { 3: 34, 4: 100, 5: 246 } },
    { id: 'pot', kind: 'standard', label: '福袋', shape: 'pot', color: '#f08c00', weight: 40, pay: { 3: 44, 4: 134, 5: 336 } },
    { id: 'panda', kind: 'standard', label: '熊猫', shape: 'panda', color: '#f8f9fa', weight: 22, pay: { 3: 68, 4: 202, 5: 560 } },
    { id: 'taiji', kind: 'wild', label: '太极 WILD', shape: 'taiji', color: '#ffffff', weight: 20, pay: { 3: 78, 4: 246, 5: 784 } },
    { id: 'coin', kind: 'bonus', label: '金币', shape: 'coin', color: '#ffd43b', weight: 40 },
    { id: 'paw', kind: 'collect', label: '熊掌 收集', shape: 'paw', color: '#212529', weight: 6 },
    {
      id: 'temple',
      kind: 'scatter',
      label: '财神庙 SCATTER',
      shape: 'temple',
      color: '#e8590c',
      weight: 18,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { taiji: 34, coin: 60, panda: 34, temple: 10 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    freeSpins: {
      trigger: { symbolId: 'temple', counts: { 3: 10, 4: 15, 5: 20 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 5, 4: 8, 5: 12 }, maxSpins: 200 },
      expandingWild: { reelIndexes: [2], probability: 0.25, sticky: true }
    },
    collect: {
      symbolId: 'paw',
      reels: [2, 3, 4],
      coin: { values: [1, 2, 3], weights: [50, 35, 15] }
    }
  },
  tuning: { payScale: 1.29 },
  limits: { maxWinMultiplier: 5000 },
  rtp: { target: 0.96, tolerance: 0.02 },
  volatility: 'medium-high'
});
