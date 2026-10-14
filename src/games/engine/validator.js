import { lineCount } from './paylines.js';

/**
 * CONFIG 契约校验：加载期强制校验（fail-fast），
 * 单个机台配置出错只会让该机台下线，不影响其它机台与整个 MCP 服务。
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(msg);
  };

  need(!!config, 'config is required');
  if (!config) return { ok: false, errors, warnings };

  need(typeof config.id === 'string' && /^[a-z0-9-]+$/.test(config.id), 'id must be kebab-case string');
  need(typeof config.name === 'string' && config.name.length > 0, 'name is required');
  need(typeof config.version === 'string', 'version is required');
  need(config.grid?.reels >= 3 && config.grid?.rows >= 3, 'grid.reels/rows must be >= 3');

  const mode = config.evaluation?.mode;
  need(mode === 'lines' || mode === 'ways', 'evaluation.mode must be "lines" or "ways"');
  if (mode === 'lines') {
    try {
      need(lineCount(config) > 0, 'evaluation.lineSet must resolve to lines');
    } catch (e) {
      errors.push(`lineSet error: ${e.message}`);
    }
  }

  const ids = new Set();
  const kinds = new Set();
  for (const s of config.symbols || []) {
    need(typeof s.id === 'string', `symbol.id required: ${JSON.stringify(s)}`);
    if (ids.has(s.id)) errors.push(`duplicate symbol id: ${s.id}`);
    ids.add(s.id);
    kinds.add(s.kind);
    need(['standard', 'wild', 'scatter', 'bonus', 'collect'].includes(s.kind), `symbol ${s.id} has invalid kind`);
    const w = s.weight;
    need(typeof w === 'number' ? w > 0 : Array.isArray(w) && w.some((x) => x > 0), `symbol ${s.id} needs positive weight`);
    if (s.pay) {
      const keys = Object.keys(s.pay).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < keys.length; i += 1) {
        if (s.pay[keys[i]] < s.pay[keys[i - 1]]) warnings.push(`symbol ${s.id} paytable is not monotonic at ${keys[i]}`);
      }
      if (keys[0] !== undefined && keys[0] < (config.evaluation?.minMatch || 3)) {
        warnings.push(`symbol ${s.id} pays below minMatch`);
      }
    }
  }
  need(kinds.has('standard'), 'at least one standard symbol is required');
  if (!kinds.has('wild')) warnings.push('no wild symbol defined');

  need(!!config.reelSets?.base, 'reelSets.base is required');
  for (const [key, set] of Object.entries(config.reelSets || {})) {
    need((set.length || 64) >= config.grid.rows * 3, `reelSet ${key} length too small for stacking`);
    for (const id of Object.keys(set.overrides || {})) {
      if (!ids.has(id)) errors.push(`reelSet ${key} overrides unknown symbol: ${id}`);
    }
  }

  const levels = config.bet?.levels;
  if (levels) {
    need(levels.length > 0, 'bet.levels must not be empty');
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i] <= levels[i - 1]) errors.push('bet.levels must be strictly ascending');
    }
    if (config.bet.default !== undefined && !levels.includes(config.bet.default)) {
      errors.push('bet.default must be one of bet.levels');
    }
  } else {
    need(config.bet?.min > 0 && config.bet?.max >= config.bet.min, 'bet.min/max required when levels missing');
  }

  const fs = config.features?.freeSpins;
  if (fs) {
    const sid = fs.trigger?.symbolId;
    need(ids.has(sid), `freeSpins.trigger.symbolId "${sid}" not defined`);
    need(config.symbols.find((s) => s.id === sid)?.kind === 'scatter', 'freeSpins trigger symbol must be kind=scatter');
    need(Object.keys(fs.trigger?.counts || {}).length > 0, 'freeSpins.trigger.counts required');
    if (fs.reelSet && !config.reelSets?.[fs.reelSet]) errors.push(`freeSpins.reelSet "${fs.reelSet}" missing`);
    for (const reel of fs.expandingWild?.reelIndexes || []) {
      need(reel >= 0 && reel < config.grid.reels, `expandingWild reel ${reel} out of range`);
    }
    if (fs.expandingSymbol) {
      need((fs.expandingSymbol.minCount ?? 2) >= 2, 'freeSpins.expandingSymbol.minCount must be >= 2');
      for (const id of fs.expandingSymbol.candidates || []) {
        need(ids.has(id), `expandingSymbol candidate "${id}" not defined`);
        need(
          config.symbols.find((s) => s.id === id)?.kind === 'standard',
          `expandingSymbol candidate "${id}" must be kind=standard`
        );
      }
      for (const reel of fs.expandingSymbol.reels || []) {
        need(reel >= 0 && reel < config.grid.reels, `expandingSymbol reel ${reel} out of range`);
      }
    }
  }

  const cas = config.features?.cascades;
  if (cas) {
    need(Array.isArray(cas.ladder) && cas.ladder.length > 0, 'cascades.ladder must be a non-empty array');
    for (const v of cas.ladder || []) {
      need(typeof v === 'number' && v > 0, `cascades.ladder value "${v}" must be a positive number`);
    }
    need((cas.maxSteps ?? 8) >= 1, 'cascades.maxSteps must be >= 1');
    if (cas.removeWild) warnings.push('cascades.removeWild=true will keep wilds on the grid between cascades');
  }

  const hr = config.features?.holdAndRespin;
  if (hr) {
    const bid = hr.trigger?.symbolId;
    need(ids.has(bid), `holdAndRespin.trigger.symbolId "${bid}" not defined`);
    need(config.symbols.find((s) => s.id === bid)?.kind === 'bonus', 'holdAndRespin trigger symbol must be kind=bonus');
    need((hr.triggerCount ?? 6) >= 3, 'holdAndRespin.triggerCount must be >= 3');
    need((hr.respins ?? 3) >= 1, 'holdAndRespin.respins must be >= 1');
  }

  const col = config.features?.collect;
  if (col) {
    need(ids.has(col.symbolId), `collect.symbolId "${col.symbolId}" not defined`);
    for (const reel of col.reels || []) need(reel < config.grid.reels, `collect reel ${reel} out of range`);
  }

  need((config.limits?.maxWinMultiplier ?? 0) > 0, 'limits.maxWinMultiplier must be > 0');
  if (config.rtp?.target !== undefined) {
    need(config.rtp.target > 0 && config.rtp.target < 1.2, 'rtp.target out of sane range');
  }
  if (!config.theme?.primary) warnings.push('theme.primary missing, frontend will fallback');

  return { ok: errors.length === 0, errors, warnings };
}
