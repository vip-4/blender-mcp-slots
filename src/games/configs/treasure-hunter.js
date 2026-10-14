import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑩：5x3 二十线丛林冒险 —— 雪崩连锁 × 黏性扩张 WILD × 免费旋转
 * ------------------------------------------------------------------
 * 核心机制（全引擎已有能力的新组合，引擎零改动）：
 *  1. 雪崩连锁（cascades）：中奖符号消除 → 上方下落 → 顶部补新符号，倍率阶梯 [1,1,2,3]
 *  2. 免费旋转：3+ 宝藏箱散射触发 8/12/16 次免费旋转
 *     - 扩张 WILD（黏性，1~3 轴低概率展开），跨整段免费旋转保持
 *     - 倍率递进（再触发 +1，上限 x3）
 *  3. 可再触发 +4/+8/+12 次
 *
 * 与既有 9 台的区别：
 *  - cosmic-crush 有 cascades+freeSpins 但无 sticky expandingWild
 *  - dragon-fortune 有 expandingWild+freeSpins 但无 cascades
 *  - 本台首次将 cascades + sticky expandingWild 二者合一
 *    赔付表对标 cosmic-crush，扩张 WILD 概率压低（0.08）以控制方差
 */
export default defineConfig({
  id: 'treasure-hunter',
  name: '宝藏猎人 Treasure Hunter',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'treasure',
    tagline: '20 线 · 雪崩连锁 · 黏性扩张 WILD · 免费旋转倍率递进',
    primary: '#2d6a4f',
    secondary: '#ffd60a',
    accent: '#e9c46a',
    background: ['#1a2e1f', '#0a140c'],
    frame: '#40916c',
    font: '"Trebuchet MS", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '5x3:20', minMatch: 3 },
  symbols: [
    // 赔付表对标 cosmic-crush（同为 20 线 cascades 机台），避免 RTP 失控
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#a8dadc', weight: 100, pay: { 3: 1, 4: 2, 5: 4 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#b8e0d2', weight: 100, pay: { 3: 1, 4: 2, 5: 5 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#90be6d', weight: 95, pay: { 3: 1, 4: 3, 5: 6 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#52b788', weight: 90, pay: { 3: 1, 4: 3, 5: 8 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#e9c46a', weight: 80, pay: { 3: 2, 4: 5, 5: 12 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#f4a261', weight: 65, pay: { 3: 2, 4: 6, 5: 16 } },
    { id: 'compass', kind: 'standard', label: '罗盘', shape: 'compass', color: '#e76f51', weight: 40, pay: { 3: 3, 4: 9, 5: 22 } },
    { id: 'idol', kind: 'standard', label: '神像', shape: 'idol', color: '#bc6c25', weight: 26, pay: { 3: 4, 4: 13, 5: 36 } },
    { id: 'treasure', kind: 'standard', label: '宝箱', shape: 'chest', color: '#ffd60a', weight: 16, pay: { 3: 5, 4: 16, 5: 50 } },
    { id: 'gem', kind: 'wild', label: '翡翠 WILD', shape: 'gem', color: '#06d6a0', weight: 18, pay: { 3: 5, 4: 16, 5: 50 } },
    {
      id: 'chest',
      kind: 'scatter',
      label: '宝藏箱 SCATTER',
      shape: 'chest',
      color: '#f4a261',
      weight: 16,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { gem: 22, treasure: 18, idol: 28, chest: 10, compass: 36 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    cascades: {
      ladder: [1, 1, 2, 3, 5, 8],
      maxSteps: 8,
      removeWild: false,
      carryInFreeSpins: false
    },
    freeSpins: {
      trigger: { symbolId: 'chest', counts: { 3: 8, 4: 12, 5: 16 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 4, 4: 8, 5: 12 }, maxSpins: 120 },
      // 黏性扩张 WILD：概率压到 0.08 避免免费旋转 RTP 爆表
      expandingWild: { reelIndexes: [1, 2, 3], probability: 0.08, sticky: true }
    }
  },
  // 特性叠加后由 payScale 做最后微调，实测见 README 的 RTP 表
  tuning: { payScale: 0.99 },
  limits: { maxWinMultiplier: 2000 },
  rtp: { target: 0.96, tolerance: 0.02 },
  volatility: 'high'
});
