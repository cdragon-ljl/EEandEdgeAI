import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';

const articleDir = 'docs/articles/deep-learning';

function articleFiles() {
  return readdirSync(articleDir)
    .filter((file) => /^dl-\d{2}-.+\.md$/.test(file))
    .sort();
}

test('deep-learning is registered as a first-class published series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articleHelpers = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /deep-learning/);
  assert.match(seriesConfig, /'deep-learning':\s*\{/);
  assert.match(seriesConfig, /href: '\/deep-learning\/'/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\].*'deep-learning'/);
  assert.match(articleHelpers, /value === 'deep-learning'/);
  assert.ok(existsSync('public/covers/deep-learning.webp'));
});

test('deep-learning publishes 27 contiguous lessons', () => {
  const files = articleFiles();
  assert.equal(files.length, 27);

  files.forEach((file, index) => {
    const markdown = readFileSync(join(articleDir, file), 'utf8');
    const expectedOrder = index + 1;

    assert.match(markdown, /^series: "deep-learning"$/m, basename(file));
    assert.match(markdown, new RegExp(`^order: ${expectedOrder}$`, 'm'), basename(file));
    assert.match(markdown, /^draft: false$/m, basename(file));
  });
});

test('deep-learning article headings are publication-oriented', () => {
  const timestampHeading =
    /^##\s+.*(?:（[^）\r\n]*\d{2}:\d{2}[^）\r\n]*）|\([^\)\r\n]*\d{2}:\d{2}[^\)\r\n]*\))\s*$/m;

  for (const file of articleFiles()) {
    const markdown = readFileSync(join(articleDir, file), 'utf8');
    assert.doesNotMatch(markdown, timestampHeading, basename(file));
  }
});
