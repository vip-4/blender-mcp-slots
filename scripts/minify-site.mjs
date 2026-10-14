/* 生成单文件压缩版（用于 EdgeOne 等「单 HTML 部署」渠道，命令行参数长度受限）
 *  --slim：移除内联试玩器（CSS / 结构 / JS），改为指向完整版链接，进一步缩到 ~25 KB。
 *  策略：仅删除注释、缩进与换行（源码中无 // 行注释），语义与可访问性属性保持不变。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const src = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const slim = process.argv.includes('--slim');
const FULL_URL = 'https://vip-4.github.io/blender-mcp-slots/#play';

const compactJsonLd = (s) =>
  s.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, json) =>
    `<script type="application/ld+json">${JSON.stringify(JSON.parse(json))}</script>`
  );

const squashBlock = (s, tag, css) => {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  return s.replace(re, (m, body) => {
    let b = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length)
      .join('')
      .replace(/\s{2,}/g, ' ');
    if (css) b = b.replace(/\s*([{}:;,>])\s*/g, '$1');
    return m.replace(body, b);
  });
};

let out = src.replace(/<!--[\s\S]*?-->/g, '');

if (slim) {
  // 1) 试玩器相关样式
  out = out.replace(/\/\* demo-css-start[\s\S]*?demo-css-end \*\//g, '');
  // 2) 试玩器结构 → 指向完整版的入口
  const startIdx = out.indexOf('<section id="play"');
  const endIdx = out.indexOf('</section>', out.indexOf('id="rsLeft"'));
  if (startIdx >= 0 && endIdx > startIdx) {
    out =
      out.slice(0, startIdx) +
      `<section id="play" aria-labelledby="play-title"><h2 id="play-title">在线试玩：星光爆裂</h2>` +
      `<p class="muted">互动试玩器（5×3、10 线、双向赔付、WILD 重旋）为纯前端实现，部署在完整版站点：` +
      `<a href="${FULL_URL}" rel="noopener">前往 ${FULL_URL}</a>。本镜像页保留全部机台规格与实测 RTP 内容。</p></section>` +
      out.slice(endIdx + '</section>'.length);
  }
  // 3) 试玩器脚本
  out = out.replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/g, '');
  // 4) 去掉以 -- 开头的命令行片段：单文件渠道通过 CLI 传参时会被解析成未知参数
  out = out.replace(/--transport=http/g, '（HTTP 模式）').replace(/--port=5173/g, '（端口 5173）');
}

out = compactJsonLd(out);
out = squashBlock(out, 'style', true);
out = squashBlock(out, 'script', false);
out = out
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length)
  .join('\n')
  .replace(/>\s+</g, '><');

mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const name = slim ? 'index.min.html' : 'index.full.min.html';
writeFileSync(path.join(ROOT, 'dist', name), out, 'utf8');
console.log(`${name}: ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB (源 ${(Buffer.byteLength(src) / 1024).toFixed(1)} KB)`);
