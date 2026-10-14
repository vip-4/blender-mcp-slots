/**
 * Cloudflare R2 自检脚本（部署前验证凭据与网络可达性）
 *   node scripts/r2check.mjs
 * 依赖环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
 */
import { loadEnv } from '../src/config/dotenv.js';
import { R2Client } from '../src/store/r2.js';

loadEnv();

const client = R2Client.fromEnv();
if (!client) {
  console.log('SKIP: 未配置 R2_* 环境变量，归档功能自动关闭（不影响游戏主流程）');
  process.exit(0);
}

const key = '_selftest.json';
const steps = [
  ['连接桶', () => client.headBucket()],
  ['写入对象', () => client.put(key, JSON.stringify({ ok: true, at: new Date().toISOString() }), 'application/json')],
  ['读取对象', async () => (await client.get(key)).text]
];

let failed = 0;
for (const [name, fn] of steps) {
  try {
    const r = await fn();
    console.log(`OK   ${name}${r?.text ? ` -> ${r.text.slice(0, 80)}` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name} -> ${String(e?.message || e)}`);
  }
}

if (failed) {
  console.log('\n结论：R2 不可用（凭据错误或出口网络被拦截）。服务会自动降级：旋转流水仅写内存/数据库，游戏流程不受影响。');
  process.exit(1);
}
console.log(`\n结论：R2 可用（bucket=${client.bucket}, endpoint=${client.endpoint}）`);
