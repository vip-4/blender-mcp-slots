/* 静态站点 SEO / GEO / 可访问性自检：可在 CI 与本地运行 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const SITE = path.resolve(process.cwd(), 'site');
const html = readFileSync(path.join(SITE, 'index.html'), 'utf8');
const problems = [];
const ok = [];

const has = (cond, msg) => (cond ? ok.push(msg) : problems.push(msg));
const meta = (name) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]*content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
};

// 1) 基础 SEO
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
has(title.length > 10 && title.length <= 60, `title 长度 ${title.length}（建议 10~60）`);
for (const k of ['description', 'keywords', 'robots', 'author', 'viewport', 'theme-color']) {
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
for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
  has(!!meta(k), `存在 meta[name=${k}]`);
}
has(meta('twitter:card') === 'summary_large_image', 'twitter:card = summary_large_image');
const ogImage = meta('og:image') || '';
has(/^https:\/\//.test(ogImage), 'og:image 使用绝对 HTTPS 地址');
if (ogImage.startsWith('https://')) {
  const rel = ogImage.replace('https://vip-4.github.io/blender-mcp-slots/', '');
  has(existsSync(path.join(SITE, rel)), `og:image 本地文件存在：${rel}`);
}

// 3) 结构化数据
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
has(blocks.length > 0, `JSON-LD 块数量 ${blocks.length}`);
blocks.forEach((m, i) => {
  try {
    const data = JSON.parse(m[1]);
    const types = (data['@graph'] || []).map((n) => n['@type']);
    ok.push(`JSON-LD #${i} 可解析，类型：${types.join(', ')}`);
  } catch (e) {
    problems.push(`JSON-LD #${i} 解析失败：${e.message}`);
  }
});
const types = blocks
  .flatMap((m) => {
    try { return (JSON.parse(m[1])['@graph'] || []).map((n) => n['@type']); } catch { return []; }
  });
for (const t of ['WebSite', 'SoftwareApplication', 'ItemList', 'FAQPage']) has(types.includes(t), `结构化数据包含 ${t}`);

// 4) 语义化与可访问性
has((html.match(/<h1/g) || []).length === 1, '仅一个 h1');
has(/<main\b/.test(html) && /<header\b/.test(html) && /<footer\b/.test(html) && /<nav\b/.test(html), '存在 main/header/footer/nav 语义标签');
has(/<section[^>]+aria-labelledby/.test(html), 'section 均带 aria-labelledby');
has(/class="skip"/.test(html) && /跳到主要内容/.test(html), '存在跳转到主内容的链接');
const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
has(imgs.length > 0 && imgs.every((s) => /alt="[^"]+"/.test(s)), '所有 img 均有 alt');
has(imgs.every((s) => /loading="lazy"/.test(s) || /width="/.test(s)), 'img 声明尺寸或懒加载');
has(/aria-live="polite"/.test(html), '存在 aria-live 状态区（结果可朗读）');
const tableCaps = (html.match(/<caption>/g) || []).length;
has(tableCaps >= 2, `表格带 caption 数量 ${tableCaps}`);

// 5) GEO：面向生成式引擎的可抽取结构
has(/id="tldr"/.test(html) && /摘要/.test(html), '存在 TL;DR 摘要块（id=tldr）');
has((html.match(/<dl class="facts">/g) || []).length >= 2, '存在事实型 dl 列表');
has(/<h3>如何新增一款老虎机机台？<\/h3>/.test(html), 'FAQ 使用完整问句作为小标题');
has(existsSync(path.join(SITE, 'llms.txt')), '存在 llms.txt（AI 爬虫摘要入口）');
has(existsSync(path.join(SITE, 'sitemap.xml')) && existsSync(path.join(SITE, 'robots.txt')), '存在 sitemap.xml 与 robots.txt');

// 6) 性能：零外部请求
const external = [...html.matchAll(/<(?:script|link|img)\b[^>]*>/g)]
  .map((m) => m[0])
  // canonical / sitemap / manifest 等语义链接不是页面资源，不计入外部依赖
  .filter((tag) => !/rel="(canonical|sitemap|manifest|icon)"/.test(tag))
  .map((tag) => (tag.match(/(?:src|href)="(https?:\/\/[^"]+)"/) || [])[1])
  .filter(Boolean);
const assets = external.filter((u) => !/(github\.com|gitee\.com|atomgit\.com)/.test(u));
has(assets.length === 0, `无外部静态资源依赖（发现 ${assets.length} 个）`);
const size = Buffer.byteLength(html);
has(size < 120 * 1024, `index.html 体积 ${(size / 1024).toFixed(1)} KB（内联 CSS/JS，首屏零阻塞请求）`);

console.log('通过项：');
ok.forEach((m) => console.log('  ✓', m));
if (problems.length) {
  console.log('\n待修复：');
  problems.forEach((m) => console.log('  ✗', m));
  process.exitCode = 1;
} else {
  console.log(`\n全部 ${ok.length} 项检查通过。`);
}
