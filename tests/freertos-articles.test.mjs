import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const freertosDir = 'docs/articles/freertos';
const frameworkPath = join(freertosDir, 'freertos-kernel-framework.md');
const expectedChapters = [
  '源码阅读方法与 List_t/ListItem_t',
  'TCB、任务创建与删除',
  '调度器、Tick、阻塞与唤醒',
  'Cortex-M4 移植与上下文切换',
  'RISC-V 移植与 trap 上下文',
  'Queue、ISR 路径与 Queue Set',
  '信号量、互斥锁与优先级继承',
  '任务通知与 Event Group',
  'Stream Buffer 与 Message Buffer',
  '软件定时器与 Timer daemon',
  '静态分配与 heap_1 到 heap_5',
  '源码与工程面试专题',
];

test('freertos directory contains only the draft framework', () => {
  const files = readdirSync(freertosDir)
    .filter((file) => file.endsWith('.md'))
    .sort();

  assert.deepEqual(files, ['freertos-kernel-framework.md']);
});

test('freertos framework defines the approved 12-article sequence', () => {
  const markdown = readFileSync(frameworkPath, 'utf8');

  assert.match(markdown, /^series: freertos$/m);
  assert.match(markdown, /^order: 0$/m);
  assert.match(markdown, /^draft: true$/m);
  assert.match(markdown, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(markdown, /9b777ae5c5b8e9e456065a00294d1e5f5f9facf5/);

  const headings = [...markdown.matchAll(/^### \d+\. (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, expectedChapters);
});

test('freertos framework rejects the old quota-driven template', () => {
  const markdown = readFileSync(frameworkPath, 'utf8');

  assert.doesNotMatch(markdown, /800|1500|6～9|至少 \d+ 个 Mermaid|视觉点配额/);
  assert.doesNotMatch(markdown, /^(入口条件|执行动作|核心状态变化|可观察证据|验收记录模板)：/m);
  assert.match(markdown, /先完成第 1 篇样稿/);
  assert.match(markdown, /不再一次性批量生成/);
});

test('article prose allows long technical identifiers to wrap on narrow screens', () => {
  const globalCss = readFileSync('src/styles/global.css', 'utf8');

  assert.doesNotMatch(globalCss, /\.prose\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(globalCss, /\.prose :where\(p, li, blockquote\)\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

test('mobile article reading is not occluded by the floating back-to-top button', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');

  assert.match(siteLayout, /id="back-to-top" class="[^"]*\bhidden\b[^"]*\bsm:flex\b/);
});

test('freertos remains registered as a first-class site series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /freertos/);
  assert.match(seriesConfig, /freertos:\s*\{/);
  assert.match(seriesConfig, /href: '\/freertos\/'/);
  assert.match(articlesLib, /value === 'freertos'/);
});