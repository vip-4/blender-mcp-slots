/**
 * 初始化 Neon Postgres 表结构（幂等）。
 * 用法：node scripts/migrate.mjs [--check]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/dotenv.js';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL 未设置：请在 .env 或环境变量中配置 Neon 连接串');
  process.exit(1);
}

const pg = await import('pg');
const Client = pg.default?.Client ?? pg.Client;
const client = new Client({ connectionString, statement_timeout: 10000 });

try {
  await client.connect();
  await client.query(readFileSync(path.resolve(ROOT, 'db/schema.sql'), 'utf8'));
  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`
  );
  console.log('migrate ok, tables:', rows.map((r) => r.table_name).join(', '));
  if (process.argv.includes('--check')) {
    const c = await client.query('select count(*)::int as n from slot_spins');
    console.log('slot_spins rows =', c.rows[0].n);
  }
} catch (e) {
  console.error('migrate failed:', e?.message || e);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
