import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/games/registry.js';
import { createGameService } from '../src/games/session.js';
import { createMetrics } from '../src/shared/metrics.js';
import { RateLimiter, IdempotencyCache, SpinBudget } from '../src/shared/guard.js';
import { evaluateGrid } from '../src/games/engine/evaluate.js';
import { validateConfig } from '../src/games/engine/validator.js';

async function harness() {
  const registry = await createRegistry({});
  const service = createGameService({
    registry,
    metrics: createMetrics(),
    guards: {
      limiter: new RateLimiter({ capacity: 100000, refillPerSec: 100000 }),
      budget: new SpinBudget({ maxSpins: Number.MAX_SAFE_INTEGER }),
      idempotency: new IdempotencyCache()
    }
  });
  return { registry, service };
}

test('星光爆裂通过 CONFIG 契约校验并注册（机台数 ≥ 9）', async () => {
  const { registry } = await harness();
  const ids = registry.list().map((g) => g.id);
  assert.ok(ids.includes('starlight-burst'));
  assert.ok(ids.length >= 9, `应有至少 9 台机台，实际 ${ids.length}`);
  const v = registry.validate('starlight-burst');
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test('双向赔付：同一条线左右各付一次，单向只付一次', async () => {
  const { registry } = await harness();
  const both = registry.get('starlight-burst').config;
  const oneWay = structuredClone(both);
  oneWay.evaluation.direction = 'leftToRight';

  // 全盘同符号：每条线「左→右」与「右→左」都应成立
  const grid = Array.from({ length: 5 }, () => ['ruby', 'ruby', 'ruby']);
  const evBoth = evaluateGrid({ config: both, grid, bet: 1, activeLines: 10 });
  const evOne = evaluateGrid({ config: oneWay, grid, bet: 1, activeLines: 10 });

  const ltr = evBoth.lineWins.filter((w) => w.direction === 'ltr');
  const rtl = evBoth.lineWins.filter((w) => w.direction === 'rtl');
  assert.ok(ltr.length === 10 && rtl.length === 10, `双向应各 10 笔，实际 ${ltr.length}/${rtl.length}`);
  assert.ok(evBoth.totalWin > evOne.totalWin * 1.9, '双向总赔付应约为单向的两倍');
  assert.equal(evOne.lineWins.length, 10, '单向配置只应产生 10 笔');
});

test('WILD 重旋：整轴展开 → 免费重旋 → 保持 WILD → 结算回基础轮', async () => {
  const { service, registry } = await harness();
  const config = registry.get('starlight-burst').config;
  const wildId = config.symbols.find((s) => s.kind === 'wild').id;
  const s = service.createSession({ gameId: 'starlight-burst', bet: 1, balance: 1e9 });

  let trigger = null;
  for (let i = 0; i < 2000 && !trigger; i += 1) {
    const r = service.spin({ sessionId: s.sessionId });
    if (r.triggered.some((t) => t.type === 'wildRespin')) trigger = r;
  }
  assert.ok(trigger, '2000 轮内应触发 WILD 重旋');

  // 1) 触发轮：落点轴整轴展开为 WILD，且本轮仍按基础轮结算
  const reels = trigger.triggered.find((t) => t.type === 'wildRespin').reels;
  for (const reel of reels) {
    assert.ok(trigger.grid[reel].every((x) => x === wildId), `轴 ${reel} 未整轴展开为 ${wildId}`);
  }
  assert.equal(trigger.phase, 'base');
  assert.equal(trigger.nextPhase, 'wildRespin');
  assert.ok(trigger.wildRespin.remaining >= 1);

  // 2) 重旋轮：不扣费、保持已展开的 WILD，直到结算
  let rounds = 0;
  let settled = null;
  while (rounds < 60) {
    const r = service.spin({ sessionId: s.sessionId });
    rounds += 1;
    if (r.phase === 'wildRespin') {
      assert.equal(r.cost, 0, 'WILD 重旋不应扣费');
      for (const reel of reels) {
        assert.ok(r.grid[reel].includes(wildId), '重旋期间已展开的 WILD 必须保持');
      }
    }
    if (r.triggered.some((t) => t.type === 'wildRespinSettled')) {
      settled = r;
      break;
    }
  }
  assert.ok(settled, '重旋应在有限轮次内结算');
  assert.equal(settled.nextPhase, 'base', '结算后回到基础轮');
  assert.ok(rounds <= 30, `重旋轮数应受 respins 上限约束，实际 ${rounds}`);
});

test('契约校验：非法 wildRespin 配置在加载期被拒绝', async () => {
  const { registry } = await harness();
  const base = structuredClone(registry.get('starlight-burst').config);

  const badReel = structuredClone(base);
  badReel.features.wildRespin.reels = [9];
  assert.equal(validateConfig(badReel).ok, false, '越界轴必须被拒绝');

  const badRespins = structuredClone(base);
  badRespins.features.wildRespin.respins = 0;
  assert.equal(validateConfig(badRespins).ok, false, 'respins=0 必须被拒绝');

  const noWild = structuredClone(base);
  noWild.symbols = noWild.symbols.filter((s) => s.kind !== 'wild');
  assert.equal(validateConfig(noWild).ok, false, '缺少 WILD 符号时 wildRespin 必须被拒绝');
});
