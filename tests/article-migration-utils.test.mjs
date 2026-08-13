import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstDescription,
  firstHeading,
  getOrder,
  normalizeMarkdown,
  slugifyFileName,
  stripFirstHeading,
} from '../scripts/article-migration-utils.mjs';

test('slugifyFileName removes duplicate suffixes and keeps article identity', () => {
  assert.equal(
    slugifyFileName('npu-01-why-embedded-engineer-learn-cuda(3).md'),
    'npu-01-why-embedded-engineer-learn-cuda',
  );
});

test('getOrder reads numeric prefixes from each source naming style', () => {
  assert.equal(getOrder('npu-16-benchmark-resume-portfolio.md'), 16);
  assert.equal(getOrder('rknn-02-pc-env-first-conversion.md'), 2);
  assert.equal(getOrder('09-rust-embedded-no-std-baremetal.md'), 9);
});

test('firstHeading and firstDescription extract article metadata from markdown', () => {
  const markdown = [
    '# 基于RV1126的端侧AI开发',
    '',
    '> 定位：学习 RKNN 工具链',
    '',
    '正文。',
  ].join('\n');

  assert.equal(firstHeading(markdown, 'fallback'), '基于RV1126的端侧AI开发');
  assert.equal(firstDescription(markdown, 'fallback'), '定位：学习 RKNN 工具链');
});

test('normalizeMarkdown rewrites RKNN local image paths only', () => {
  assert.equal(normalizeMarkdown('![board](./images/board.png)', 'rknn'), '![board](/EEandEdgeAI/images/rknn/board.png)');
  assert.equal(normalizeMarkdown('![board](./images/board.png)', 'cuda'), '![board](./images/board.png)');
});

test('stripFirstHeading removes only the leading title heading', () => {
  const markdown = '# Title\n\n## Section\nBody';

  assert.equal(stripFirstHeading(markdown), '## Section\nBody');
});
