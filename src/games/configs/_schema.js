/**
 * ============================================================
 *  CONFIG 契约（多机台共用同一套引擎的唯一数据源）
 *  任何一款新机台 = 一份符合本契约的纯数据 CONFIG，
 *  不需要改动 engine / mcp / frontend 的任何代码。
 * ============================================================
 *
 * {
 *   id:            'kebab-case 唯一标识',
 *   name:          '展示名',
 *   version:       '语义化版本（变更会影响存档与审计）',
 *   provider:      '机台提供方标识',
 *   theme: {
 *     key, tagline, primary, secondary, accent,
 *     background: ['渐变色1','渐变色2'],
 *     frame: '机台边框色',
 *     font: 'CSS font-family'
 *   },
 *   grid: { reels: 3|5, rows: 3 },
 *   evaluation: {
 *     mode: 'lines' | 'ways',
 *     direction: 'leftToRight',
 *     lineSet: '3x3:5' | '5x3:20' | '5x3:10',   // mode=lines 时必填
 *     ways: 243,                                // mode=ways 时可省略（自动 rows^reels）
 *     minMatch: 3
 *   },
 *   symbols: [{
 *     id, kind: 'standard'|'wild'|'scatter'|'bonus'|'collect',
 *     label, shape, color,                       // 前端渲染用
 *     weight: number | [perReel...],             // 转轮条带权重
 *     pay: { 3: x, 4: x, 5: x },                 // 倍率（乘 lineBet / perWay）
 *     payBasis: 'line'(默认) | 'totalBet'        // scatter 通常用 totalBet
 *   }],
 *   reelSets: {
 *     base:  { length: 64, overrides?: {symId: number}, exclude?: [symId] },
 *     free:  { length: 64, overrides?: {...} },   // 免费旋转专用（可选）
 *     respin:{ length: 64, overrides?: {...} }    // 重旋专用（可选）
 *   },
 *   bet: { currency, levels: [0.5,1,2,5,10], default: 1 },
 *   features: {
 *     freeSpins: {
 *       trigger: { symbolId: 'scatter', counts: {3:10,4:15,5:20} },
 *       reelSet: 'free',
 *       multiplier: { start: 1, onRetrigger: 1, max: 5 },
 *       retrigger: { counts: {3:5,4:8,5:12}, maxSpins: 200 },
 *       expandingWild: { reelIndexes: [1,2,3], probability: 1, sticky: false },
 *       // 扩展符号（Book 系）：进入免费旋转时从 candidates 随机选定一个标准符号，
 *       // 盘面出现 >= minCount 个时，出现该符号的整轴替换为该符号（reels 可限定轴范围）
 *       expandingSymbol: { minCount: 2, candidates: ['pharaoh','anubis'], reels: [1,2,3] }
 *     },
 *     // 雪崩连锁：中奖格消除 → 上方下落 → 顶部补新符号；倍率按 ladder 逐段递增
 *     cascades: {
 *       ladder: [1,1,2,3,5,8,12],
 *       maxSteps: 8,
 *       removeWild: false,          // 是否连同参与连线的 WILD 一起消除
 *       carryInFreeSpins: false     // true = 倍率在整段免费旋转内跨轮累积
 *     },
 *     holdAndRespin: {
 *       trigger: { symbolId: 'coin' }, triggerCount: 6, respins: 3,
 *       coin: { values: [1,2,3,5,10], weights: [30,25,15,12,8] },
 *       jackpots: { mini:{cells:8,multiplier:20}, minor:{cells:10,multiplier:50},
 *                   major:{cells:12,multiplier:200}, grand:{cells:15,multiplier:1000} }
 *     },
 *     collect: { symbolId: 'anubis', reels: [4], coin: { values:[1,2,3,5,10], weights:[...] } },
 *     multiplierWild: { values: [2,3,5], weights: [70,25,5] }
 *   },
 *   limits: { maxWinMultiplier: 5000 },
 *   rtp: { target: 0.96, tolerance: 0.015 },
 *   volatility: 'low'|'medium'|'medium-high'|'high'
 * }
 */

export const CONFIG_CONTRACT_VERSION = '1.2.0';

export function defineConfig(config) {
  return config;
}
