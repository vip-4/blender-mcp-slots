import { defineConfig } from './_schema.js';

/**
 * 新增热门机台 ⑪：5x3 十线日式樱花 —— 双向赔付 × 雪崩连锁 × 扩展符号免费旋转
 * ------------------------------------------------------------------
 * 核心机制（全引擎已有能力的新组合，引擎零改动）：
 *  1. 双向赔付（direction='both'）：每条线左右各判一次，命中率约翻倍
 *  2. 雪崩连锁（cascades）：中奖格消除 → 下落 → 补新符号，倍率阶梯 [1,1,2,3,5]
 *  3. 免费旋转：3+ 神社铃铛散射触发 10/12/15 次免费旋转
 *     - 进入时随机选定一个扩展符号（候选池为高价值符号）
 *     - 盘面出现 ≥2 个 → 整轴展开为同一符号 → 按 10 线双向结算 → 可能触发连锁
 *     - 可再触发 +5/+8/+10 次
 *
 * 与既有 9 台的区别：
 *  - starlight-burst 有 both-ways + wildRespin 但无 cascades、无 expandingSymbol
 *  - book-of-ra 有 expandingSymbol 但单向赔付、无 cascades
 *  - cosmic-crush 有 cascades 但单向赔付、无 expandingSymbol
 *  - 本台首次将 both-ways + cascades + expandingSymbol 三者合一
 *
 * 数学注意：双向赔付使每条线命中率翻倍，叠加雪崩连锁形成「连锁消除双向赔付」效果，
 * 免费旋转中扩展符号整轴展开后几乎必中多条线双向，连锁概率极高。
 * 因此 payScale 大幅压低以回归目标 RTP。
 */
export default defineConfig({
  id: 'sakura-tale',
  name: '樱花物语 Sakura Tale',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'sakura',
    tagline: '10 线 · 双向赔付 · 雪崩连锁 · 扩展符号免费旋转',
    primary: '#ff8fab',
    secondary: '#ffc2d1',
    accent: '#f9c74f',
    background: ['#2d1b3d', '#0f0a1a'],
    frame: '#9b3d72',
    font: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  // 双向赔付：每条线左右各判一次（Starburst 式），配合雪崩连锁使中奖率极高
  evaluation: { mode: 'lines', direction: 'both', lineSet: '5x3:10', minMatch: 3 },
  symbols: [
    { id: 'r9', kind: 'standard', label: '9', shape: 'rank', color: '#e8d5e8', weight: 100, pay: { 3: 2, 4: 5, 5: 12 } },
    { id: 'r10', kind: 'standard', label: '10', shape: 'rank', color: '#d4b3d4', weight: 100, pay: { 3: 2, 4: 6, 5: 14 } },
    { id: 'J', kind: 'standard', label: 'J', shape: 'rank', color: '#c4a0d4', weight: 95, pay: { 3: 3, 4: 7, 5: 18 } },
    { id: 'Q', kind: 'standard', label: 'Q', shape: 'rank', color: '#b083c4', weight: 90, pay: { 3: 3, 4: 8, 5: 20 } },
    { id: 'K', kind: 'standard', label: 'K', shape: 'rank', color: '#ff8fab', weight: 70, pay: { 3: 4, 4: 10, 5: 26 } },
    { id: 'A', kind: 'standard', label: 'A', shape: 'rank', color: '#f9c74f', weight: 55, pay: { 3: 5, 4: 13, 5: 32 } },
    { id: 'fan', kind: 'standard', label: '折扇', shape: 'fan', color: '#ff6b9d', weight: 38, pay: { 3: 8, 4: 22, 5: 56 } },
    { id: 'lantern', kind: 'standard', label: '灯笼', shape: 'lantern', color: '#e76f51', weight: 24, pay: { 3: 12, 4: 34, 5: 88 } },
    { id: 'katana', kind: 'standard', label: '武士刀', shape: 'katana', color: '#c0c0c0', weight: 14, pay: { 3: 18, 4: 52, 5: 136 } },
    { id: 'torii', kind: 'standard', label: '鸟居', shape: 'torii', color: '#e63946', weight: 8, pay: { 3: 26, 4: 78, 5: 208 } },
    { id: 'wild', kind: 'wild', label: '樱花 WILD', shape: 'sakura', color: '#ffd60a', weight: 14, pay: { 3: 30, 4: 90, 5: 240 } },
    {
      id: 'bell',
      kind: 'scatter',
      label: '神社铃铛 SCATTER',
      shape: 'bell',
      color: '#f9c74f',
      weight: 16,
      payBasis: 'totalBet',
      pay: { 3: 2, 4: 10, 5: 50 }
    }
  ],
  reelSets: {
    base: { length: 72 },
    free: { length: 72, overrides: { bell: 10, torii: 12, katana: 20, wild: 20, lantern: 28 } }
  },
  bet: { currency: 'CREDIT', levels: [0.2, 0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    cascades: {
      ladder: [1, 1, 2, 3, 5],
      maxSteps: 6,
      removeWild: false,
      carryInFreeSpins: false
    },
    freeSpins: {
      trigger: { symbolId: 'bell', counts: { 3: 10, 4: 12, 5: 15 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 0, max: 1 },
      retrigger: { counts: { 3: 5, 4: 8, 5: 10 }, maxSpins: 100 },
      // 扩展符号：进入免费旋转时随机选定一个高价值符号
      // 盘面出现 ≥2 个 → 整轴展开 → 双向结算 → 可能触发雪崩连锁
      expandingSymbol: {
        minCount: 2,
        candidates: ['torii', 'katana', 'lantern', 'fan', 'A']
      }
    }
  },
  // 双向赔付 + 雪崩连锁 + 扩展符号三者叠加，赔付天然偏高
  // payScale 大幅压低以回归目标 RTP
  tuning: { payScale: 0.48 },
  limits: { maxWinMultiplier: 8000 },
  rtp: { target: 0.96, tolerance: 0.025 },
  volatility: 'medium-high'
});
