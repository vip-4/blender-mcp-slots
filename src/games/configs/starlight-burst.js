/**
 * 星光爆裂（Starburst 系经典玩法）
 * ------------------------------------------------------------------
 * 核心机制：
 *  1. 双向赔付（evaluation.direction = 'both'）：每条线左右各判一次，命中即各付一次；
 *  2. Wild 重旋（features.wildRespin）：星芒 WILD 落在 2/3/4 轴时整轴展开为 WILD
 *     并立即获得 3 次免费重旋；重旋期间 WILD 保持，再次出现新的 WILD 则次数重置；
 *  3. 星云散射：3/4/5 个触发 8/12/16 次免费旋转，期间 2/3/4 轴有概率生成黏性扩张 WILD。
 * 全部能力由 CONFIG 描述，引擎与前端无需为这台机台写任何分支。
 */
export default {
  id: 'starlight-burst',
  name: '星光爆裂',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'starlight-burst',
    tagline: '星芒 WILD 整轴展开 · 双向赔付 · 连锁重旋',
    primary: '#2b1b6b',
    secondary: '#ffd166',
    accent: '#7de2fc',
    background: ['#0b0724', '#1b1046'],
    frame: '#3a2a86',
    font: '"Trebuchet MS", "Microsoft YaHei", sans-serif'
  },
  grid: { reels: 5, rows: 3 },
  // 双向赔付：同一条线「左→右」与「右→左」各判一次（Starburst 标志性机制）
  evaluation: { mode: 'lines', direction: 'both', lineSet: '5x3:10', minMatch: 3 },
  symbols: [
    { id: 'ruby', kind: 'standard', label: '红宝石', shape: 'gem', color: '#ef476f', weight: 110, pay: { 3: 1, 4: 3, 5: 10 } },
    { id: 'topaz', kind: 'standard', label: '黄玉', shape: 'gem', color: '#ffd166', weight: 110, pay: { 3: 1, 4: 3, 5: 10 } },
    { id: 'sapphire', kind: 'standard', label: '蓝宝石', shape: 'gem', color: '#4cc9f0', weight: 105, pay: { 3: 1.5, 4: 4, 5: 12 } },
    { id: 'emerald', kind: 'standard', label: '祖母绿', shape: 'gem', color: '#06d6a0', weight: 100, pay: { 3: 2, 4: 5, 5: 15 } },
    { id: 'amethyst', kind: 'standard', label: '紫水晶', shape: 'gem', color: '#b388ff', weight: 60, pay: { 3: 3, 4: 8, 5: 24 } },
    { id: 'bar', kind: 'standard', label: 'BAR', shape: 'bar', color: '#f8f9fa', weight: 42, pay: { 3: 5, 4: 15, 5: 45 } },
    { id: 'seven', kind: 'standard', label: '幸运 7', shape: 'seven', color: '#ff8500', weight: 26, pay: { 3: 8, 4: 24, 5: 70 } },
    // WILD 只出现在中间三轴（Starburst 规则），用 perReel 权重表达；WILD 仅做替代、不单独赔付
    { id: 'star', kind: 'wild', label: '星芒 WILD', shape: 'star', color: '#ffe066', weight: [0, 6, 6, 6, 0] },
    { id: 'nebula', kind: 'scatter', label: '星云', shape: 'orb', color: '#c77dff', weight: 16, pay: { 3: 2, 4: 5, 5: 20 }, payBasis: 'totalBet' }
  ],
  reelSets: {
    base: { length: 96, overrides: { nebula: 16, seven: 26 } },
    // 免费旋转条带：WILD 更密，配合黏性扩张 WILD 放大尾奖
    free: { length: 96, overrides: { nebula: 16, seven: 30, amethyst: 70 } }
  },
  bet: { currency: 'credit', levels: [0.2, 0.5, 1, 2, 5, 10], default: 1 },
  features: {
    wildRespin: {
      reels: [1, 2, 3],
      respins: 3,
      expand: true,      // 落点即整轴展开
      resetOnNew: true   // 重旋中再次出现新 WILD 则次数重置为 3
    },
    freeSpins: {
      trigger: { symbolId: 'nebula', counts: { 3: 8, 4: 12, 5: 16 } },
      reelSet: 'free',
      multiplier: { start: 1, onRetrigger: 1, max: 3 },
      retrigger: { counts: { 3: 4, 4: 6, 5: 8 }, maxSpins: 60 },
      expandingWild: { reelIndexes: [1, 2, 3], probability: 0.35, sticky: true }
    }
  },
  tuning: { payScale: 1.17 },
  limits: { maxWinMultiplier: 500 },
  rtp: { target: 0.962, tolerance: 0.02 },
  volatility: 'low'
};
