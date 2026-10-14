import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashServerSeed } from '../src/games/engine/rng.js';
import { buildReelStrips, spinGrid, respinColumns } from '../src/games/engine/reels.js';
import { evaluateGrid } from '../src/games/engine/evaluate.js';
import { lineCount } from '../src/games/engine/paylines.js';
import { validateConfig } from '../src/games/engine/validator.js';
import { createState, playRound, normalizeBet, normalizeLines } from '../src/games/engine/round.js';
import { createRegistry, SlotGameRegistry } from '../src/games/registry.js';
import classic from '../src/games/configs/classic-fruits.js';
import dragon from '../src/games/configs/dragon-fortune.js';
import pharaoh from '../src/games/configs/pharaoh-gold.js';
import neon from '../src/games/configs/neon-fruits.js';

const registryOf = async () => createRegistry({});

test('RNG 可证公平：同种子完全可复现，不同 nonce 结果不同', () => {
  const a = new Rng({ serverSeed: 'seed-A', clientSeed: 'client', nonce: 0 });
  const b = new Rng({ serverSeed: 'seed-A', clientSeed: 'client', nonce: 0 });
  const c = new Rng({ serverSeed: 'seed-B', clientSeed: 'client', nonce: 0 });
  const seqA = [a.nextUint32(), a.nextUint32(), a.nextUint32()];
  const seqB = [b.nextUint32(), b.nextUint32(), b.nextUint32()];
  const seqC = [c.nextUint32(), c.nextUint32(), c.nextUint32()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.match(hashServerSeed('seed-A'), /^[0-9a-f]{64}$/);
});

test('转轮条带：长度精确、有权重符号必出现、构建确定性', () => {
  const reg = new SlotGameRegistry({ logger: null });
  const derived = reg.derive(classic);
  const strips = derived.strips.base;
  assert.equal(strips.length, classic.grid.reels);
  for (const strip of strips) assert.equal(strip.length, classic.reelSets?.base?.length || 60);
  const flat = new Set(strips.flat());
  for (const s of classic.symbols) assert.ok(flat.has(s.id), `${s.id} 应出现在条带中`);
  const again = reg.derive(classic).strips.base;
  assert.deepEqual(strips, again);
});

test('转轮与重旋：可见窗口行数正确，锁定格保持不变', () => {
  const strips = buildReelStrips(classic, 'base');
  const rng = new Rng({ serverSeed: 'spin' });
  const { grid } = spinGrid(strips, classic.grid.rows, rng);
  assert.equal(grid.length, classic.grid.reels);
  for (const col of grid) assert.equal(col.length, classic.grid.rows);

  const mask = [
    [true, false, false],
    [false, false, false],
    [false, false, false]
  ];
  const locked = grid[0][0];
  const next = respinColumns(strips, classic.grid.rows, rng, grid, mask);
  assert.equal(next[0][0], locked, '锁定格必须沿用原符号');
});

test('中奖判定（lines）：全盘同一符号时按线数与线注结算', () => {
  const grid = [
    ['cherry', 'cherry', 'cherry'],
    ['cherry', 'cherry', 'cherry'],
    ['cherry', 'cherry', 'cherry']
  ];
  const res = evaluateGrid({ config: classic, grid, bet: 1, activeLines: lineCount(classic) });
  assert.equal(res.lineWins.length, lineCount(classic));
  const perLine = 1 / lineCount(classic);
  assert.ok(Math.abs(res.totalWin - classic.symbols[0].pay[3] * perLine * lineCount(classic)) < 1e-6);
});

test('中奖判定（ways）：三轴同符号按 ways 数量结算', () => {
  const grid = [
    ['cherry', 'cherry', 'cherry'],
    ['cherry', 'cherry', 'cherry'],
    ['cherry', 'cherry', 'cherry'],
    ['lemon', 'lemon', 'lemon'],
    ['lemon', 'lemon', 'lemon']
  ];
  const res = evaluateGrid({ config: neon, grid, bet: 1, activeLines: lineCount(neon) });
  const cherry = res.lineWins.find((w) => w.symbol === 'cherry');
  assert.equal(cherry.ways, 27);
  assert.ok(Math.abs(cherry.pay - (neon.symbols[0].pay[3] * 27) / 243) < 1e-3, `ways 赔付异常: ${cherry.pay}`);
});

test('WILD 替代与倍率 WILD：倍率参与结算', () => {
  const grid = [
    ['cherry', 'wild', 'cherry'],
    ['lemon', 'wild', 'lemon'],
    ['cherry', 'cherry', 'cherry']
  ];
  const wildMult = new Map([['1,1', 3]]);
  const res = evaluateGrid({
    config: classic,
    grid,
    bet: 1,
    activeLines: lineCount(classic),
    wildMultipliers: wildMult
  });
  const line0 = res.lineWins.find((w) => w.line === 0);
  assert.equal(line0.count, 3);
  assert.equal(line0.multiplier, 3);
});

test('下注与线数归一化：非法值被拒绝', () => {
  assert.equal(normalizeBet(classic, 1), 1);
  assert.throws(() => normalizeBet(classic, 3), /bet must be one of/);
  assert.throws(() => normalizeBet(classic, -1), /positive/);
  assert.equal(normalizeLines(classic, 5), 5);
  assert.throws(() => normalizeLines(classic, 99), /lines must be/);
});

test('单轮流程：资金守恒（余额 = 起始 - 投注 + 返还）', async () => {
  const reg = await registryOf();
  const { config, derived } = reg.get('dragon-fortune');
  const state = createState(config, { bet: 1, balance: 10000, serverSeed: 'balance-test' });
  let expected = 10000;
  for (let i = 0; i < 500; i += 1) {
    const r = playRound({ config, derived, state });
    expected = Math.round((expected - r.cost + r.totalWin) * 10000) / 10000;
    assert.equal(state.balance, expected, `第 ${i} 轮资金不平`);
  }
});

test('特性：免费旋转可被触发、消耗次数且不再扣注', async () => {
  const reg = await registryOf();
  const { config, derived } = reg.get('dragon-fortune');
  const state = createState(config, { bet: 1, balance: 1e9, serverSeed: 'fs-test' });
  let trigger = null;
  for (let i = 0; i < 20000 && !trigger; i += 1) {
    const r = playRound({ config, derived, state });
    if (r.nextPhase === 'freeSpins') trigger = r;
  }
  assert.ok(trigger, '应在 2 万轮内触发免费旋转');
  assert.equal(state.freeSpins.remaining, trigger.freeSpins.remaining - 0);
  const before = state.balance;
  const fs = playRound({ config, derived, state });
  assert.equal(fs.cost, 0);
  assert.equal(fs.phase, 'freeSpins');
  assert.ok(state.balance >= before);
});

test('特性：金币重旋会锁定金币并在结束时结算奖池', async () => {
  const reg = await registryOf();
  const { config, derived } = reg.get('pharaoh-gold');
  const state = createState(config, { bet: 1, balance: 1e9, serverSeed: 'hr-test' });
  let trigger = null;
  for (let i = 0; i < 60000 && !trigger; i += 1) {
    const r = playRound({ config, derived, state });
    if (r.nextPhase === 'holdAndRespin') trigger = r;
  }
  assert.ok(trigger, '应在 6 万轮内触发金币重旋');
  assert.ok(state.respins.held.length >= config.features.holdAndRespin.triggerCount);

  let settled = null;
  for (let i = 0; i < 200 && !settled; i += 1) {
    const r = playRound({ config, derived, state });
    if (r.respinSettlement) settled = r;
  }
  assert.ok(settled, '重旋应在有限轮次内结算');
  assert.ok(settled.respinSettlement.pay > 0);
  assert.equal(state.phase, 'base');
});

test('CONFIG 校验：合法配置通过，非法配置被拦截', () => {
  assert.equal(validateConfig(classic).ok, true);
  assert.equal(validateConfig(dragon).ok, true);
  assert.equal(validateConfig(pharaoh).ok, true);
  assert.equal(validateConfig(neon).ok, true);

  const broken = structuredClone(dragon);
  broken.symbols.push({ id: 'J', kind: 'standard', weight: 10, pay: { 3: 1 } });
  assert.equal(validateConfig(broken).ok, false);

  const noScatter = structuredClone(dragon);
  noScatter.features.freeSpins.trigger.symbolId = 'not-exist';
  assert.equal(validateConfig(noScatter).ok, false);
});

test('注册表：默认加载全部机台且全部通过校验', async () => {
  const reg = await registryOf();
  const games = reg.list();
  assert.ok(games.length >= 4);
  assert.equal(reg.failures.length, 0);
  for (const g of games) {
    const v = reg.validate(g.id);
    assert.equal(v.ok, true, `${g.id} 校验失败: ${JSON.stringify(v.errors)}`);
    assert.ok(g.payLines.length >= 0);
    assert.ok(g.reelStrips.base.length === g.grid.reels);
  }
});

test('数学模型：实际 RTP 落在设计区间（2 万轮抽样）', async () => {
  const reg = await registryOf();
  const r = reg.simulate('classic-fruits', { spins: 20000, seed: 'ci-rtp' });
  assert.ok(r.rtp > 0.88 && r.rtp < 1.02, `classic-fruits RTP 异常: ${r.rtp}`);
  const d = reg.simulate('dragon-fortune', { spins: 20000, seed: 'ci-rtp' });
  assert.ok(d.rtp > 0.85 && d.rtp < 1.05, `dragon-fortune RTP 异常: ${d.rtp}`);
});

test('调参能力：payScale 生效且可被热更新覆盖', async () => {
  const reg = await registryOf();
  const before = reg.describeById('classic-fruits').symbols[0].pay[3];
  const tuned = structuredClone(classic);
  tuned.tuning = { payScale: 2 };
  const { id } = reg.register(tuned, { source: 'test' });
  const after = reg.describeById('classic-fruits').symbols[0].pay[3];
  assert.equal(id, 'classic-fruits');
  assert.ok(
    Math.abs(after - classic.symbols[0].pay[3] * 2) < 0.2,
    `payScale 未生效: ${classic.symbols[0].pay[3]} -> ${after}`
  );
  assert.ok(after !== before, 'payScale 应改变赔付表');
});
