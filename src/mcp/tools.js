import { validateParams, SERVER_INFO } from './protocol.js';
import { AppError, ErrorCode } from '../shared/errors.js';

const obj = (properties = {}, required = []) => ({ type: 'object', properties, required });

/**
 * 统一入口：所有能力都以 MCP 工具形式暴露。
 * 新增机台不需要改动这里；新增玩法能力才需要在此登记一个工具。
 */
export function registerTools({ dispatcher, registry, service, blender, metrics, logger, store }) {
  const tools = [
    {
      name: 'slots.listGames',
      description: '列出所有已部署机台（含主题、线数、RTP、波动率）',
      inputSchema: obj({}),
      handler: () => ({ total: registry.list().length, games: registry.list() })
    },
    {
      name: 'slots.getGameConfig',
      description: '获取机台完整 CONFIG（转轮条带、赔付表、特性参数、主题）',
      inputSchema: obj({ gameId: { type: 'string' } }, ['gameId']),
      handler: ({ gameId }) => registry.describeById(gameId)
    },
    {
      name: 'slots.createSession',
      description: '创建游戏会话（下注额/线数/起始余额/客户端种子）',
      inputSchema: obj({
        gameId: { type: 'string' },
        bet: { type: 'number' },
        lines: { type: 'integer' },
        balance: { type: 'number' },
        clientSeed: { type: 'string' }
      }, ['gameId']),
      handler: ({ gameId, bet, lines, balance, clientSeed }) =>
        service.createSession({ gameId, bet, lines, balance, clientSeed })
    },
    {
      name: 'slots.spin',
      description: '旋转一次（自动识别基础轮/免费旋转/重旋），返回盘面、中奖明细与特性触发',
      inputSchema: obj({
        gameId: { type: 'string' },
        sessionId: { type: 'string' },
        bet: { type: 'number' },
        lines: { type: 'integer' },
        idempotencyKey: { type: 'string' }
      }),
      handler: async ({ gameId, sessionId, bet, lines, idempotencyKey }) => {
        const result = service.spin({ gameId, sessionId, bet, lines, idempotencyKey });
        if (blender) {
          // 3D 演出为旁路能力：失败只记录，不影响结算
          void blender
            .renderSpin({ gameId: result.gameId, roundId: result.roundId, grid: result.grid })
            .then((r) => {
              if (r?.degraded) logger?.debug('blender render degraded', r);
            })
            .catch(() => {});
        }
        return result;
      }
    },
    {
      name: 'slots.autoSpin',
      description: '连续旋转 N 次（可命中特性即停），返回每轮结果汇总',
      inputSchema: obj({
        gameId: { type: 'string' },
        sessionId: { type: 'string' },
        bet: { type: 'number' },
        lines: { type: 'integer' },
        count: { type: 'integer', minimum: 1, maximum: 100 },
        stopOnFeature: { type: 'boolean' }
      }),
      handler: ({ gameId, sessionId, bet, lines, count, stopOnFeature }) =>
        service.autoSpin({ gameId, sessionId, bet, lines, count, stopOnFeature })
    },
    {
      name: 'slots.getSession',
      description: '查询会话状态（余额、阶段、免费旋转/重旋剩余、统计）',
      inputSchema: obj({ sessionId: { type: 'string' } }, ['sessionId']),
      handler: ({ sessionId }) => service.publicSession(sessionId)
    },
    {
      name: 'slots.closeSession',
      description: '关闭会话并释放预算配额',
      inputSchema: obj({ sessionId: { type: 'string' } }, ['sessionId']),
      handler: ({ sessionId }) => service.closeSession(sessionId)
    },
    {
      name: 'slots.simulate',
      description: '蒙特卡洛自检：返回实际 RTP、命中率、最大倍率、波动指数',
      inputSchema: obj({
        gameId: { type: 'string' },
        spins: { type: 'integer', minimum: 1000, maximum: 2000000 },
        bet: { type: 'number' },
        lines: { type: 'integer' },
        seed: { type: 'string' }
      }, ['gameId']),
      handler: ({ gameId, spins, bet, lines, seed }) =>
        registry.simulate(gameId, { spins: Math.min(spins || 100000, 2000000), bet, lines, seed })
    },
    {
      name: 'slots.history',
      description: '查询最近旋转记录（外部存储优先，不可用时回退内存快照）',
      inputSchema: obj({ gameId: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }),
      handler: async ({ gameId, limit }) => ({ limit: limit ?? 20, spins: await service.history({ gameId, limit }) })
    },
    {
      name: 'slots.leaderboard',
      description: '按单次旋转最高倍率查询排行榜',
      inputSchema: obj({ gameId: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }),
      handler: async ({ gameId, limit }) => ({ limit: limit ?? 10, rows: await service.leaderboard({ gameId, limit }) })
    },
    {
      name: 'store.health',
      description: '外部存储（Neon Postgres / Redis / R2 归档）健康状态与降级情况',
      inputSchema: obj({}),
      handler: async () => (store ? store.health() : { driver: 'none', degraded: true })
    },
    {
      name: 'store.archive',
      description: '把缓冲中的旋转流水立即归档到 Cloudflare R2（JSONL 按小时分片）',
      inputSchema: obj({}),
      handler: async () => (store ? store.flushArchive() : { enabled: false, flushed: 0 })
    },
    {
      name: 'store.snapshot',
      description: '把当前全部机台 CONFIG 备份为 R2 快照，作为参数化调参的回滚点',
      inputSchema: obj({ name: { type: 'string' } }),
      handler: async ({ name }) => {
        const configs = registry.list().map((g) => registry.describeById(g.id));
        if (!store) return { enabled: false, ok: false, count: configs.length };
        const r = await store.snapshotConfigs(name || 'configs', { at: new Date().toISOString(), games: configs });
        return { ...r, count: configs.length };
      }
    },
    {
      name: 'slots.validateConfigs',
      description: '校验全部或指定机台 CONFIG 是否符合契约',
      inputSchema: obj({ gameId: { type: 'string' } }),
      handler: ({ gameId }) => registry.validate(gameId)
    },
    {
      name: 'slots.reloadConfigs',
      description: '热重载 CONFIG（新增/调整机台后无需重启进程）',
      inputSchema: obj({}),
      handler: async () => {
        const before = registry.list().length;
        const summary = await registry.load();
        logger?.info('configs reloaded', { before, after: summary.total });
        return { before, after: summary.total, games: summary.games.map((g) => g.id), failures: summary.failures };
      }
    },
    {
      name: 'slots.registerGame',
      description: '运行时注入一份 CONFIG（参数化配置 / A-B 实验）',
      inputSchema: obj({ config: { type: 'object' } }, ['config']),
      handler: ({ config }) => {
        const r = registry.register(config, { source: 'runtime' });
        return { registered: true, ...r };
      }
    },
    {
      name: 'blender.health',
      description: '检查与既有 Blender MCP 服务的连通性与熔断状态',
      inputSchema: obj({}),
      handler: async () => (blender ? blender.health() : { enabled: false, degraded: true })
    },
    {
      name: 'blender.renderSpin',
      description: '把一次旋转结果推送给 Blender 做 3D/动画演出（降级安全）',
      inputSchema: obj({ gameId: { type: 'string' }, roundId: { type: 'string' }, grid: { type: 'array' } }, ['gameId']),
      handler: async ({ gameId, roundId, grid }) => {
        if (!blender) return { degraded: true, reason: 'bridge disabled' };
        return blender.renderSpin({ gameId, roundId, grid });
      }
    },
    {
      name: 'system.health',
      description: '服务健康检查（进程、机台数、会话数、上游状态）',
      inputSchema: obj({}),
      handler: async () => ({
        ok: true,
        server: SERVER_INFO,
        games: registry.list().length,
        configFailures: registry.failures,
        sessions: service.sessions.size,
        uptimeSec: Math.round(process.uptime()),
        blender: blender ? blender.getState() : 'disabled',
        store: store ? await store.health() : 'disabled'
      })
    },
    {
      name: 'system.metrics',
      description: '查看调用量、耗时与最近错误',
      inputSchema: obj({ reset: { type: 'boolean' } }),
      handler: ({ reset }) => {
        const snapshot = metrics?.snapshot() ?? {};
        if (reset) metrics?.reset();
        return snapshot;
      }
    }
  ];

  for (const t of tools) dispatcher.method(t.name, t);

  dispatcher.method('tools/list', {
    description: 'MCP 标准：列出工具',
    inputSchema: obj({}),
    handler: () => ({ tools: dispatcher.listTools() })
  });

  dispatcher.method('tools/call', {
    description: 'MCP 标准：调用工具',
    inputSchema: obj({ name: { type: 'string' }, arguments: { type: 'object' } }, ['name']),
    handler: async ({ name, arguments: args = {} }) => {
      const def = dispatcher.methods.get(name);
      if (!def) throw new AppError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
      const v = validateParams(args, def.inputSchema);
      if (!v.ok) throw new AppError(ErrorCode.InvalidParams, v.message);
      const result = await def.handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false };
    }
  });

  return tools;
}
