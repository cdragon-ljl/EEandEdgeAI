import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = 'scripts/validate-article-mermaid.mjs';

test('Mermaid validator accepts valid blocks and reports invalid source blocks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'article-mermaid-'));

  try {
    const valid = join(directory, 'valid.md');
    writeFileSync(valid, '```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n');
    const validRun = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(validRun.status, 0, validRun.stderr);
    assert.match(validRun.stdout, /1 Mermaid block/);

    const invalid = join(directory, 'invalid.md');
    writeFileSync(invalid, '```mermaid\nflowchart LR\n  A -- broken\n```\n');
    const invalidRun = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.notEqual(invalidRun.status, 0);
    assert.match(invalidRun.stderr, /invalid\.md/);
    assert.match(invalidRun.stderr, /block 1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
