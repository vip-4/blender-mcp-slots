import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 极简 .env 加载器：只补充缺失的环境变量，绝不覆盖进程已有值。
 * 目的：本地开发免手写环境变量；生产以真实环境变量为准。
 */
export function loadEnv(file = '.env', cwd = process.cwd()) {
  let raw;
  try {
    raw = readFileSync(path.resolve(cwd, file), 'utf8');
  } catch {
    return { loaded: false };
  }
  let count = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      count += 1;
    }
  }
  return { loaded: true, count };
}
