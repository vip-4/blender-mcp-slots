import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/games/registry.js';
import { createGameService } from '../src/games/session.js';
import { Dispatcher } from '../src/mcp/dispatcher.js';
import { registerTools } from '../src/mcp/tools.js';
import { createMetrics } from '../src/shared/metrics.js';
import { RateLimiter, IdempotencyCache, SpinBudget } from '../src/shared/guard.js';
import { BlenderBridge } from '../src/mcp/blender/bridge.js';
import { ErrorCode } from '../src/shared/errors.js';

async function harness() {
  const registry = await createRegistry({});
  const metrics = createMetrics();
  const service = createGameService({
    registry,
    metrics,
    guards: {
      limiter: new RateLimiter({ capacity: 500, refillPerSec: 500 }),
      budget: new SpinBudget(),
      idempotency: new IdempotencyCache()
    }
  });
  const blender = new BlenderBridge({ enabled: false, endpoint: 'http://127.0.0.1:9/rpc', timeoutMs: 50 });
  const dispatcher = new Dispatcher({ metrics, timeoutMs: 2000 });
  registerTools({ dispatcher, registry, service, blender, metrics });
  return { dispatcher, registry, service };
}

test('MCP 握手与工具清单', async () => {
  const { dispatcher } = await harness();
  const init = await dispatcher.handle({ id: 1, method: 'initialize' });
  assert.equal(init.result.serverInfo.name, 'blender-mcp-slots');

  const list = await dispatcher.handle({ id: 2, method: 'tools/list' });
  const names = list.result.tools.map((t) => t.name);
  for (const required of ['slots.listGames', 'slots.getGameConfig', 'slots.spin', 'slots.simulate', 'system.health']) {
    assert.ok(names.includes(required), `缺少工具 ${required}`);
  }
});

test('统一入口：tools/call 可驱动全部机台', async () => {
  const { dispatcher } = await harness();
  const games = await dispatcher.handle({ id: 1, method: 'slots.listGames' });
  assert.ok(games.result.total >= 4);

  for (const g of games.result.games) {
    const spin = await dispatcher.handle({
      id: 2,
      method: 'tools/call',
      params: { name: 'slots.spin', arguments: { gameId: g.id, bet: g.bet.default } }
    });
    assert.equal(spin.result.isError, false);
    const r = spin.result.structuredContent;
    assert.equal(r.gameId, g.id);
    assert.equal(r.grid.length, g.grid.reels);
    assert.ok(typeof r.totalWin === 'number');
  }
});

test('会话：创建→旋转→查询→关闭', async () => {
  const { dispatcher } = await harness();
  const created = await dispatcher.handle({
    id: 1,
    method: 'slots.createSession',
    params: { gameId: 'neon-fruits', bet: 1, balance: 500 }
  });
  const sessionId = created.result.sessionId;

  const spun = await dispatcher.handle({ id: 2, method: 'slots.spin', params: { sessionId } });
  assert.equal(spun.result.sessionId, sessionId);

  const got = await dispatcher.handle({ id: 3, method: 'slots.getSession', params: { sessionId } });
  assert.equal(got.result.gameId, 'neon-fruits');

  const closed = await dispatcher.handle({ id: 4, method: 'slots.closeSession', params: { sessionId } });
  assert.equal(closed.result.closed, true);
  const missing = await dispatcher.handle({ id: 5, method: 'slots.getSession', params: { sessionId } });
  assert.equal(missing.error.code, ErrorCode.SessionNotFound);
});

test('幂等键：重复请求返回首次结果且不重复扣款', async () => {
  const { dispatcher } = await harness();
  const created = await dispatcher.handle({ id: 1, method: 'slots.createSession', params: { gameId: 'classic-fruits', bet: 1, balance: 100 } });
  const sessionId = created.result.sessionId;
  const a = await dispatcher.handle({ id: 2, method: 'slots.spin', params: { sessionId, idempotencyKey: 'k1' } });
  const b = await dispatcher.handle({ id: 3, method: 'slots.spin', params: { sessionId, idempotencyKey: 'k1' } });
  assert.equal(b.result.idempotentReplay, true);
  assert.equal(a.result.balance, b.result.balance);
});

test('错误处理：未知机台 / 非法参数 / 未知方法', async () => {
  const { dispatcher } = await harness();
  const unknown = await dispatcher.handle({ id: 1, method: 'slots.spin', params: { gameId: 'nope' } });
  assert.equal(unknown.error.code, ErrorCode.GameNotFound);

  const badParams = await dispatcher.handle({ id: 2, method: 'slots.spin', params: { gameId: 123 } });
  assert.equal(badParams.error.code, ErrorCode.InvalidParams);

  const unknownMethod = await dispatcher.handle({ id: 3, method: 'does.not.exist' });
  assert.equal(unknownMethod.error.code, ErrorCode.MethodNotFound);
});

test('Blender 桥接：未配置时降级且不阻断主流程', async () => {
  const bridge = new BlenderBridge({ enabled: false, endpoint: 'http://127.0.0.1:9/rpc', timeoutMs: 100 });
  const health = await bridge.health();
  assert.equal(health.degraded, true);
  assert.equal(bridge.getState(), 'disabled');

  const open = new BlenderBridge({ enabled: true, endpoint: 'http://127.0.0.1:9/rpc', timeoutMs: 100, failureThreshold: 1, cooldownMs: 500 });
  for (let i = 0; i < 2; i += 1) await open.callTool('blender.ping');
  assert.equal(open.getState(), 'open', '连续失败应触发熔断');
});

test('自检工具：simulate 返回 RTP 与命中率', async () => {
  const { dispatcher } = await harness();
  const r = await dispatcher.handle({ id: 1, method: 'slots.simulate', params: { gameId: 'classic-fruits', spins: 5000 } });
  assert.ok(r.result.rtp > 0.5 && r.result.rtp < 1.5);
  assert.ok(r.result.hitFrequency > 0);
});

test('热重载：reloadConfigs 不改变机台数量', async () => {
  const { dispatcher } = await harness();
  const before = (await dispatcher.handle({ id: 1, method: 'slots.listGames' })).result.total;
  const after = (await dispatcher.handle({ id: 2, method: 'slots.reloadConfigs' })).result;
  assert.equal(after.after, before);
  assert.equal(after.failures.length, 0);
});
