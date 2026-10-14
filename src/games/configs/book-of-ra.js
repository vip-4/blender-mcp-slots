import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑦：5x3 十线埃及探秘 —— Book 系「扩展符号」免费旋转
 * 核心机制：
 *  - 3+ 本「亡灵之书」散射 → 10/12/15 次免费旋转，进入时随机选定一个扩展符号
 *  - 免费旋转内该符号出现 ≥2 个 → 所在整轴展开为同一符号，再按 10 线结算
 *  - 免费旋转可再触发（+5/+8/+10 次），每次进入重新抽取扩展符号
 */
export default defineConfig({
  id: 'book-of-ra',
  name: '法老之书 Book of Ra',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'book',
    tagline: '10 线 · 扩展符号 · 免费旋转再触发 · 高波动',
    primary: '#c98a2b',
    secondary: '#8a5a1a',
    accent: '#ffd166',
    background: ['#3b2410', '#120a04'],
    frame: '#5c3a15',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:10', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#c9a227', weight: 100, pay: { 3: 15, 4: 38, 5: 90 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#e0c068', weight: 100, pay: { 3: 15, 4: 45, 5: 100 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#7fb3d5', weight: 95, pay: { 3: 20, 4: 55, 5: 130 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#48c9b0', weight: 95, pay: { 3: 20, 4: 65, 5: 160 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#f0b429', weight: 85, pay: { 3: 28, 4: 85, 5: 200 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#e57368', weight: 75, pay: { 3: 35, 4: 100, 5: 245 } },
    { id: 'scarab', kind: 'standard', label: '圣甲虫', shape: 'scarab', color: '#2ec4b6', weight: 50, pay: { 3: 45, 4: 130, 5: 320 } },
    { id: 'anubis', kind: 'standard', label: '阿努比斯', shape: 'anubis', color: '#6d597a', weight: 35, pay: { 3: 60, 4: 175, 5: 438 } },
    { id: 'mask', kind: 'standard', label: '法老面具', shape: 'crown', color: '#ffd166', weight: 20, pay: { 3: 90, 4: 265, 5: 735 } },
    { id: 'eye', kind: 'wild', label: '荷鲁斯之眼 WILD', shape: 'eye', color: '#f2b705', weight: 18, pay: { 3: 100, 4: 310, 5: 980 } },
    {
      id: 'book',
      kind: 'scatter',
      label: '亡灵之书 SCATTER',
      shape: 'book',
      color: '#8d6e2f',
      weight: 20,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 20, 5: 200 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { book: 8, eye: 22, mask: 26, anubis: 44 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    freeSpins: {
      trigger: { symbolId: 'book', counts: { 3: 10, 4: 12, 5: 15 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 0, max: 1 },
      retrigger: { counts: { 3: 5, 4: 8, 5: 10 }, maxSpins: 100 },
      expandingSymbol: {
        minCount: 2,
        // 只在高价值符号中抽取，保证免费旋转的爆发力与 Book 系手感一致
        candidates: ['mask', 'anubis', 'scarab', 'A', 'K']
      }
    }
  },
  tuning: { payScale: 1.011 },
  limits: { maxWinMultiplier: 8000 },
  rtp: { target: 0.955, tolerance: 0.02 },
  volatility: 'high'
});
