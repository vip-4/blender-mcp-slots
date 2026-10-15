/* 线上冒烟：检查生产环境各页面与资源是否可访问
 * 用法：node scripts/smoke-live.mjs [baseUrl]
 */
import https from 'node:https';

const base = (process.argv[2] || 'https://vip-4.github.io/blender-mcp-slots/').replace(/\/$/, '');
const paths = [
  '/',
  '/games/neon-2048/',
  '/games/neon-snake/',
  '/games/neon-breakout/',
  '/games/starlight-burst/',
  '/llms.txt',
  '/sitemap.xml',
  '/robots.txt',
  '/assets/og-cover.png',
  '/assets/og-2048.png',
  '/assets/og-snake.png',
  '/assets/og-breakout.png'
];

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let len = 0, body = '';
      const isText = !/\.(png)$/.test(url);
      res.on('data', (d) => { len += d.length; if (isText) body += d.toString('utf8'); });
      res.on('end', () => resolve({ status: res.statusCode, len, body, type: res.headers['content-type'] || '' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, len: 0, body: '', type: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, len: 0, body: '', type: e.message }));
  });
}

let failed = 0;
for (const p of paths) {
  const url = base + p;
  const r = await get(url);
  const okStatus = r.status === 200;
  let note = '';
  if (okStatus && /html|xml|text/.test(r.type)) {
    if (p === '/') {
      note = /id="arcade"/.test(r.body) ? '含游戏中心' : '缺少 #arcade';
      if (!/id="arcade"/.test(r.body)) failed += 1;
    }
    if (p.endsWith('/') && p !== '/') {
      const hasVideoGame = /"@type":\s*"VideoGame"/.test(r.body);
      note = hasVideoGame ? '含 VideoGame 结构化数据' : '缺少 VideoGame';
      if (!hasVideoGame) failed += 1;
    }
  }
  const flag = okStatus ? '✓' : '✗';
  if (!okStatus) failed += 1;
  console.log(`${flag} ${String(r.status).padEnd(4)} ${String(Math.round(r.len / 1024)).padStart(5)} KB  ${url}${note ? '  · ' + note : ''}`);
}

console.log(failed ? `\n${failed} 项异常。` : '\n线上全部资源可访问。');
if (failed) process.exitCode = 1;
