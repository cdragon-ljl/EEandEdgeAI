import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const eeSystemDir = 'docs/articles/ee-system';

test('ee-system contains 40 contiguous publishable articles', () => {
  const files = readdirSync(eeSystemDir)
    .filter((file) => file.endsWith('.md'))
    .sort();

  assert.equal(files.length, 40);

  files.forEach((file, index) => {
    const order = index + 1;
    const prefix = String(order).padStart(2, '0');
    const markdown = readFileSync(join(eeSystemDir, file), 'utf8');
    const frontmatter = markdown.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);

    assert.match(file, new RegExp(`^${prefix}-`), `unexpected article order for ${file}`);
    assert.ok(frontmatter, `${file} must have YAML frontmatter`);
    assert.match(frontmatter[1], /^title: ".+"$/m);
    assert.match(frontmatter[1], /^description: ".+"$/m);
    assert.match(frontmatter[1], /^pubDate: "\d{4}-\d{2}-\d{2}"$/m);
    assert.match(frontmatter[1], /^series: "ee-system"$/m);
    assert.match(frontmatter[1], new RegExp(`^order: ${order}$`, 'm'));
    assert.match(frontmatter[1], /^tags: \[.+\]$/m);
    assert.match(frontmatter[1], /^draft: false$/m);

    const body = markdown.slice(frontmatter[0].length);
    assert.doesNotMatch(body, /^# /, `${file} must not repeat the frontmatter title as an H1`);
  });
});
