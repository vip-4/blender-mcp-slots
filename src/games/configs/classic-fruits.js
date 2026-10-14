import { defineConfig } from './_schema.js';

/** 基线机台：3x3 五线经典水果机（原有已部署机台，作为回归基准保留） */
export default defineConfig({
  id: 'classic-fruits',
  name: '经典水果机 Classic Fruits',
  version: '1.0.0',
  provider: 'blender-mcp-slots',
  theme: {
    key: 'classic',
    tagline: '3 轴 5 线 · 倍率 WILD',
    primary: '#e63946',
    secondary: '#ffd166',
    accent: '#2a9d8f',
    background: ['#2b0b10', '#120409'],
    frame: '#7a1220',
    font: '"Trebuchet MS", system-ui, sans-serif'
  },
  grid: { reels: 3, rows: 3 },
  evaluation: { mode: 'lines', direction: 'leftToRight', lineSet: '3x3:5', minMatch: 3 },
  symbols: [
    { id: 'cherry', kind: 'standard', label: '樱桃', shape: 'cherry', color: '#e5383b', weight: 32, pay: { 3: 6 } },
    { id: 'lemon', kind: 'standard', label: '柠檬', shape: 'lemon', color: '#ffd60a', weight: 30, pay: { 3: 4 } },
    { id: 'bell', kind: 'standard', label: '铃铛', shape: 'bell', color: '#ffb703', weight: 20, pay: { 3: 9 } },
    { id: 'bar', kind: 'standard', label: 'BAR', shape: 'bar', color: '#f1faee', weight: 10, pay: { 3: 20 } },
    { id: 'seven', kind: 'standard', label: '7', shape: 'seven', color: '#ef233c', weight: 5, pay: { 3: 46 } },
    { id: 'wild', kind: 'wild', label: 'WILD', shape: 'star', color: '#ffd166', weight: 3, pay: { 3: 66 } }
  ],
  reelSets: {
    base: { length: 60 }
  },
  bet: { currency: 'CREDIT', levels: [0.5, 1, 2, 5, 10, 20], default: 1 },
  features: {
    multiplierWild: { values: [2, 3], weights: [80, 20] }
  },
  // 运营调参：赔付表全局系数（改后请用 slots.simulate 复核实际 RTP）
  tuning: { payScale: 1.006 },
  limits: { maxWinMultiplier: 500 },
  rtp: { target: 0.95, tolerance: 0.015 },
  volatility: 'low'
});
