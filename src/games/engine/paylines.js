/**
 * 线组定义。config.evaluation.lineSet 引用这里的键，
 * 新增机台只需引用已有线组或在此登记新线组，无需改动判定逻辑。
 * 行下标 0 为顶排。
 */
export const LINE_SETS = {
  '3x3:5': [
    [1, 1, 1],
    [0, 0, 0],
    [2, 2, 2],
    [0, 1, 2],
    [2, 1, 0]
  ],
  '5x3:20': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [1, 0, 1, 0, 1],
    [1, 2, 1, 2, 1],
    [0, 0, 2, 0, 0]
  ],
  '5x3:10': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [0, 0, 2, 2, 2]
  ]
};

export function resolveLines(config) {
  const { mode, lineSet } = config.evaluation;
  if (mode === 'ways') return [];
  const lines = LINE_SETS[lineSet];
  if (!lines) throw new Error(`unknown lineSet: ${lineSet}`);
  return lines.map((pattern) => pattern.map((row, reel) => ({ reel, row })));
}

export function lineCount(config) {
  return config.evaluation.mode === 'ways'
    ? config.evaluation.ways || config.grid.rows ** config.grid.reels
    : LINE_SETS[config.evaluation.lineSet].length;
}
