/** 端到端冒烟：统一入口驱动新机台（雪崩 / 扩展符号）+ 归档工具 */
import { loadEnv } from '../src/config/dotenv.js';

loadEnv();
const base = process.env.SMOKE_BASE || 'http://127.0.0.1:5173';

async function rpc(method, params = {}) {
  const res = await fetch(`${base}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).structuredContent;

const games = await call('slots.listGames', {});
console.log('机台数量:', games.total, games.games.map((g) => g.id).join(', '));

for (const id of ['cosmic-crush', 'book-of-ra', 'starlight-burst']) {
  const s = await call('slots.createSession', { gameId: id, bet: 1, balance: 100000 });
  let chained = 0;
  let expanded = 0;
  let features = 0;
  let wildRespin = 0;
  // 用 autoSpin 批量推进，避免触发限流（每批 100 轮）
  for (let i = 0; i < 10; i += 1) {
    const { rounds } = await call('slots.autoSpin', { sessionId: s.sessionId, count: 100 });
    for (const r of rounds) {
      if (r.cascadeCount > 1) chained += 1;
      if (r.expandingSymbol) expanded += 1;
      if (r.triggered.length) features += 1;
      if (r.phase === 'wildRespin') wildRespin += 1;
    }
    await new Promise((r) => setTimeout(r, 2800)); // 尊重默认限流（120 桶 / 40 每秒）
  }
  console.log(`${id}: 连锁轮 ${chained} · 整轴展开 ${expanded} · 特性触发 ${features} · WILD 重旋轮 ${wildRespin}`);
}

console.log('store.health:', JSON.stringify(await call('store.health', {})));
console.log('store.archive:', JSON.stringify(await call('store.archive', {})));
console.log('store.snapshot:', JSON.stringify(await call('store.snapshot', { name: 'smoke' })));
console.log('system.health:', JSON.stringify(await call('system.health', {})));
