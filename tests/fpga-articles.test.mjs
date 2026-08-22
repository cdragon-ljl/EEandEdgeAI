import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const fpgaDir = 'docs/articles/fpga';
const articles = [
  ['fpga-01-why-embedded-engineers-learn-fpga.md', 1],
  ['fpga-02-combinational-sequential-logic-registers.md', 2],
  ['fpga-03-fsm-hardware-control.md', 3],
  ['fpga-04-resources-lut-ff-bram-dsp-clock-io.md', 4],
  ['fpga-05-verilog-module-wire-reg-always-assign.md', 5],
];

test('fpga foundation batch contains five articles plus its framework', () => {
  const files = readdirSync(fpgaDir).filter((file) => file.endsWith('.md'));
  assert.equal(files.length, 6);
});

for (const [file, order] of articles) {
  test(`${file} meets the long-form learning-manual contract`, () => {
    const path = join(fpgaDir, file);
    assert.ok(existsSync(path), `${file} must exist`);
    const markdown = readFileSync(path, 'utf8');
    const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^series: fpga$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.ok(markdown.split(/\r?\n/).length >= 350, `${file} must contain at least 350 lines`);
    assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} must contain at least five Mermaid diagrams`);

    const h2Count = (markdown.match(/^## /gm) ?? []).length;
    assert.ok(h2Count >= 6 && h2Count <= 9, `${file} must use 6-9 progressive H2 sections, got ${h2Count}`);
    assert.doesNotMatch(body, /让我想想|记错了|Hmm|草稿内容|Part [ABC]|下一篇|下一章|预告|FPGA-\d{2}/i);
    assert.match(body, /阶段验收/);
    assert.match(body, /面试/);
  });
}

test('FPGA-05 includes a self-checking portable Verilog lab', () => {
  const path = join(fpgaDir, 'fpga-05-verilog-module-wire-reg-always-assign.md');
  assert.ok(existsSync(path), 'FPGA-05 article must exist');
  const markdown = readFileSync(path, 'utf8');

  assert.match(markdown, /\bmodule\b/);
  assert.match(markdown, /\bassign\b/);
  assert.match(markdown, /always\s*@/);
  assert.match(markdown, /\s=\s/);
  assert.match(markdown, /<=/);
  assert.match(markdown, /\$fatal|\$error/);
  assert.match(markdown, /iverilog/);
  assert.match(markdown, /\bvvp\b/);
  assert.match(markdown, /gtkwave/);
});
