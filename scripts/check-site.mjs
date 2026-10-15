/* 静态站点 SEO / GEO / 可访问性自检（CI 与本地通用）
 * 用法：node scripts/check-site.mjs [相对 site 的文件路径]   （默认检查全部页面）
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const BASE = 'https://vip-4.github.io/blender-mcp-slots/';

const PAGES = (() => {
  const pages = ['index.html'];
  const gamesDir = path.join(SITE, 'games');
  if (existsSync(gamesDir)) {
    readdirSync(gamesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .forEach((d) => pages.push(path.join('games', d.name, 'index.html')));
  }
  return pages;
})();

const targets = process.argv[2] ? [process.argv[2]] : PAGES;
let failed = 0;

function checkPage(rel) {
  const file = path.resolve(SITE, rel);
  const html = readFileSync(file, 'utf8');
  const ok = [];
  const bad = [];
  const has = (cond, msg) => (cond ? ok.push(msg) : bad.push(msg));
  const meta = (name) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]*content="([^"]*)"`, 'i'));
    return m ? m[1] : null;
  };

  console.log(`\n=== ${rel} ===`);

  // 1) 基础 SEO
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  has(title.length >= 10 && title.length <= 60, `title 长度 ${title.length}（建议 10~60）`);
  for (const k of ['description', 'keywords', 'robots', 'viewport', 'theme-color']) {
    has(!!meta(k), `存在 meta[name=${k}]`);
  }
  const desc = meta('description') || '';
  has(desc.length >= 80 && desc.length <= 170, `description 长度 ${desc.length}（建议 80~170）`);
  has(/<link rel="canonical"/.test(html), '存在 canonical');
  has(/<html lang="zh-CN">/.test(html), 'html lang=zh-CN');

  // 2) Open Graph / Twitter Card
  for (const k of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:locale']) {
    has(!!meta(k), `存在 meta[property=${k}]`);
  }
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    has(!!meta(k), `存在 meta[name=${k}]`);
  }
  has(meta('twitter:card') === 'summary_large_image', 'twitter:card = summary_large_image');
  const ogImage = meta('og:image') || '';
  has(ogImage.startsWith('https://'), 'og:image 使用绝对 HTTPS 地址');
  if (ogImage.startsWith(BASE)) {
    const rel2 = ogImage.slice(BASE.length);
    const f = path.join(SITE, rel2);
    has(existsSync(f), `og:image 本地文件存在：${rel2}`);
    if (existsSync(f)) {
      const size = statSync(f).size;
      has(size < 2 * 1024 * 1024, `og:image 体积 ${(size / 1024).toFixed(0)} KB < 2 MB`);
    }
  }
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  has(canonical.startsWith('https://'), 'canonical 为绝对地址');

  // 3) 结构化数据
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  has(blocks.length > 0, `JSON-LD 块数量 ${blocks.length}`);
  const types = [];
  blocks.forEach((m, i) => {
    try {
      const data = JSON.parse(m[1]);
      (data['@graph'] || [data]).forEach((n) => types.push(n['@type']));
      ok.push(`JSON-LD #${i} 可解析`);
    } catch (e) {
      bad.push(`JSON-LD #${i} 解析失败：${e.message}`);
    }
  });
  const isHome = rel === 'index.html';
  const need = isHome ? ['WebSite', 'SoftwareApplication', 'ItemList', 'FAQPage'] : ['VideoGame', 'BreadcrumbList'];
  need.forEach((t) => has(types.includes(t), `结构化数据包含 ${t}`));

  // 4) 语义化与可访问性
  has((html.match(/<h1\b/g) || []).length === 1, '仅一个 h1');
  has(/<main\b/.test(html) && /<header\b/.test(html) && /<footer\b/.test(html) && /<nav\b/.test(html), '存在 main/header/footer/nav 语义标签');
  has(/aria-labelledby=/.test(html), '存在 aria-labelledby 关联标题');
  has(/class="skip"/.test(html), '存在跳转到主内容的链接');
  has(/aria-live="polite"/.test(html), '存在 aria-live 状态区（结果可朗读）');
  has(/role="status"|aria-live="polite"/.test(html), '状态可被辅助技术播报');
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  has(imgs.every((s) => /alt="[^"]+"/.test(s)), `所有 img 均有 alt（${imgs.length} 张）`);
  has(/prefers-reduced-motion/.test(html), '尊重 prefers-reduced-motion');
  has(/prefers-color-scheme/.test(html), '支持明暗双主题');
  has(/:focus-visible/.test(html), '存在可见焦点样式');

  // 5) GEO：面向生成式引擎的可抽取结构
  has(/<dl class="facts">/.test(html), '存在事实型 dl 列表（便于 AI 抽取）');
  has(/<table>/.test(html) || /<dl class="facts">/.test(html), '存在表格或事实列表');
  if (isHome) {
    has(/id="tldr"/.test(html), '存在 TL;DR 摘要块（id=tldr）');
    has(/<h3>如何新增一款老虎机机台？<\/h3>/.test(html), 'FAQ 使用完整问句作为小标题');
    has(/id="arcade"/.test(html), '存在轻量静态游戏入口（id=arcade）');
    has(existsSync(path.join(SITE, 'llms.txt')), '存在 llms.txt（AI 爬虫摘要入口）');
  }

  // 6) 性能：零外部请求 + 体积
  const external = [...html.matchAll(/<(?:script|link|img)\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/rel="(canonical|sitemap|manifest|icon)"/.test(tag))
    .map((tag) => (tag.match(/(?:src|href)="(https?:\/\/[^"]+)"/) || [])[1])
    .filter(Boolean)
    .filter((u) => !/(github\.com|gitee\.com|atomgit\.com|itch\.io|ldjam\.com)/.test(u));
  has(external.length === 0, `无外部静态资源依赖（发现 ${external.length} 个）`);
  const size = Buffer.byteLength(html);
  has(size < 120 * 1024, `页面体积 ${(size / 1024).toFixed(1)} KB（内联 CSS/JS）`);

  ok.forEach((m) => console.log('  ✓', m));
  if (bad.length) {
    failed += bad.length;
    bad.forEach((m) => console.log('  ✗', m));
  }
  return bad.length === 0;
}

targets.forEach(checkPage);

// 站点级文件
console.log('\n=== 站点级文件 ===');
const siteLevel = ['robots.txt', 'sitemap.xml', 'llms.txt', '404.html', 'manifest.webmanifest', '.nojekyll'];
siteLevel.forEach((f) => {
  const ex = existsSync(path.join(SITE, f));
  console.log(`  ${ex ? '✓' : '✗'} 存在 ${f}`);
  if (!ex) failed += 1;
});
const sitemap = readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
PAGES.forEach((p) => {
  const posix = p.split(path.sep).join('/');
  const url = BASE + (posix === 'index.html' ? '' : posix.replace(/index\.html$/, ''));
  const inMap = sitemap.includes(`<loc>${url}</loc>`);
  console.log(`  ${inMap ? '✓' : '✗'} sitemap 包含 ${url}`);
  if (!inMap) failed += 1;
});

console.log(failed ? `\n共 ${failed} 项待修复。` : '\n全部检查通过。');
if (failed) process.exitCode = 1;
