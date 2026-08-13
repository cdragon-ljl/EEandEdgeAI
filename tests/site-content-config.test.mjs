import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('zephyr is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,zephyr\}\/\*\*\/\*\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'zephyr'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'zephyr';/);
  assert.match(seriesConfig, /zephyr:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'zephyr'\]/);
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
