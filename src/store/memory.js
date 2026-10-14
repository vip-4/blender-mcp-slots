/**
 * 内存存储（默认后端 / 最终降级目标）
 * 进程内环形缓冲，零外部依赖，用于保证「外部存储不可用时游戏仍可运行」。
 */
export class MemoryStore {
  constructor({ capacity = 5000 } = {}) {
    this.name = 'memory';
    this.capacity = capacity;
    this.spins = [];
    this.board = new Map(); // `${gameId}:${sessionId}` -> row
  }

  async init() {
    return { ok: true, degraded: false, driver: 'memory' };
  }

  async recordSpin(entry) {
    this.spins.unshift(entry);
    if (this.spins.length > this.capacity) this.spins.length = this.capacity;
    const key = `${entry.gameId}:${entry.sessionId ?? 'anon'}`;
    const prev = this.board.get(key);
    const multiplier = entry.bet > 0 ? entry.totalWin / entry.bet : 0;
    if (!prev || multiplier > prev.bestMultiplier || entry.totalWin > prev.bestWin) {
      this.board.set(key, {
        gameId: entry.gameId,
        sessionId: entry.sessionId ?? 'anon',
        roundId: entry.roundId,
        bestMultiplier: Math.max(multiplier, prev?.bestMultiplier ?? 0),
        bestWin: Math.max(entry.totalWin, prev?.bestWin ?? 0),
        updatedAt: new Date().toISOString()
      });
    }
  }

  async recentSpins({ gameId, limit = 20 } = {}) {
    const list = gameId ? this.spins.filter((s) => s.gameId === gameId) : this.spins;
    return list.slice(0, limit);
  }

  async leaderboard({ gameId, limit = 10 } = {}) {
    const rows = [...this.board.values()].filter((r) => !gameId || r.gameId === gameId);
    rows.sort((a, b) => b.bestMultiplier - a.bestMultiplier || b.bestWin - a.bestWin);
    return rows.slice(0, limit);
  }

  async health() {
    return { ok: true, degraded: false, driver: 'memory', spins: this.spins.length };
  }

  async close() {}
}
