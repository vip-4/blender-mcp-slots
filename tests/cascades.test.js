import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/games/registry.js';
import { createGameService } from '../src/games/session.js';
import { createMetrics } from '../src/shared/metrics.js';
import { RateLimiter, IdempotencyCache, SpinBudget } from '../src/shared/guard.js';
import { signRequest, ArchiveStore, encodeR2Key } from '../src/store/r2.js';

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

test('新增机台通过 CONFIG 契约校验并出现在统一入口', async () => {
  const { registry } = await harness();
  const ids = registry.list().map((g) => g.id);
  for (const id of ['book-of-ra', 'cosmic-crush']) assert.ok(ids.includes(id), `${id} 未注册`);
  for (const id of ids) {
    const v = registry.validate(id);
    assert.equal(v.ok, true, `${id} 契约校验失败: ${JSON.stringify(v.errors)}`);
  }
});

test('雪崩连锁：逐段消除落位、倍率按阶梯递增、总赢分累计', async () => {
  const { service } = await harness();
  const s = service.createSession({ gameId: 'cosmic-crush', bet: 1, balance: 1e9 });
  let chained = 0;
  let maxSteps = 0;
  for (let i = 0; i < 3000; i += 1) {
    const r = service.spin({ sessionId: s.sessionId });
    if (r.cascadeCount > 1) {
      chained += 1;
      maxSteps = Math.max(maxSteps, r.cascadeCount);
      // 每段倍率取自 ladder，随段号单调不减
      const mults = r.cascades.map((c) => c.multiplier);
      for (let k = 1; k < mults.length; k += 1) assert.ok(mults[k] >= mults[k - 1], '连锁倍率应单调不减');
      // 每段都要消除中奖格并补上新符号（新符号可能与原符号相同，故断言消除数而非盘面差异）
      assert.ok(
        r.cascades.slice(0, -1).every((c) => c.removed > 0 && c.newCells.length === c.removed),
        '连锁段必须消除中奖格并补同等数量的新符号'
      );
      // 分段赢分之和不超过本轮总赢分（总赢分还含散射等）
      const sum = r.cascades.reduce((a, c) => a + c.win, 0);
      assert.ok(r.totalWin + 1e-9 >= sum, `分段合计 ${sum} 超出总赢分 ${r.totalWin}`);
      // 段数受 maxSteps 限制
      assert.ok(r.cascadeCount <= 8);
    }
    if (r.nextPhase !== 'base') {
      // 特性轮同样允许连锁，继续自动推进
    }
  }
  assert.ok(chained > 0, '3000 轮内应至少出现一次雪崩连锁');
  assert.ok(maxSteps >= 2, `应出现 2 段以上连锁，实际 ${maxSteps}`);
});

test('扩展符号：免费旋转内选定符号达到阈值即整轴展开', async () => {
  const { service, registry } = await harness();
  const cfg = registry.get('book-of-ra').config;
  const s = service.createSession({ gameId: 'book-of-ra', bet: 1, balance: 1e9 });
  let triggered = 0;
  let expanded = 0;
  for (let i = 0; i < 6000 && (triggered < 3 || expanded < 1); i += 1) {
    const r = service.spin({ sessionId: s.sessionId });
    if (r.triggered.some((t) => t.type === 'freeSpins')) {
      triggered += 1;
      assert.ok(r.selectedSymbol, '触发免费旋转时应选定扩展符号');
      assert.ok(
        cfg.features.freeSpins.expandingSymbol.candidates.includes(r.selectedSymbol),
        '扩展符号应来自 CONFIG 候选池'
      );
    }
    if (r.expandingSymbol) {
      expanded += 1;
      const { symbolId, reels } = r.expandingSymbol;
      for (const reel of reels) {
        assert.ok(
          r.grid[reel].every((x) => x === symbolId),
          `轴 ${reel} 未整轴展开为 ${symbolId}`
        );
      }
      assert.ok(reels.length >= 1, '至少应展开一个轴');
      assert.ok(r.grid[reels[0]].length === 3, '展开后该轴仍保持 3 行');
    }
  }
  assert.ok(triggered > 0, '6000 轮内应触发免费旋转');
  assert.ok(expanded > 0, '应至少出现一次整轴展开');
});

test('R2 签名：SigV4 头部结构正确且结果确定', () => {
  const base = {
    method: 'GET',
    host: 'examplebucket.r2.cloudflarestorage.com',
    path: '/bucket/spins/2026-10-15/08.jsonl',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'auto',
    now: new Date('2013-05-24T00:00:00Z')
  };
  const a = signRequest(base).headers.Authorization;
  const b = signRequest(base).headers.Authorization;
  assert.equal(a, b, '同一输入必须得到同一签名（可重放、可审计）');
  assert.match(a, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/auto\/s3\/aws4_request, /);
  assert.match(a, /SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);

  const sigOf = (s) => s.match(/Signature=([0-9a-f]{64})$/)[1];
  assert.notEqual(sigOf(a), sigOf(signRequest({ ...base, payload: '{"win":1}' }).headers.Authorization), 'payload 必须参与签名');
  assert.notEqual(sigOf(a), sigOf(signRequest({ ...base, method: 'PUT' }).headers.Authorization), 'method 必须参与签名');
  assert.equal(signRequest(base).headers['x-amz-date'], '20130524T000000Z');
});

test('R2 key 逐段编码且保留层级', () => {
  assert.equal(encodeR2Key('blender-mcp-slots/spins/2026-10-15/08.jsonl'), 'blender-mcp-slots/spins/2026-10-15/08.jsonl');
  assert.equal(encodeR2Key('a b/c.jsonl'), 'a%20b/c.jsonl');
});

test('R2 归档不可用时不阻断写入（自动降级）', async () => {
  const failing = {
    bucket: 'b',
    endpoint: 'https://example.invalid',
    headBucket: async () => {
      throw new Error('network blocked');
    },
    get: async () => {
      throw new Error('network blocked');
    },
    put: async () => {
      throw new Error('network blocked');
    }
  };
  const archive = new ArchiveStore({ client: failing });
  const init = await archive.init();
  assert.equal(init.degraded, true);
  assert.equal(archive.push({ roundId: 'r1' }).accepted, false);

  const okClient = { ...failing, headBucket: async () => ({ status: 200 }) };
  const ok = new ArchiveStore({ client: okClient });
  assert.equal((await ok.init()).degraded, false);
  assert.equal(ok.push({ roundId: 'r2' }).accepted, true);
  const flushed = await ok.flush();
  assert.equal(flushed.flushed, 0);
  assert.equal(flushed.dropped, 1, '写入失败应计入丢弃而不是抛出');
  assert.equal(flushed.degraded, true);
  assert.equal(ok.health().dropped, 1);
  assert.equal(ok.health().pending, 0, '失败批次不应残留在缓冲区');
});
