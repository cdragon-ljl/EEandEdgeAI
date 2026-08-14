import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('zephyr is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,zephyr,bsp,video-audio\}\/\*\*\/\*\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /zephyr:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'zephyr'/);
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
    assert.match(markdown, /^draft: false$/m);
  }
});

test('bsp is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,zephyr,bsp,video-audio\}\/\*\*\/\*\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /bsp:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'bsp'/);
  assert.match(seriesCard, /bsp:/);
});

test('bsp articles include required frontmatter', () => {
  const bspDir = 'docs/articles/bsp';
  const files = readdirSync(bspDir).filter((file) => file.endsWith('.md'));

  assert.equal(files.length, 10);

  for (const file of files) {
    const markdown = readFileSync(join(bspDir, file), 'utf8');
    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: bsp$/m);
    assert.match(markdown, /^order: \d+$/m);
    assert.match(markdown, file === 'linux-bsp-framework.md' ? /^draft: true$/m : /^draft: false$/m);
  }
});

test('video-audio is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,zephyr,bsp,video-audio\}\/\*\*\/\*\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /'video-audio':\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'zephyr', 'bsp', 'video-audio'\]/);
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
