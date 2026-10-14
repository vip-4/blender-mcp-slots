#!/usr/bin/env node
/**
 * RTP 自检脚本：node scripts/simulate.js [spins] [gameId]
 * 用于调参：修改 CONFIG 后跑一遍，确认 RTP/命中率/波动落在设计区间。
 */
import { createRegistry } from '../src/games/registry.js';

const spins = Number(process.argv[2] || 200000);
const only = process.argv[3];

const registry = await createRegistry({});
const targets = only ? [registry.get(only).config] : registry.list();

for (const g of targets) {
  const id = typeof g === 'string' ? g : g.id;
  const started = Date.now();
  const r = registry.simulate(id, { spins });
  console.log(
    [
      r.gameId.padEnd(16),
      `rtp=${r.rtp.toFixed(4)}`,
      `target=${r.target}`,
      `hit=${(r.hitFrequency * 100).toFixed(2)}%`,
      `max=${r.maxWinMultiplier}x`,
      `vol=${r.volatilityIndex}`,
      `fs=${r.features.freeSpins || 0}`,
      `hr=${r.features.holdAndRespin || 0}`,
      `${Date.now() - started}ms`
    ].join('  ')
  );
}
