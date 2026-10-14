/**
 * SLOT GAMES 合集前端。
 * 所有机台共用同一份 UI：主题、符号、线数、赔付表、特性全部由 CONFIG 驱动，
 * 新增机台不需要改动本文件的任何逻辑。
 */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => (Number(n) || 0).toFixed(2);

const state = {
  games: [],
  config: null,
  sessionId: null,
  betIndex: 0,
  lines: null,
  spinning: false,
  auto: 0,
  history: [],
  reelEls: []
};

/* ============================ 通信层 ============================ */
async function rpc(method, params = {}) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}-${Math.random()}`, method, params })
  });
  const json = await res.json();
  if (json.error) {
    const e = new Error(json.error.message || 'rpc error');
    e.code = json.error.code;
    throw e;
  }
  return json.result;
}

function setConn(status, text) {
  $('connDot').className = `dot ${status}`;
  $('connText').textContent = text;
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ============================ 符号渲染 ============================ */
function darken(color, amount = 0.35) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = parseInt(color.slice(1), 16);
  const ch = (v) => Math.round(v * (1 - amount));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

const SHAPES = {
  rank: (c, l) => `<text x="50" y="72" text-anchor="middle" font-size="58" font-weight="900" fill="${c}" font-family="Arial Black, Arial, sans-serif">${l}</text>`,
  cherry: (c) => `<circle cx="34" cy="68" r="19" fill="${c}"/><circle cx="70" cy="72" r="16" fill="${c}"/><path d="M40 52C46 22 70 18 80 34" stroke="#2f9e44" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="30" cy="60" r="5" fill="rgba(255,255,255,.5)"/>`,
  lemon: (c) => `<ellipse cx="50" cy="52" rx="33" ry="25" fill="${c}" transform="rotate(-12 50 52)"/><path d="M50 27 L50 77" stroke="rgba(0,0,0,.22)" stroke-width="4"/><path d="M50 52 L20 36 M50 52 L80 36 M50 52 L20 68 M50 52 L80 68" stroke="rgba(0,0,0,.16)" stroke-width="3"/>`,
  grape: (c) => `<g fill="${c}"><circle cx="50" cy="32" r="11"/><circle cx="34" cy="48" r="11"/><circle cx="66" cy="48" r="11"/><circle cx="50" cy="64" r="11"/><circle cx="36" cy="78" r="11"/><circle cx="64" cy="78" r="11"/></g><path d="M50 21 L50 8" stroke="#2f9e44" stroke-width="6" stroke-linecap="round"/>`,
  watermelon: (c) => `<path d="M12 78 A38 38 0 0 1 88 78 Z" fill="${c}"/><path d="M18 78 A32 32 0 0 1 82 78 Z" fill="#ff5d73"/><g fill="#2b1a10"><circle cx="40" cy="60" r="3.5"/><circle cx="60" cy="60" r="3.5"/><circle cx="50" cy="70" r="3.5"/></g>`,
  bell: (c) => `<path d="M50 14c-18 0-30 14-30 32 0 12 6 20 8 26h44c2-6 8-14 8-26 0-18-12-32-30-32z" fill="${c}"/><rect x="30" y="72" width="40" height="8" rx="4" fill="${darken(c)}"/><circle cx="50" cy="85" r="7" fill="${darken(c)}"/>`,
  bar: (c) => `<rect x="10" y="34" width="80" height="32" rx="6" fill="${c}"/><text x="50" y="58" text-anchor="middle" font-size="22" font-weight="900" fill="#1b1206" font-family="Arial">BAR</text>`,
  seven: (c) => `<text x="50" y="76" text-anchor="middle" font-size="78" font-weight="900" fill="${c}" font-family="Arial Black, Arial">7</text>`,
  coin: (c) => `<circle cx="50" cy="52" r="32" fill="${c}"/><circle cx="50" cy="52" r="24" fill="rgba(0,0,0,.16)"/><text x="50" y="65" text-anchor="middle" font-size="36" font-weight="900" fill="rgba(0,0,0,.5)">¤</text>`,
  ingot: (c) => `<path d="M18 40C18 22 34 18 50 30C66 18 82 22 82 40C82 56 66 74 50 78C34 74 18 56 18 40Z" fill="${c}"/><ellipse cx="50" cy="42" rx="18" ry="11" fill="rgba(255,255,255,.35)"/>`,
  lantern: (c) => `<ellipse cx="50" cy="52" rx="30" ry="34" fill="${c}"/><rect x="34" y="12" width="32" height="10" rx="4" fill="#7a1220"/><rect x="34" y="82" width="32" height="10" rx="4" fill="#7a1220"/><path d="M50 92 L50 100" stroke="#ffd166" stroke-width="6"/><ellipse cx="50" cy="52" rx="11" ry="24" fill="rgba(255,255,255,.3)"/>`,
  dragon: (c) => `<path d="M10 80 C22 44 38 92 52 60 C64 32 78 46 88 24" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="82" cy="24" r="14" fill="${c}"/><circle cx="87" cy="20" r="3" fill="#1b1206"/><path d="M70 14 L60 4" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  orb: (c) => `<circle cx="50" cy="52" r="30" fill="${c}"/><circle cx="50" cy="52" r="30" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="3"/><circle cx="40" cy="42" r="9" fill="rgba(255,255,255,.75)"/><path d="M22 62 C36 76 64 76 78 62" stroke="rgba(255,255,255,.5)" stroke-width="4" fill="none"/>`,
  seal: (c) => `<rect x="16" y="16" width="68" height="68" rx="12" fill="${c}"/><rect x="27" y="27" width="46" height="46" rx="8" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="4"/><text x="50" y="64" text-anchor="middle" font-size="32" font-weight="900" fill="#fff" font-family="Microsoft YaHei, sans-serif">龙</text>`,
  crown: (c) => `<path d="M12 74 L20 28 L37 48 L50 20 L63 48 L80 28 L88 74 Z" fill="${c}"/><rect x="12" y="76" width="76" height="10" rx="4" fill="${darken(c)}"/><circle cx="50" cy="66" r="5" fill="#fff"/>`,
  star: (c) => `<polygon points="50,8 62,38 95,38 68,58 78,90 50,70 22,90 32,58 5,38 38,38" fill="${c}"/>`,
  gem: (c) => `<polygon points="50,6 90,40 50,94 10,40" fill="${c}"/><polygon points="50,6 70,40 50,94 30,40" fill="rgba(255,255,255,.35)"/>`,
  ankh: (c) => `<g stroke="${c}" stroke-width="9" fill="none" stroke-linecap="round"><circle cx="50" cy="28" r="15"/><path d="M50 43 L50 92"/><path d="M24 56 L76 56"/></g>`,
  eye: (c) => `<path d="M6 52 C28 24 72 24 94 52 C72 80 28 80 6 52Z" fill="${c}"/><circle cx="50" cy="52" r="14" fill="#1b1206"/><circle cx="50" cy="52" r="6" fill="#fff"/><path d="M50 38 L50 16" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M92 54 L97 78" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  scarab: (c) => `<ellipse cx="50" cy="56" rx="22" ry="28" fill="${c}"/><circle cx="50" cy="26" r="12" fill="${c}"/><path d="M28 46 C10 40 8 66 26 70" fill="rgba(255,255,255,.35)"/><path d="M72 46 C90 40 92 66 74 70" fill="rgba(255,255,255,.35)"/><path d="M50 36 L50 80" stroke="rgba(0,0,0,.3)" stroke-width="4"/>`,
  tomb: (c) => `<path d="M22 88 L22 44 C22 24 78 24 78 44 L78 88 Z" fill="${c}"/><rect x="12" y="84" width="76" height="10" rx="4" fill="${darken(c)}"/><path d="M38 88 L38 56 C38 46 62 46 62 56 L62 88 Z" fill="rgba(0,0,0,.45)"/>`,
  anubis: (c) => `<path d="M28 40 L22 6 L46 28 L54 28 L78 6 L72 40 C72 62 60 76 50 76 C40 76 28 62 28 40Z" fill="${c}"/><path d="M34 44 C34 60 42 68 50 68 C58 68 66 60 66 44 L50 54 Z" fill="rgba(0,0,0,.35)"/><circle cx="42" cy="38" r="4" fill="#1b1206"/><circle cx="58" cy="38" r="4" fill="#1b1206"/>`
};

function symbolSvg(sym) {
  const draw = SHAPES[sym.shape] || SHAPES.gem;
  return `<svg viewBox="0 0 100 100" aria-label="${sym.label || sym.id}">${draw(sym.color || '#cccccc', sym.label || sym.id)}</svg>`;
}

function symbolById(id) {
  return (state.config?.symbols || []).find((s) => s.id === id) || { id, label: id, shape: 'gem', color: '#888' };
}

/* ============================ 大厅 ============================ */
function renderLobby() {
  const grid = $('gameGrid');
  grid.innerHTML = '';
  for (const g of state.games) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.style.setProperty('--card-a', g.theme?.background?.[0] || '#231a2e');
    card.style.setProperty('--card-b', g.theme?.background?.[1] || '#0b0710');
    card.style.setProperty('--primary', g.theme?.primary || '#ff3b3b');
    card.style.setProperty('--accent', g.theme?.accent || '#7b2cbf');
    card.style.setProperty('--secondary', g.theme?.secondary || '#ffd166');
    card.innerHTML = `
      <h3>${g.name}</h3>
      <div class="tagline">${g.theme?.tagline || ''}</div>
      <div class="chips">
        <span class="chip accent">${g.evaluation.mode === 'ways' ? `${g.evaluation.lineCount} WAYS` : `${g.evaluation.lineCount} 线`}</span>
        <span class="chip">${g.grid.reels}×${g.grid.rows}</span>
        <span class="chip">${g.volatility}</span>
        ${(g.features || []).map((f) => `<span class="chip">${featureName(f)}</span>`).join('')}
      </div>
      <div class="card-foot">
        <span>RTP <b>${((g.rtp?.target ?? 0) * 100).toFixed(1)}%</b></span>
        <span>${g.bet.currency} ${g.bet.levels[0]} ~ ${g.bet.levels[g.bet.levels.length - 1]}</span>
      </div>`;
    card.addEventListener('click', () => enterGame(g.id));
    grid.appendChild(card);
  }
  $('lobbyMeta').textContent = `共 ${state.games.length} 台机台 · 共用同一套 CONFIG 引擎 · 引擎版本 ${state.games[0]?.version || ''}`;
}

function featureName(key) {
  return { freeSpins: '免费旋转', holdAndRespin: '金币重旋', collect: '收集符', multiplierWild: '倍率 WILD' }[key] || key;
}

/* ============================ 机台 ============================ */
function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--primary', theme.primary);
  root.setProperty('--secondary', theme.secondary);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--bg1', theme.background?.[0] || '#1a0a12');
  root.setProperty('--bg2', theme.background?.[1] || '#08040a');
  root.setProperty('--frame', theme.frame || '#8c1420');
  if (theme.font) document.body.style.fontFamily = theme.font;
}

async function enterGame(id) {
  state.config = await rpc('slots.getGameConfig', { gameId: id });
  const cfg = state.config;
  applyTheme(cfg.theme || {});
  $('gameName').textContent = cfg.name;
  $('gameTag').textContent = cfg.theme?.tagline || '';
  $('badges').innerHTML = [
    `<span class="chip accent">${cfg.evaluation.mode === 'ways' ? `${cfg.evaluation.lineCount} WAYS` : `${cfg.evaluation.lineCount} 线`}</span>`,
    `<span class="chip">${cfg.grid.reels}×${cfg.grid.rows}</span>`,
    `<span class="chip">RTP ${((cfg.rtp?.target ?? 0) * 100).toFixed(1)}%</span>`,
    `<span class="chip">${cfg.volatility}</span>`,
    `<span class="chip">上限 ${cfg.limits.maxWinMultiplier}x</span>`
  ].join('');

  buildReels();
  state.betIndex = cfg.bet.levels.indexOf(cfg.bet.default ?? cfg.bet.levels[0]);
  if (state.betIndex < 0) state.betIndex = 0;
  buildLinesSelect();
  state.history = [];
  updateBetLabel();

  const session = await rpc('slots.createSession', {
    gameId: id,
    bet: currentBet(),
    lines: state.lines,
    balance: 1000
  });
  state.sessionId = session.sessionId;
  $('balance').textContent = fmt(session.balance);

  $('lobby').classList.add('hidden');
  $('machine').classList.remove('hidden');
  renderGrid(randomGrid(), {});
  $('winLabel').textContent = '祝好运';
  $('winAmount').textContent = '0.00';
  renderHistory();
  renderStats(session.stats);
}

function buildReels() {
  const { grid } = state.config;
  const wrap = $('reels');
  wrap.innerHTML = '';
  wrap.style.gridTemplateColumns = `repeat(${grid.reels}, 1fr)`;
  wrap.style.aspectRatio = `${grid.reels} / ${grid.rows}`;
  state.reelEls = [];
  for (let r = 0; r < grid.reels; r += 1) {
    const col = document.createElement('div');
    col.className = 'reel';
    col.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
    const cells = [];
    for (let row = 0; row < grid.rows; row += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      col.appendChild(cell);
      cells.push(cell);
    }
    wrap.appendChild(col);
    state.reelEls.push({ col, cells });
  }
}

function buildLinesSelect() {
  const sel = $('linesSelect');
  const cfg = state.config;
  sel.innerHTML = '';
  if (cfg.evaluation.mode === 'ways') {
    sel.innerHTML = `<option value="${cfg.evaluation.lineCount}">${cfg.evaluation.lineCount} WAYS</option>`;
    sel.disabled = true;
    state.lines = cfg.evaluation.lineCount;
    return;
  }
  sel.disabled = false;
  const max = cfg.evaluation.lineCount;
  const options = [1, 5, 10, 20, 25, 50].filter((n) => n <= max);
  if (!options.includes(max)) options.push(max);
  for (const n of options) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${n} 线`;
    sel.appendChild(opt);
  }
  sel.value = String(max);
  state.lines = max;
  sel.onchange = () => {
    state.lines = Number(sel.value);
  };
}

function currentBet() {
  return state.config.bet.levels[state.betIndex];
}
function updateBetLabel() {
  $('betValue').textContent = `${currentBet()} ${state.config.bet.currency}`;
}

function randomGrid() {
  const { grid } = state.config;
  const ids = state.config.symbols.filter((s) => s.kind !== 'bonus' && s.kind !== 'scatter').map((s) => s.id);
  return Array.from({ length: grid.reels }, () =>
    Array.from({ length: grid.rows }, () => ids[Math.floor(Math.random() * ids.length)])
  );
}

function renderGrid(grid, { winCells = [], holdCells = [], coinValues = new Map(), wildMults = new Map() } = {}) {
  state.reelEls.forEach(({ cells }, reel) => {
    cells.forEach((cell, row) => {
      const id = grid[reel]?.[row];
      const sym = symbolById(id);
      cell.className = 'cell';
      cell.innerHTML = symbolSvg(sym);
      const key = `${reel},${row}`;
      if (winCells.some((p) => p.reel === reel && p.row === row)) cell.classList.add('win');
      if (holdCells.some((p) => p.reel === reel && p.row === row)) cell.classList.add('hold');
      if (coinValues.has(key)) {
        const v = document.createElement('span');
        v.className = 'coin-value';
        v.textContent = `${coinValues.get(key)}x`;
        cell.appendChild(v);
      }
      if (wildMults.has(key)) {
        const v = document.createElement('span');
        v.className = 'wild-mult';
        v.textContent = `x${wildMults.get(key)}`;
        cell.appendChild(v);
      }
    });
  });
}

/* ============================ 旋转流程 ============================ */
function setSpinning(on) {
  state.spinning = on;
  $('spinBtn').disabled = on;
  $('betDown').disabled = on;
  $('betUp').disabled = on;
  $('linesSelect').disabled = on || state.config.evaluation.mode === 'ways';
  document.querySelectorAll('.auto-btn').forEach((b) => {
    b.disabled = on;
  });
}

async function doSpin() {
  if (state.spinning) return;
  setSpinning(true);
  clearOverlay();
  $('featureBanner').classList.add('hidden');
  $('winLabel').textContent = '旋转中…';

  // 1) 起转：整列滚动动画
  const filler = randomGrid();
  state.reelEls.forEach(({ col, cells }, reel) => {
    col.classList.add('rolling');
    cells.forEach((c, row) => {
      c.innerHTML = symbolSvg(symbolById(filler[reel][row]));
      c.className = 'cell';
    });
  });

  // 2) 请求引擎（结果先到，再按节奏停轮）
  let result;
  const started = Date.now();
  try {
    result = await rpc('slots.spin', { sessionId: state.sessionId, bet: currentBet(), lines: state.lines });
  } catch (e) {
    state.reelEls.forEach(({ col }) => col.classList.remove('rolling'));
    toast(`旋转失败：${e.message}`);
    setSpinning(false);
    return;
  }
  const elapsed = Date.now() - started;
  if (elapsed < 620) await sleep(620 - elapsed);

  // 3) 逐列停下
  for (let reel = 0; reel < state.reelEls.length; reel += 1) {
    await sleep(120);
    state.reelEls[reel].col.classList.remove('rolling');
    const coinValues = new Map(result.bonusCells.map((c) => [`${c.reel},${c.row}`, c.value ?? '']));
    const wildMults = new Map(result.wildMultipliers.map((w) => [`${w.reel},${w.row}`, w.value]));
    const holdCells = result.respins ? result.respins.held : [];
    state.reelEls[reel].cells.forEach((cell, row) => {
      const sym = symbolById(result.grid[reel][row]);
      const key = `${reel},${row}`;
      cell.className = 'cell';
      cell.innerHTML = symbolSvg(sym);
      if (holdCells.some((p) => p.reel === reel && p.row === row)) cell.classList.add('hold');
      if (coinValues.has(key) && coinValues.get(key) !== '') {
        const v = document.createElement('span');
        v.className = 'coin-value';
        v.textContent = `${coinValues.get(key)}x`;
        cell.appendChild(v);
      }
      if (wildMults.has(key)) {
        const v = document.createElement('span');
        v.className = 'wild-mult';
        v.textContent = `x${wildMults.get(key)}`;
        cell.appendChild(v);
      }
    });
  }

  // 4) 中奖演出
  await highlightWins(result);
  await updateHud(result);
  pushHistory(result);

  // 5) 特性 / 自动旋转续转
  const pendingFeature = result.nextPhase !== 'base';
  if (pendingFeature) {
    showFeatureBanner(result);
    setTimeout(() => doSpin(), 1000);
    return;
  }
  $('featureBanner').classList.add('hidden');
  if (state.auto > 0) {
    state.auto -= 1;
    $('autoStop').classList.toggle('hidden', state.auto <= 0);
    setTimeout(() => doSpin(), 380);
    return;
  }
  setSpinning(false);
}

function showFeatureBanner(result) {
  const el = $('featureBanner');
  const fs = result.freeSpins;
  const rs = result.respins;
  if (fs) {
    el.innerHTML = `<b>免费旋转 ${fs.remaining} 次</b><span>倍率 x${fs.multiplier} · 已获 ${fmt(fs.awarded)}</span>`;
  } else if (rs) {
    el.innerHTML = `<b>金币重旋 ${rs.remaining} 次</b><span>已锁定 ${rs.coins} 枚金币</span>`;
  } else if (result.respinSettlement) {
    const jp = result.respinSettlement.jackpot;
    el.innerHTML = `<b>${jp ? `${jp.tier} 奖池 ${jp.multiplier}x` : '金币结算'}</b><span>${fmt(result.respinSettlement.pay)} 已入账</span>`;
    setTimeout(() => el.classList.add('hidden'), 1600);
  } else {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
}

function clearOverlay() {
  $('lineOverlay').innerHTML = '';
}

function cellCenter(reel, row) {
  const cell = state.reelEls[reel].cells[row];
  const wrap = $('reels').getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  return { x: r.left - wrap.left + r.width / 2, y: r.top - wrap.top + r.height / 2 };
}

async function highlightWins(result) {
  const cells = [];
  for (const w of result.lineWins) cells.push(...w.positions);
  for (const w of result.scatterWins) {
    for (let reel = 0; reel < result.grid.length; reel += 1) {
      for (let row = 0; row < result.grid[reel].length; row += 1) {
        if (result.grid[reel][row] === w.symbol) cells.push({ reel, row });
      }
    }
  }
  const winCells = [...new Map(cells.map((c) => [`${c.reel},${c.row}`, c])).values()];

  // 画中奖连线
  const overlay = $('lineOverlay');
  overlay.innerHTML = '';
  const lines = result.lineWins.filter((w) => w.line >= 0 && state.config.payLines?.[w.line]);
  lines.forEach((w, i) => {
    const pts = state.config.payLines[w.line]
      .map((row, reel) => cellCenter(reel, row))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', i === 0 ? '#ffd166' : 'rgba(255,209,102,.55)');
    poly.setAttribute('stroke-width', '4');
    poly.setAttribute('stroke-linejoin', 'round');
    overlay.appendChild(poly);
  });

  if (winCells.length) {
    await sleep(60);
    for (const p of winCells) state.reelEls[p.reel].cells[p.row].classList.add('win');
    await sleep(520);
  }
  return winCells;
}

async function updateHud(result) {
  $('balance').textContent = fmt(result.balance);
  const amount = $('winAmount');
  amount.textContent = fmt(result.totalWin);
  amount.classList.toggle('big', result.totalWin >= result.bet * 5);
  $('winLabel').textContent = result.totalWin > 0 ? `本轮赢得 ${(result.totalWin / result.bet).toFixed(1)}x` : '再试一次';
  if (result.capped) $('winLabel').textContent += '（已达封顶）';

  for (const t of result.triggered) {
    if (t.type === 'freeSpins') toast(`触发免费旋转 ${t.spins} 次！`);
    if (t.type === 'holdAndRespin') toast(`触发金币重旋：${t.coins} 枚金币`);
    if (t.type === 'freeSpinsSettled') toast(`免费旋转结束，共赢 ${fmt(t.pay)}`);
    if (t.type === 'holdAndRespinSettled') {
      toast(t.jackpot ? `${t.jackpot.tier} 奖池！${fmt(t.pay)}` : `金币结算 ${fmt(t.pay)}`);
    }
    if (t.type === 'freeSpinsRetrigger') toast(`再加 ${t.spins} 次免费旋转，倍率 x${t.multiplier}`);
  }

  try {
    const session = await rpc('slots.getSession', { sessionId: state.sessionId });
    renderStats(session.stats);
  } catch {
    /* 统计面板失败不影响主流程 */
  }
}

function pushHistory(result) {
  state.history.unshift({
    roundId: result.roundId,
    phase: result.phase,
    bet: result.bet,
    win: result.totalWin
  });
  if (state.history.length > 30) state.history.length = 30;
  renderHistory();
}

function renderHistory() {
  const box = $('historyList');
  box.innerHTML = state.history.length
    ? state.history
        .map(
          (h) =>
            `<div class="history-row"><span>${phaseName(h.phase)} · 下注 ${h.bet}</span><b class="${
              h.win > 0 ? '' : 'lose'
            }">${h.win > 0 ? `+${fmt(h.win)}` : '0.00'}</b></div>`
        )
        .join('')
    : '<div class="history-row"><span>暂无记录</span></div>';
}

function phaseName(phase) {
  return { base: '基础轮', freeSpins: '免费旋转', holdAndRespin: '金币重旋' }[phase] || phase;
}

function renderStats(stats) {
  if (!stats) return;
  const rtp = stats.totalBet > 0 ? (stats.totalWin / stats.totalBet) * 100 : 0;
  $('statsBox').innerHTML = `
    <div><span>轮次</span><b>${stats.rounds}</b></div>
    <div><span>实际 RTP</span><b>${rtp.toFixed(1)}%</b></div>
    <div><span>总投注</span><b>${fmt(stats.totalBet)}</b></div>
    <div><span>最大单轮</span><b>${fmt(stats.biggestWin)}</b></div>
    <div><span>免费旋转</span><b>${stats.features?.freeSpins || 0}</b></div>
    <div><span>金币重旋</span><b>${stats.features?.holdAndRespin || 0}</b></div>`;
}

/* ============================ 赔付表 ============================ */
function openPaytable() {
  const cfg = state.config;
  $('ptTitle').textContent = `${cfg.name} · 赔付表`;
  const items = cfg.symbols
    .map((s) => {
      const pay = s.pay
        ? Object.entries(s.pay)
            .map(([k, v]) => `${k}连 ${v}x`)
            .join(' · ')
        : s.kind === 'bonus'
          ? '触发金币重旋'
          : s.kind === 'collect'
            ? '收集金币面值'
            : '—';
      return `<div class="pt-item">
        <div class="ic">${symbolSvg(s)}</div>
        <div class="meta"><b>${s.label}</b><span>${pay}${s.payBasis === 'totalBet' ? '（总注）' : ''}</span></div>
      </div>`;
    })
    .join('');
  const rules = [
    cfg.evaluation.mode === 'ways'
      ? `<b>${cfg.evaluation.lineCount} WAYS</b>：相邻轴任意位置连续 ${cfg.evaluation.minMatch} 个相同符号即中奖`
      : `<b>${cfg.evaluation.lineCount} 线</b>：从左起连续 ${cfg.evaluation.minMatch} 个相同符号即中奖`,
    cfg.features?.freeSpins
      ? `<b>免费旋转</b>：${Object.entries(cfg.features.freeSpins.trigger.counts)
          .map(([k, v]) => `${k}散射=${v}次`)
          .join(' / ')}${cfg.features.freeSpins.expandingWild ? ' · 扩张 WILD' : ''}${
          cfg.features.freeSpins.multiplier ? ` · 倍率上限 x${cfg.features.freeSpins.multiplier.max}` : ''
        }`
      : '',
    cfg.features?.holdAndRespin
      ? `<b>金币重旋</b>：${cfg.features.holdAndRespin.triggerCount} 枚金币触发 ${
          cfg.features.holdAndRespin.respins
        } 次重旋，奖池 ${Object.entries(cfg.features.holdAndRespin.jackpots)
          .map(([k, v]) => `${k.toUpperCase()} ${v.cells}格=${v.multiplier}x`)
          .join(' / ')}`
      : '',
    cfg.features?.multiplierWild ? `<b>倍率 WILD</b>：WILD 参与组合时倍率 ${cfg.features.multiplierWild.values.join('/')}x` : '',
    cfg.features?.collect ? `<b>收集符</b>：${symbolById(cfg.features.collect.symbolId).label} 落在第 ${cfg.features.collect.reels.map((r) => r + 1).join('/')} 轴时兑现盘面所有金币` : '',
    `<b>封顶</b>：单轮最高 ${cfg.limits.maxWinMultiplier}x 总投注`
  ]
    .filter(Boolean)
    .map((t) => `<div>${t}</div>`)
    .join('');
  $('ptContent').innerHTML = `<div class="pt-grid">${items}</div><div class="pt-rules">${rules}</div>`;
  $('paytableModal').classList.remove('hidden');
}

/* ============================ 事件绑定 ============================ */
$('backBtn').addEventListener('click', async () => {
  state.auto = 0;
  state.spinning = false;
  if (state.sessionId) {
    try {
      await rpc('slots.closeSession', { sessionId: state.sessionId });
    } catch {
      /* 忽略 */
    }
  }
  state.sessionId = null;
  $('machine').classList.add('hidden');
  $('lobby').classList.remove('hidden');
});
$('spinBtn').addEventListener('click', () => doSpin());
$('betDown').addEventListener('click', () => {
  state.betIndex = Math.max(0, state.betIndex - 1);
  updateBetLabel();
});
$('betUp').addEventListener('click', () => {
  state.betIndex = Math.min(state.config.bet.levels.length - 1, state.betIndex + 1);
  updateBetLabel();
});
document.querySelectorAll('.auto-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.auto = Number(btn.dataset.auto);
    $('autoStop').classList.remove('hidden');
    if (!state.spinning) doSpin();
  });
});
$('autoStop').addEventListener('click', () => {
  state.auto = 0;
  $('autoStop').classList.add('hidden');
});
$('paytableBtn').addEventListener('click', openPaytable);
$('ptClose').addEventListener('click', () => $('paytableModal').classList.add('hidden'));
$('paytableModal').addEventListener('click', (e) => {
  if (e.target === $('paytableModal')) $('paytableModal').classList.add('hidden');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('machine').classList.contains('hidden')) {
    e.preventDefault();
    doSpin();
  }
});

/* ============================ 启动 ============================ */
async function boot() {
  try {
    const health = await rpc('system.health');
    state.online = true;
    setConn('online', `已连接 · ${health.games} 台机台`);
  } catch (e) {
    state.online = false;
    setConn('offline', '服务未连接');
    toast(`无法连接 MCP 服务：${e.message}`);
    return;
  }
  const list = await rpc('slots.listGames');
  state.games = list.games;
  renderLobby();
}

boot();
