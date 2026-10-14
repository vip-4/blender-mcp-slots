/* 临时调参脚本：二分搜索 treasure-hunter 的 payScale，使实测 RTP 命中 0.96 */
import { createRegistry } from '../src/games/registry.js';

const reg = await createRegistry({});
const mod = await import(`../src/games/configs/treasure-hunter.js?v=${Date.now()}`);
const raw = mod.default;

const measure = (payScale, spins) => {
  const c = structuredClone(raw);
  c.id = 'th-tune';
  c.tuning = { ...(raw.tuning || {}), payScale };
  reg.register(c);
  return reg.simulate('th-tune', { spins, bet: 1 });
};

let ps = 1;
for (let i = 0; i < 6; i += 1) {
  const spins = i < 3 ? 60000 : 150000;
  const s = measure(ps, spins);
  console.log(`payScale=${ps.toFixed(3)}  rtp=${s.rtp.toFixed(4)}  max=${s.maxWinMultiplier}`);
  if (Math.abs(s.rtp - 0.96) <= 0.004) break;
  ps = Number((ps * (0.96 / s.rtp)).toFixed(4));
}

const final = measure(ps, 200000);
console.log(`\n最终 payScale=${ps}  rtp=${final.rtp.toFixed(4)}  max=${final.maxWinMultiplier}`);
