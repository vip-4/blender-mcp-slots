import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑭：5x3 二十线星海遗书 —— Book 系「扩展符号」免费旋转的 20 线变体
 * 与既有 book-of-ra 的差异（同机制、不同线组与主题，避免重复）：
 *  - book-of-ra：5x3 十线，扩展符号免费旋转
 *  - book-of-nebula：5x3 二十线（线更多、单线命中更密），扩展符号 + 再触发
 * 核心机制：
 *  - 3+ 星海遗书散射 → 10/12/15 次免费旋转，进入时随机选定一个扩展符号
 *  - 免费旋转内该符号出现 ≥2 个 → 所在整轴展开为同一符号，再按 20 线结算
 *  - 每次再触发重新抽取扩展符号，最多 100 次
 */
export default defineConfig({
  id: 'book-of-nebula',
  name: '星海遗书 Book of Nebula',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'nebula',
    tagline: '20 线 · 扩展符号 · 免费旋转再触发 · 高波动',
    primary: '#8b5cf6',
    secondary: '#1e1b4b',
    accent: '#22d3ee',
    background: ['#1a1040', '#06040f'],
    frame: '#3b2f7a',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#a78bfa', weight: 100, pay: { 3: 14, 4: 35, 5: 84 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#c4b5fd', weight: 100, pay: { 3: 14, 4: 42, 5: 93 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#67e8f9', weight: 95, pay: { 3: 19, 4: 51, 5: 121 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#5eead4', weight: 95, pay: { 3: 19, 4: 60, 5: 149 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#fcd34d', weight: 85, pay: { 3: 26, 4: 79, 5: 186 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#fda4af', weight: 75, pay: { 3: 33, 4: 93, 5: 228 } },
    { id: 'crystal', kind: 'standard', label: '星屑', shape: 'crystal', color: '#22d3ee', weight: 50, pay: { 3: 42, 4: 121, 5: 298 } },
    { id: 'comet', kind: 'standard', label: '彗使', shape: 'comet', color: '#a3e635', weight: 35, pay: { 3: 56, 4: 163, 5: 408 } },
    { id: 'crown', kind: 'standard', label: '星冠', shape: 'crown', color: '#fbbf24', weight: 20, pay: { 3: 84, 4: 247, 5: 684 } },
    { id: 'eye', kind: 'wild', label: '星瞳 WILD', shape: 'eye', color: '#f0abfc', weight: 18, pay: { 3: 93, 4: 289, 5: 913 } },
    {
      id: 'book',
      kind: 'scatter',
      label: '星海遗书 SCATTER',
      shape: 'book',
      color: '#8b5cf6',
      weight: 20,
      payBasis: 'totalBet',
      pay: { 3: 1, 4: 9, 5: 93 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { book: 8, eye: 22, crown: 26, comet: 44 } }
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
        // 只在较高价值符号中抽取，保证免费旋转的爆发力与 Book 系手感一致
        candidates: ['crown', 'comet', 'crystal', 'A', 'K']
      }
    }
  },
  tuning: { payScale: 1.0 },
  limits: { maxWinMultiplier: 8000 },
  rtp: { target: 0.955, tolerance: 0.02 },
  volatility: 'high'
});
