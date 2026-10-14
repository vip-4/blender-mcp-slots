import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, MemoryStore } from '../src/store/index.js';
import { createRegistry } from '../src/games/registry.js';
import { createGameService } from '../src/games/session.js';

const spinEntry = (n) => ({
  roundId: `r-${n}`,
  sessionId: 's-1',
  gameId: 'dragon-fortune',
  phase: 'base',
  bet: 1,
  cost: 1,
  totalWin: n * 10,
  multiplier: 1,
  triggered: [],
  balanceAfter: 1000,
  at: new Date().toISOString()
});

test('内存存储：写入即可读，排行榜按倍率降序', async () => {
  const store = new MemoryStore();
  await store.init();
  await store.recordSpin(spinEntry(1));
  await store.recordSpin(spinEntry(5));
  await store.recordSpin(spinEntry(3));

  const recent = await store.recentSpins({ limit: 10 });
  assert.equal(recent.length, 3);
  assert.equal(recent[0].roundId, 'r-3');

  const board = await store.leaderboard({ limit: 5 });
  assert.equal(board[0].bestMultiplier, 50);
});

test('外部存储不可用：自动降级且读写不中断', async () => {
  const store = await createStore({ driver: 'postgres', databaseUrl: undefined, redisUrl: undefined });
  const info = await store.health();
  assert.equal(info.primary.degraded, true, '无连接串时应标记降级');
  assert.equal(info.primary.driver, 'postgres');

  await store.recordSpin(spinEntry(2));
  const spins = await store.recentSpins({ limit: 5 });
  assert.ok(Array.isArray(spins) && spins.length >= 1, '降级后仍应能读到内存快照');
  await store.close();
});

test('服务层：旋转后可通过统一入口查询历史与排行榜', async () => {
  const registry = await createRegistry({});
  const store = await createStore({ driver: 'memory' });
  const service = createGameService({ registry, store });

  const session = service.createSession({ gameId: 'panda-fortune', bet: 1, balance: 100000 });
  for (let i = 0; i < 12; i += 1) service.spin({ sessionId: session.sessionId });

  const history = await service.history({ gameId: 'panda-fortune', limit: 5 });
  assert.equal(history.length, 5);

  const board = await service.leaderboard({ gameId: 'panda-fortune', limit: 3 });
  assert.ok(board.length >= 1);
  assert.ok(board[0].bestMultiplier >= 0);

  const health = await service.storeHealth();
  assert.equal(health.driver, 'memory');
  service.destroy();
});

test('新机台：已注册且 CONFIG 校验通过', async () => {
  const registry = await createRegistry({});
  const ids = registry.list().map((g) => g.id);
  for (const id of ['panda-fortune', 'inferno-jackpots']) {
    assert.ok(ids.includes(id), `缺少机台 ${id}`);
    const v = registry.validate(id);
    assert.equal(v.ok, true, JSON.stringify(v));
  }
});

test('多特性同轮触发：重旋排队，状态机不串台', async () => {
  const registry = await createRegistry({});
  const state = registry.createState('inferno-jackpots', { bet: 1, balance: 10_000_000 });
  const legal = new Set(['base', 'freeSpins', 'holdAndRespin']);
  let queued = 0;

  for (let i = 0; i < 30000; i += 1) {
    const r = registry.play('inferno-jackpots', state, {});
    assert.ok(legal.has(r.phase) && legal.has(r.nextPhase), `非法阶段 ${r.phase}/${r.nextPhase}`);
    const types = r.triggered.map((t) => t.type);
    if (types.includes('holdAndRespinQueued')) {
      queued += 1;
      assert.ok(types.includes('freeSpins'), '排队重旋必须发生在已触发免费旋转的轮次');
      assert.equal(r.nextPhase, 'freeSpins', '本轮应继续进入免费旋转');
    }
    if (r.totalWin < 0) assert.fail('派彩不可为负');
  }
  assert.ok(true, `同轮多特性排队事件 ${queued} 次`);
});
