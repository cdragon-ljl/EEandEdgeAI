import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('zephyr is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio\}\/\*\*\/!\(riscv-architecture-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'riscv' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /zephyr:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'zephyr'/);
});

test('riscv is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio\}\/\*\*\/!\(riscv-architecture-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'riscv' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /riscv:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'riscv'/);
  assert.match(seriesCard, /riscv:/);
});

test('the first RISC-V article includes required published frontmatter', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 1$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300);
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5);
});

test('the second RISC-V article covers an engineering CMake build workflow', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-02-cmake-build-system.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #02 · CMake 构建系统：工程化构建管理"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 2$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'article should include explanatory diagrams');
});

test('the third RISC-V article explains registers and assembly at the ABI boundary', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-03-register-assembly.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #03 · RISC-V 寄存器架构与汇编语法"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 3$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'article should include explanatory diagrams');
});

test('remaining RISC-V articles meet the long-form publication contract', () => {
  const articles = [
    ['qemu-riscv-04-linker-startup.md', 4],
    ['qemu-riscv-05-interrupt-clint-plic.md', 5],
    ['qemu-riscv-06-timer-tick.md', 6],
    ['qemu-riscv-07-freertos-port-p1.md', 7],
    ['qemu-riscv-08-freertos-port-p2.md', 8],
    ['qemu-riscv-09-debug-gdb-test.md', 9],
    ['qemu-riscv-10-customize-virt-machine.md', 10],
    ['riscv-11-instruction-encoding-qemu-internals.md', 11],
    ['riscv-12-privilege-csr-trap.md', 12],
    ['riscv-13-atomic-lrsc-amo-fence.md', 13],
    ['riscv-14-datapath-pipeline.md', 14],
    ['riscv-15-hazard-branch-prediction.md', 15],
    ['riscv-16-cache-memory-hierarchy.md', 16],
    ['riscv-17-picorv32-vexriscv-analysis.md', 17],
    ['riscv-18-softcore-rv32-vs-rv64.md', 18],
    ['riscv-19-sv39-mmu-page-table.md', 19],
    ['riscv-20-opensbi-linux-boot-chain.md', 20],
    ['riscv-21-zynq-xc7z020-vivado.md', 21],
    ['riscv-22-microblaze-v-minimal-system.md', 22],
    ['riscv-23-microblaze-v-baremetal-gpio-uart.md', 23],
    ['riscv-24-microblaze-v-freertos.md', 24],
    ['riscv-25-final-project-riscv-softcore-soc.md', 25],
    ['riscv-26-sg2002-milkv-duo-npu-soc.md', 26],
    ['riscv-27-rvv-vector-extension.md', 27],
    ['riscv-28-rvv-matrix-mul-conv.md', 28],
    ['riscv-29-edge-ai-deploy-riscv.md', 29],
    ['riscv-30-final-project-riscv-edge-ai.md', 30],
  ];

  for (const [file, order] of articles) {
    const markdown = readFileSync(join('docs/articles/riscv', file), 'utf8');

    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: riscv$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.ok(markdown.split(/\r?\n/).length >= 300, `${file} should be long-form`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} should include explanatory diagrams`);
  }
});

test('the RISC-V series framework is excluded from article collection loading', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');

  assert.match(contentConfig, /\*\*\/!\(riscv-architecture-framework\)\.md/);
});

test('zephyr articles include required frontmatter', () => {
  const zephyrDir = 'docs/articles/zephyr';
  const files = readdirSync(zephyrDir).filter((file) => file.endsWith('.md'));

  assert.ok(files.length >= 3);

  for (const file of files) {
    const markdown = readFileSync(join(zephyrDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: zephyr$/m);
    assert.match(markdown, /^order: \d+$/m);
    const isDraft = file === 'zephyr-framework.md';
    assert.match(markdown, isDraft ? /^draft: true$/m : /^draft: false$/m);
  }
});

test('bsp is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio\}\/\*\*\/!\(riscv-architecture-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'riscv' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /bsp:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'bsp'/);
  assert.match(seriesCard, /bsp:/);
});

test('bsp articles include required frontmatter', () => {
  const bspDir = 'docs/articles/bsp';
  const files = readdirSync(bspDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 49);

  for (const file of files) {
    const markdown = readFileSync(join(bspDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: bsp$/m);
    assert.match(markdown, /^order: \d+$/m);
    const isDraft = file === 'linux-bsp-framework.md';
    assert.match(markdown, isDraft ? /^draft: true$/m : /^draft: false$/m);
  }
});

test('published BSP articles 10 through 48 meet the long-form publication standard', () => {
  const bspDir = 'docs/articles/bsp';

  for (let order = 10; order <= 48; order += 1) {
    const prefix = `bsp-${String(order).padStart(2, '0')}-`;
    const file = readdirSync(bspDir).find((candidate) => candidate.startsWith(prefix));
    assert.ok(file, `missing article for BSP-${String(order).padStart(2, '0')}`);

    const markdown = readFileSync(join(bspDir, file), 'utf8');
    assert.ok(markdown.split(/\r?\n/).length >= 300, `${file} must be a long-form article`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} must include at least five Mermaid diagrams`);
  }
});

test('video-audio is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio\}\/\*\*\/!\(riscv-architecture-framework\)\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'riscv' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /'video-audio':\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'video-audio'/);
  assert.match(seriesCard, /'video-audio':/);
});

test('video-audio articles include required frontmatter', () => {
  const videoAudioDir = 'docs/articles/video-audio';
  const files = readdirSync(videoAudioDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 24);

  for (const file of files) {
    const markdown = readFileSync(join(videoAudioDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: video-audio$/m);
    assert.match(markdown, /^order: \d+$/m);
    assert.match(markdown, /^draft: false$/m);
  }
});
