/* RTP 快筛：对全部机台跑蒙特卡洛，标出偏离 target ± tolerance 的机台
 * 用法：node scripts/tune-check.mjs [spins]
 * 注意：高波动机台（最大单轮 1000x 以上）在 5 万轮下的 RTP 估计方差可达 ±3%，
 *      默认取 20 万轮；低于该轮数出现 WARN 时请先加大轮数再判断是否真偏离。
 */
import { createRegistry } from '../src/games/registry.js';

const spins = Number(process.argv[2] || 200000);
const registry = await createRegistry({});
const problems = [];

console.log(`全部机台 RTP 快筛（${spins} 轮/台）`);
for (const g of registry.list()) {
  const { target, tolerance = 0.02 } = g.rtp || {};
  const s = registry.simulate(g.id, { spins, bet: 1 });
  const drift = s.rtp - target;
  const ok = Math.abs(drift) <= tolerance;
  if (!ok) problems.push(`${g.id}: 实测 ${s.rtp.toFixed(4)} vs 目标 ${target}（偏差 ${drift.toFixed(4)}）`);
  console.log(
    `${ok ? 'OK  ' : 'WARN'} ${g.id.padEnd(18)} rtp=${s.rtp.toFixed(4)} target=${target} drift=${drift >= 0 ? '+' : ''}${drift.toFixed(4)} max=${s.maxWinMultiplier}x`
  );
}

if (problems.length) {
  console.log('\n超出容差的机台：');
  problems.forEach((p) => console.log('  -', p));
  console.log('\n处理方式：先检查特性参数（如 cascades.carryInFreeSpins、expandingWild.probability），再用 tuning.payScale 线性微调。');
  process.exitCode = 1;
} else {
  console.log('\n全部机台 RTP 均落在容差区间内。');
}
