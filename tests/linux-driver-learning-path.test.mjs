import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  legacyRedirects,
  plannedArticles,
  wildfireTopics,
  coverageByOrder,
} from './fixtures/linux-driver-textbook-manifest.mjs';

const articleDir = 'docs/articles/linux-driver';

function bodyOf(file) {
  return readFileSync(join(articleDir, file), 'utf8')
    .replace(/^---\r?\n[\s\S]+?\r?\n---(?:\r?\n|$)/, '');
}

function withoutFencedCode(source) {
  let inFence = false;
  return source.split(/\r?\n/).filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return false;
    }
    return !inFence;
  }).join('\n');
}

test('publishes the exact 30-article Linux driver textbook', () => {
  const actual = readdirSync(articleDir)
    .filter((file) => /^linux-driver-\d{2}-.*\.md$/.test(file))
    .sort();
  assert.deepEqual(actual, plannedArticles.map(({ file }) => file).sort());
});

test('published textbook frontmatter follows contiguous order', () => {
  for (const article of plannedArticles) {
    const source = readFileSync(join(articleDir, article.file), 'utf8');
    assert.match(source, /^series: linux-driver$/m);
    assert.match(source, new RegExp(`^order: ${article.order}$`, 'm'));
    assert.match(source, /^draft: false$/m);
    assert.match(source, new RegExp(
      `^title: .*#${String(article.order).padStart(2, '0')}.*${article.titleToken}`,
      'mi',
    ));
  }
});

test('published headings are numbered without restoring old templates', () => {
  for (const { file } of plannedArticles) {
    const prose = withoutFencedCode(bodyOf(file));
    let currentH2Major;
    for (const heading of prose.match(/^#{2,3}\s+.*$/gm) ?? []) {
      if (heading.startsWith('## ')) {
        assert.match(heading, /^## \d+\. /, `${file} has unnumbered H2`);
        currentH2Major = heading.match(/^## (\d+)\. /)[1];
      } else {
        assert.match(heading, /^### \d+\.\d+ /, `${file} has unnumbered H3`);
        assert.ok(currentH2Major, `${file} has orphan H3`);
        assert.equal(heading.match(/^### (\d+)\.\d+ /)[1], currentH2Major);
      }
    }
    assert.doesNotMatch(
      prose,
      /初学者扩展讲解|本章验收|验收问题|建议保留|^## 第[一二三四]步/m,
    );
  }
});

test('framework links all 30 articles in display order', () => {
  const framework = readFileSync(join(articleDir, 'linux-driver-framework.md'), 'utf8');
  let previous = -1;
  for (const { file } of plannedArticles) {
    const current = framework.indexOf(`](${file})`);
    assert.ok(current > previous, `${file} must appear in framework order`);
    previous = current;
  }
});

test('curriculum still covers all 38 EmbedFire topics', () => {
  const covered = new Set(Object.values(coverageByOrder).flat());
  assert.equal(wildfireTopics.length, 38);
  assert.deepEqual([...covered].sort(), [...wildfireTopics].sort());
});

test('legacy route data preserves all 28 historical URLs', () => {
  const redirects = JSON.parse(readFileSync('src/data/linux-driver-legacy.json', 'utf8'));
  assert.deepEqual(redirects, legacyRedirects);
  assert.equal(Object.keys(redirects).length, 28);

  const route = readFileSync('src/pages/linux-driver/[...legacy].astro', 'utf8');
  assert.match(route, /linux-driver-legacy\.json/);
  assert.match(route, /window\.location\.replace\(target\)/);
});

test('BSP legacy routes point directly to new canonical targets', () => {
  const route = readFileSync('src/pages/bsp/[...legacy].astro', 'utf8');
  for (const [legacy, target] of Object.entries(legacyRedirects)) {
    assert.doesNotMatch(route, new RegExp(`/linux-driver/${legacy}/`));
    assert.match(route, new RegExp(
      target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ));
  }
});

export { plannedArticles };
