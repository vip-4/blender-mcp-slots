import { defineConfig } from './_schema.js';

/** 新增热门机台 ①：5x3 二十线亚洲龙主题，免费旋转 + 扩张 WILD + 递进倍率 */
export default defineConfig({
  id: 'dragon-fortune',
  name: '龙腾富贵 Dragon Fortune',
  version: '1.1.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'dragon',
    tagline: '20 线 · 免费旋转 · 扩张 WILD · 倍率递进',
    primary: '#ff3b3b',
    secondary: '#ffd166',
    accent: '#7b2cbf',
    background: ['#3a0a12', '#12060b'],
    frame: '#8c1420',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#9ca3af', weight: 110, pay: { 3: 10, 4: 30, 5: 71 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#d1d5db', weight: 110, pay: { 3: 10, 4: 41, 5: 91 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#60a5fa', weight: 100, pay: { 3: 15, 4: 51, 5: 122 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#34d399', weight: 100, pay: { 3: 20, 4: 61, 5: 152 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#fbbf24', weight: 90, pay: { 3: 26, 4: 81, 5: 203 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#f87171', weight: 80, pay: { 3: 30, 4: 102, 5: 254 } },
    { id: 'lantern', kind: 'standard', label: '宫灯', shape: 'lantern', color: '#ff6b35', weight: 60, pay: { 3: 41, 4: 122, 5: 305 } },
    { id: 'ingot', kind: 'standard', label: '金元宝', shape: 'ingot', color: '#ffd166', weight: 45, pay: { 3: 51, 4: 152, 5: 406 } },
    { id: 'dragon', kind: 'standard', label: '祥龙', shape: 'dragon', color: '#ffd166', weight: 25, pay: { 3: 71, 4: 244, 5: 761 } },
    { id: 'wild', kind: 'wild', label: '龙珠 WILD', shape: 'orb', color: '#ffe066', weight: 18, pay: { 3: 102, 4: 355, 5: 1269 } },
    {
      id: 'scatter',
      kind: 'scatter',
      label: '龙印 SCATTER',
      shape: 'seal',
      color: '#ff3b3b',
      weight: 19,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { wild: 42, dragon: 46, scatter: 10 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    freeSpins: {
      trigger: { symbolId: 'scatter', counts: { 3: 10, 4: 15, 5: 20 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 5 },
      retrigger: { counts: { 3: 5, 4: 8, 5: 12 }, maxSpins: 200 },
      expandingWild: { reelIndexes: [1, 2, 3], probability: 1, sticky: false }
    }
  },
  tuning: { payScale: 1.034 },
  limits: { maxWinMultiplier: 5000 },
  rtp: { target: 0.96, tolerance: 0.015 },
  volatility: 'medium-high'
});
