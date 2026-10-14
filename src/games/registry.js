import { readdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildReelStrips } from './engine/reels.js';
import { resolveLines, lineCount } from './engine/paylines.js';
import { validateConfig } from './engine/validator.js';
import { createState, playRound } from './engine/round.js';
import { simulate } from './engine/math.js';
import { AppError, ErrorCode } from '../shared/errors.js';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'configs');

/**
 * 机台注册表 —— 全部游戏的统一入口。
 * 新增一款机台 = 往 configs/ 放一个 CONFIG 文件，重启或调用 slots.reloadConfigs 即生效。
 */
export class SlotGameRegistry {
  constructor({ configDir, logger }) {
    this.configDir = configDir ? path.resolve(configDir) : DEFAULT_DIR;
    this.logger = logger;
    this.games = new Map(); // id -> { config, derived, source, validation }
    this.failures = [];
  }

  static defaultDir() {
    return DEFAULT_DIR;
  }

  async load() {
    this.games.clear();
    this.failures = [];
    const dir = this.configDir;
    let files = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'));
    } catch (e) {
      throw new AppError(ErrorCode.InvalidConfig, `cannot read config dir ${dir}: ${e.message}`);
    }

    for (const file of files) {
      const url = pathToFileURL(path.join(dir, file)).href;
      try {
        const mod = await import(`${url}?v=${Date.now()}`);
        const config = mod.default;
        this.register(config, { source: file });
      } catch (e) {
        // 单份 CONFIG 损坏 → 只记录故障，不影响其它机台与整体服务
        this.failures.push({ file, error: e.message });
        this.logger?.error('config load failed', { file, error: e.message });
      }
    }
    this.logger?.info('slot configs loaded', { count: this.games.size, failures: this.failures.length });
    return this.summary();
  }

  /** 挂载 / 热更新单个机台（支持运行时参数化配置注入） */
  register(config, { source = 'runtime' } = {}) {
    const prepared = applyTuning(config);
    const validation = validateConfig(prepared);
    if (!validation.ok) {
      throw new AppError(ErrorCode.InvalidConfig, `invalid config ${config?.id}`, {
        source,
        errors: validation.errors
      });
    }
    const derived = this.derive(prepared);
    this.games.set(prepared.id, { config: prepared, rawConfig: config, derived, source, validation });
    if (validation.warnings.length) {
      this.logger?.warn('config warnings', { id: config.id, warnings: validation.warnings });
    }
    return { id: config.id, validation };
  }

  /** 由 CONFIG 推导运行期只读数据（转轮条带、线组、索引） */
  derive(config) {
    const strips = {};
    for (const key of Object.keys(config.reelSets || {})) strips[key] = buildReelStrips(config, key);
    if (!strips.base) throw new AppError(ErrorCode.InvalidConfig, `reelSets.base missing for ${config.id}`);
    return {
      strips,
      lines: resolveLines(config),
      lineCount: lineCount(config),
      symbolMap: new Map(config.symbols.map((s) => [s.id, s]))
    };
  }

  unregister(id) {
    return this.games.delete(id);
  }

  get(id) {
    const g = this.games.get(id);
    if (!g) throw new AppError(ErrorCode.GameNotFound, `game "${id}" not found`, { available: [...this.games.keys()] });
    return g;
  }

  has(id) {
    return this.games.has(id);
  }

  list() {
    return [...this.games.values()].map((g) => this.describe(g));
  }

  summary() {
    return { total: this.games.size, games: this.list(), failures: this.failures };
  }

  /** 面向前端/MCP 的机台摘要（不含内部派生数据） */
  describe(g) {
    const { config, derived } = g;
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      provider: config.provider,
      theme: config.theme,
      grid: config.grid,
      evaluation: {
        mode: config.evaluation.mode,
        lineCount: derived.lineCount,
        minMatch: config.evaluation.minMatch || 3
      },
      symbols: config.symbols,
      payLines: derived.lines.map((l) => l.map((p) => p.row)),
      bet: config.bet,
      features: Object.keys(config.features || {}),
      featureDetail: config.features || {},
      limits: config.limits,
      rtp: config.rtp,
      volatility: config.volatility,
      reelStrips: derived.strips
    };
  }

  describeById(id) {
    return this.describe(this.get(id));
  }

  createState(gameId, opts) {
    const { config } = this.get(gameId);
    return createState(config, opts);
  }

  play(gameId, state, opts) {
    const { config, derived } = this.get(gameId);
    return playRound({ config, derived, state, ...opts });
  }

  simulate(gameId, opts) {
    const { config, derived } = this.get(gameId);
    return simulate({ config, derived, ...opts });
  }

  validate(gameId) {
    if (gameId) {
      const g = this.get(gameId);
      return { id: gameId, ...g.validation };
    }
    return [...this.games.values()].map((g) => ({ id: g.config.id, ...g.validation }));
  }
}

/**
 * 运营调参：CONFIG.tuning.payScale 是赔付表全局系数，
 * 让 RTP 微调不必逐行改写赔付表（改完仍需跑 slots.simulate 验证）。
 */
export function applyTuning(config) {
  const scale = config?.tuning?.payScale;
  if (!scale || scale === 1) return config;
  const clone = structuredClone(config);
  for (const s of clone.symbols || []) {
    if (!s.pay) continue;
    for (const k of Object.keys(s.pay)) s.pay[k] = Math.round(s.pay[k] * scale * 100) / 100;
  }
  return clone;
}

export async function createRegistry({ configDir, logger } = {}) {
  const registry = new SlotGameRegistry({
    configDir: configDir || process.env.SLOT_CONFIG_DIR || DEFAULT_DIR,
    logger
  });
  await registry.load();
  return registry;
}
