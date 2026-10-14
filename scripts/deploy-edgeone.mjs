/* 发布单文件镜像到 EdgeOne Pages（免登录、免 API Key）
 * 用法：node scripts/deploy-edgeone.mjs [file]
 * 说明：直接 spawn mcporter CLI，避免 shell 对长参数与换行的二次解析。
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(root, 'site', 'dist', 'index.min.html');
const html = readFileSync(file, 'utf8');
const cli =
  process.env.MCPORTER_CLI ||
  path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx', 'bdbf2deecdd22bc5', 'node_modules', 'mcporter', 'dist', 'cli.js');

const args = [cli, 'call', 'mcp-on-edge.edgeone.app/mcp-server.deploy-html', `value=${html}`];
console.log(`deploying ${path.relative(root, file)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) ...`);

const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });
child.on('close', (code) => {
  console.log(out.trim() || '(no output)');
  process.exitCode = code === 0 ? 0 : code;
});
