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
  ['fpga-06-sequential-logic-reset-clock-counter-register-bank.md', 6],
  ['fpga-07-combinational-logic-case-if-mux-latch.md', 7],
  ['fpga-08-systemverilog-logic-interface-always-ff-comb.md', 8],
  ['fpga-09-testbench-clock-reset-stimulus-self-check.md', 9],
  ['fpga-10-waveform-debug-gtkwave-vivado-simulator.md', 10],
  ['fpga-11-xc7z020-zynq-ps-pl-architecture.md', 11],
  ['fpga-12-vivado-project-rtl-constraints-synthesis.md', 12],
  ['fpga-13-xdc-pins-clocks-io-timing.md', 13],
  ['fpga-14-vivado-block-design-zynq-system.md', 14],
  ['fpga-15-ps-gpio-emio-pl-led.md', 15],
  ['fpga-16-axi-lite-stream-full-basics.md', 16],
  ['fpga-17-axi-lite-register-ip.md', 17],
  ['fpga-18-mmio-volatile-driver-access.md', 18],
  ['fpga-19-pl-interrupt-ps-gic.md', 19],
  ['fpga-20-axi-stream-fifo-backpressure.md', 20],
  ['fpga-21-axi-dma-ps-pl-data-path.md', 21],
  ['fpga-22-baremetal-to-linux-pl-device.md', 22],
  ['fpga-23-device-tree-pl-reg-interrupt-reserved-memory.md', 23],
  ['fpga-24-uio-userspace-mmio-interrupt.md', 24],
  ['fpga-25-char-driver-pl-ip-ioctl-poll.md', 25],
  ['fpga-26-linux-dma-pl-accelerator.md', 26],
  ['fpga-27-accelerator-task-submission-model.md', 27],
  ['fpga-28-vector-add-accelerator-linux.md', 28],
  ['fpga-29-convolution-filter-line-buffer.md', 29],
  ['fpga-30-performance-counters-profiling.md', 30],
  ['fpga-31-npu-gpu-driver-runtime-model.md', 31],
  ['fpga-32-ila-online-hardware-debug.md', 32],
  ['fpga-33-testbench-assertion-regression.md', 33],
  ['fpga-34-fpga-prototype-pre-post-silicon-bringup.md', 34],
  ['fpga-35-xc7z020-ai-accelerator-project.md', 35],
  ['fpga-36-portfolio-chip-software-npu-driver.md', 36],
];

test('fpga series contains 36 articles plus its framework', () => {
  const files = readdirSync(fpgaDir).filter((file) => file.endsWith('.md'));
  assert.equal(files.length, 37);
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
test('board-facing Vivado articles remain board-neutral', () => {
  for (const [file] of articles.filter(([, order]) => order >= 11 && order <= 15)) {
    const path = join(fpgaDir, file);
    assert.ok(existsSync(path), `${file} must exist`);
    const body = readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

    assert.match(body, /<(?:PART|BOARD_PART|LED_PORT|CLOCK_PORT)>|板卡中立|当前板卡核实/);
    assert.doesNotMatch(body, /set_property\s+PACKAGE_PIN\s+(?!<)[A-Za-z0-9_]+/);
  }
});

test('each remaining batch covers its engineering contract', () => {
  const batches = [
    [6, 10, /always|testbench|waveform|波形/],
    [11, 15, /Vivado|XDC|Zynq|EMIO/],
    [16, 21, /AXI|valid|ready|DMA/],
    [22, 26, /device tree|设备树|platform_driver|dma_/],
    [27, 31, /accelerator|加速器|Runtime|profil/i],
    [32, 36, /ILA|assert|prototype|bring-up|作品集/i],
  ];

  for (const [start, end, contract] of batches) {
    for (const [file] of articles.filter(([, order]) => order >= start && order <= end)) {
      const path = join(fpgaDir, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.match(readFileSync(path, 'utf8'), contract, `${file} must satisfy its batch contract`);
    }
  }
});

test('accelerator articles do not claim fabricated benchmark speedups', () => {
  for (const [file] of articles.filter(([, order]) => order >= 27 && order <= 35)) {
    const path = join(fpgaDir, file);
    assert.ok(existsSync(path), `${file} must exist`);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /提升\s*\d+(?:\.\d+)?\s*倍/);
  }
});
