# FPGA Remaining Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and publish FPGA-06 through FPGA-36 as six progressive, board-neutral learning batches.

**Architecture:** Extend the existing FPGA content contract to all 36 published articles, then create each remaining batch in framework order. Every article is an independent Markdown content entry, while batch-specific tests enforce the expected RTL, Vivado, AXI, Linux, accelerator or verification evidence without inventing board values or hardware results.

**Tech Stack:** Markdown, Mermaid, Astro content collections, Node test runner, Verilog/SystemVerilog examples, Vivado Tcl/XDC templates, Linux driver API examples, Git.

---

## Task 1: Extend the FPGA-06～36 publication contract

**Files:**
- Modify: `tests/fpga-articles.test.mjs`

- [ ] **Step 1: Add exact filenames and contiguous orders**

Extend the `articles` array with these files and orders:

```text
06 fpga-06-sequential-logic-reset-clock-counter-register-bank.md
07 fpga-07-combinational-logic-case-if-mux-latch.md
08 fpga-08-systemverilog-logic-interface-always-ff-comb.md
09 fpga-09-testbench-clock-reset-stimulus-self-check.md
10 fpga-10-waveform-debug-gtkwave-vivado-simulator.md
11 fpga-11-xc7z020-zynq-ps-pl-architecture.md
12 fpga-12-vivado-project-rtl-constraints-synthesis.md
13 fpga-13-xdc-pins-clocks-io-timing.md
14 fpga-14-vivado-block-design-zynq-system.md
15 fpga-15-ps-gpio-emio-pl-led.md
16 fpga-16-axi-lite-stream-full-basics.md
17 fpga-17-axi-lite-register-ip.md
18 fpga-18-mmio-volatile-driver-access.md
19 fpga-19-pl-interrupt-ps-gic.md
20 fpga-20-axi-stream-fifo-backpressure.md
21 fpga-21-axi-dma-ps-pl-data-path.md
22 fpga-22-baremetal-to-linux-pl-device.md
23 fpga-23-device-tree-pl-reg-interrupt-reserved-memory.md
24 fpga-24-uio-userspace-mmio-interrupt.md
25 fpga-25-char-driver-pl-ip-ioctl-poll.md
26 fpga-26-linux-dma-pl-accelerator.md
27 fpga-27-accelerator-task-submission-model.md
28 fpga-28-vector-add-accelerator-linux.md
29 fpga-29-convolution-filter-line-buffer.md
30 fpga-30-performance-counters-profiling.md
31 fpga-31-npu-gpu-driver-runtime-model.md
32 fpga-32-ila-online-hardware-debug.md
33 fpga-33-testbench-assertion-regression.md
34 fpga-34-fpga-prototype-pre-post-silicon-bringup.md
35 fpga-35-xc7z020-ai-accelerator-project.md
36 fpga-36-portfolio-chip-software-npu-driver.md
```

Change the directory count assertion to 37 Markdown files: 36 published articles plus one framework.

- [ ] **Step 2: Preserve the common long-form contract**

For every article require:

```js
assert.ok(lines >= 350);
assert.ok(mermaidCount >= 5);
assert.ok(h2Count >= 6 && h2Count <= 9);
assert.match(markdown, /^series: fpga$/m);
assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
assert.match(markdown, /^draft: false$/m);
assert.match(body, /阶段验收/);
assert.match(body, /面试/);
```

- [ ] **Step 3: Add board-neutral and batch-specific assertions**

Require articles 11～15 to contain `<PART>`/`<BOARD_PART>` or explicit board-discovery language and reject hardcoded `PACKAGE_PIN` assignments that do not use placeholders.

Require batch keyword sets:

```js
const batchContracts = [
  [[6, 10], /always|testbench|waveform|波形/],
  [[11, 15], /Vivado|XDC|Zynq|EMIO/],
  [[16, 21], /AXI|valid|ready|DMA/],
  [[22, 26], /device tree|设备树|platform_driver|dma_/],
  [[27, 31], /accelerator|加速器|Runtime|profil/],
  [[32, 36], /ILA|assert|prototype|bring-up|作品集/],
];
```

Reject unqualified benchmark claims such as `/提升\s*\d+(\.\d+)?\s*倍/` in articles 27～35.

- [ ] **Step 4: Run RED**

```powershell
node --test tests/fpga-articles.test.mjs
```

Expected: FPGA-01～05 pass and FPGA-06～36 fail because files are missing.

## Task 2: Complete FPGA-06～10 — RTL and simulation

**Files:**
- Create: `docs/articles/fpga/fpga-06-sequential-logic-reset-clock-counter-register-bank.md`
- Create: `docs/articles/fpga/fpga-07-combinational-logic-case-if-mux-latch.md`
- Create: `docs/articles/fpga/fpga-08-systemverilog-logic-interface-always-ff-comb.md`
- Create: `docs/articles/fpga/fpga-09-testbench-clock-reset-stimulus-self-check.md`
- Create: `docs/articles/fpga/fpga-10-waveform-debug-gtkwave-vivado-simulator.md`

- [ ] **Step 1: Research official language/tool behavior**

Use AMD UG901/UG900 plus official Icarus, Verilator and GTKWave documentation. Do not claim local simulation because the current environment has no HDL simulator.

- [ ] **Step 2: Write FPGA-06 and FPGA-07**

FPGA-06 uses one register-bank/counter example for synchronous/asynchronous reset, enable, single-driver ownership and register access types.

FPGA-07 uses one opcode decoder/data selector for complete combinational assignment, priority, `case`, mux inference, latch prevention and path depth.

- [ ] **Step 3: Write FPGA-08～10**

FPGA-08 introduces SystemVerilog only where it improves intent: `logic`, `always_ff`, `always_comb`, `enum`, packed `struct`, modport/interface boundary.

FPGA-09 builds a self-checking testbench with clock/reset, tasks, reference model, timeout, pass/fail and waveform dump.

FPGA-10 debugs one ready/valid pipeline through GTKWave/Vivado Simulator signal groups, cursors, trigger conditions and software-log alignment.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-06-*.md docs/articles/fpga/fpga-07-*.md docs/articles/fpga/fpga-08-*.md docs/articles/fpga/fpga-09-*.md docs/articles/fpga/fpga-10-*.md
git commit -m "docs(fpga): complete RTL and simulation stage"
```

## Task 3: Complete FPGA-11～15 — Vivado and xc7z020

**Files:**
- Create: `docs/articles/fpga/fpga-11-xc7z020-zynq-ps-pl-architecture.md`
- Create: `docs/articles/fpga/fpga-12-vivado-project-rtl-constraints-synthesis.md`
- Create: `docs/articles/fpga/fpga-13-xdc-pins-clocks-io-timing.md`
- Create: `docs/articles/fpga/fpga-14-vivado-block-design-zynq-system.md`
- Create: `docs/articles/fpga/fpga-15-ps-gpio-emio-pl-led.md`

- [ ] **Step 1: Research AMD primary documentation**

Use DS190, UG585, UG994, UG903, UG901 and current Vivado Tcl command references. Distinguish Zynq architecture facts from board-specific presets.

- [ ] **Step 2: Write FPGA-11～13**

FPGA-11 maps PS, PL, DDR, MIO, EMIO and GP/HP/ACP interfaces.

FPGA-12 creates a board-neutral RTL project with `<PART>`, source sets, XDC, synthesis, implementation, bitstream and report checks.

FPGA-13 teaches schematic-to-XDC discovery using `<CLOCK_PORT>`, `<LED_PORT>`, `PACKAGE_PIN`, `IOSTANDARD`, `create_clock`, input/output delay and unconstrained-path detection.

- [ ] **Step 3: Write FPGA-14～15**

FPGA-14 builds a ZYNQ7 block design with PS configuration, reset, AXI interconnect, address editor, wrapper and XSA export.

FPGA-15 traces PS GPIO through EMIO to a PL output and Baremetal control, with `<LED_PORT>` and board-specific verification steps.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-11-*.md docs/articles/fpga/fpga-12-*.md docs/articles/fpga/fpga-13-*.md docs/articles/fpga/fpga-14-*.md docs/articles/fpga/fpga-15-*.md
git commit -m "docs(fpga): complete Vivado and Zynq stage"
```

## Task 4: Complete FPGA-16～21 — AXI and custom IP

**Files:**
- Create: `docs/articles/fpga/fpga-16-axi-lite-stream-full-basics.md`
- Create: `docs/articles/fpga/fpga-17-axi-lite-register-ip.md`
- Create: `docs/articles/fpga/fpga-18-mmio-volatile-driver-access.md`
- Create: `docs/articles/fpga/fpga-19-pl-interrupt-ps-gic.md`
- Create: `docs/articles/fpga/fpga-20-axi-stream-fifo-backpressure.md`
- Create: `docs/articles/fpga/fpga-21-axi-dma-ps-pl-data-path.md`

- [ ] **Step 1: Research official AXI/IP documentation**

Use Arm AMBA AXI protocol material, AMD UG585 and AMD AXI DMA/AXI Stream infrastructure product guides. Keep AXI4, AXI4-Lite and AXI4-Stream semantics separate.

- [ ] **Step 2: Write FPGA-16～18**

FPGA-16 explains channels and independent ready/valid handshakes.

FPGA-17 implements a register map with control, status, input, output, version, byte enables and W1C semantics.

FPGA-18 connects the same register map to Baremetal `volatile` and Linux `ioremap/readl/writel`, including side effects and ordering.

- [ ] **Step 3: Write FPGA-19～21**

FPGA-19 follows PL IRQ through PS GIC to Baremetal/Linux handlers and status clear.

FPGA-20 implements stream FIFO behavior, TLAST/TKEEP and backpressure invariants.

FPGA-21 explains AXI DMA MM2S/S2MM, simple versus SG, buffer ownership, cache maintenance and recovery.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-16-*.md docs/articles/fpga/fpga-17-*.md docs/articles/fpga/fpga-18-*.md docs/articles/fpga/fpga-19-*.md docs/articles/fpga/fpga-20-*.md docs/articles/fpga/fpga-21-*.md
git commit -m "docs(fpga): complete AXI and custom IP stage"
```

## Task 5: Complete FPGA-22～26 — Linux access to PL

**Files:**
- Create: `docs/articles/fpga/fpga-22-baremetal-to-linux-pl-device.md`
- Create: `docs/articles/fpga/fpga-23-device-tree-pl-reg-interrupt-reserved-memory.md`
- Create: `docs/articles/fpga/fpga-24-uio-userspace-mmio-interrupt.md`
- Create: `docs/articles/fpga/fpga-25-char-driver-pl-ip-ioctl-poll.md`
- Create: `docs/articles/fpga/fpga-26-linux-dma-pl-accelerator.md`

- [ ] **Step 1: Research Linux primary documentation**

Use kernel driver model, platform device, UIO HOWTO, DMA API HOWTO, DMA attributes, reserved-memory/device-tree bindings and generic IRQ documentation.

- [ ] **Step 2: Write FPGA-22～24**

FPGA-22 moves a physical-address Baremetal flow into device tree and `platform_driver` ownership.

FPGA-23 provides placeholder-safe DTS nodes and explains address/interrupt cells, clocks, coherency and reserved memory.

FPGA-24 provides UIO mmap/interrupt pseudocode and security/lifecycle limits.

- [ ] **Step 3: Write FPGA-25～26**

FPGA-25 gives a driver skeleton with devm mapping, cdev/misc choice, ioctl ABI, poll, wait queue, IRQ and remove safety.

FPGA-26 separates coherent and streaming DMA, mapping directions, sync calls, CMA, SG, IOMMU and user-space buffer boundaries.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-22-*.md docs/articles/fpga/fpga-23-*.md docs/articles/fpga/fpga-24-*.md docs/articles/fpga/fpga-25-*.md docs/articles/fpga/fpga-26-*.md
git commit -m "docs(fpga): complete Linux PL driver stage"
```

## Task 6: Complete FPGA-27～31 — accelerator prototype

**Files:**
- Create: `docs/articles/fpga/fpga-27-accelerator-task-submission-model.md`
- Create: `docs/articles/fpga/fpga-28-vector-add-accelerator-linux.md`
- Create: `docs/articles/fpga/fpga-29-convolution-filter-line-buffer.md`
- Create: `docs/articles/fpga/fpga-30-performance-counters-profiling.md`
- Create: `docs/articles/fpga/fpga-31-npu-gpu-driver-runtime-model.md`

- [ ] **Step 1: Define a shared reference accelerator**

Use one task contract across all five articles: source/destination address, length, start, busy, done, error, IRQ enable/status and cycle/stall counters.

- [ ] **Step 2: Write FPGA-27～29**

FPGA-27 defines register/task/buffer ownership and recovery.

FPGA-28 maps vector addition from Runtime through driver/DMA to PL and back, with result-check and benchmark methodology.

FPGA-29 builds a 3×3 filter using line buffers, sliding window, fixed-point arithmetic and stream backpressure.

- [ ] **Step 3: Write FPGA-30～31**

FPGA-30 defines cycle/busy/stall/input-wait/output-wait counters and bottleneck attribution.

FPGA-31 maps the reference design to UMD/KMD/Runtime, command buffer, DMA buffer, IRQ, fence, mmap, ioctl and profiling concepts without claiming equivalence to a production GPU.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-27-*.md docs/articles/fpga/fpga-28-*.md docs/articles/fpga/fpga-29-*.md docs/articles/fpga/fpga-30-*.md docs/articles/fpga/fpga-31-*.md
git commit -m "docs(fpga): complete accelerator prototype stage"
```

## Task 7: Complete FPGA-32～36 — verification and portfolio

**Files:**
- Create: `docs/articles/fpga/fpga-32-ila-online-hardware-debug.md`
- Create: `docs/articles/fpga/fpga-33-testbench-assertion-regression.md`
- Create: `docs/articles/fpga/fpga-34-fpga-prototype-pre-post-silicon-bringup.md`
- Create: `docs/articles/fpga/fpga-35-xc7z020-ai-accelerator-project.md`
- Create: `docs/articles/fpga/fpga-36-portfolio-chip-software-npu-driver.md`

- [ ] **Step 1: Research official debug/verification guidance**

Use AMD ILA/Vivado debug documentation plus official simulator, Verilator/cocotb and CI documentation. Keep FPGA prototype, emulator and target silicon evidence distinct.

- [ ] **Step 2: Write FPGA-32～34**

FPGA-32 gives probe/trigger/capture planning and software timestamp correlation.

FPGA-33 builds directed tests, assertions, scoreboard/reference model, random boundaries and regression manifest.

FPGA-34 defines DE/DV/SW ownership and evidence transfer from simulation to prototype and silicon.

- [ ] **Step 3: Write FPGA-35～36**

FPGA-35 assembles the shared accelerator into a board-neutral end-to-end project with deliverables, stage gates and rollback.

FPGA-36 turns the work into README, architecture, register spec, ABI, test, performance and incident documentation plus interview narratives.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/fpga-articles.test.mjs
git add -- docs/articles/fpga/fpga-32-*.md docs/articles/fpga/fpga-33-*.md docs/articles/fpga/fpga-34-*.md docs/articles/fpga/fpga-35-*.md docs/articles/fpga/fpga-36-*.md
git commit -m "docs(fpga): complete verification and portfolio stage"
```

## Task 8: Full-series verification

**Files:**
- Modify: `tests/fpga-articles.test.mjs`
- Verify: `docs/articles/fpga/*.md`

- [ ] **Step 1: Run structural and redline checks**

```powershell
node --test tests/fpga-articles.test.mjs
rg -n "让我想想|记错了|Hmm|草稿内容|Part [ABC]|下一篇|下一章|预告|FPGA-[0-9]{2}" docs/articles/fpga -g 'fpga-[0-9][0-9]-*.md'
```

Expected: 36 article contracts pass and redline scan returns no matches in published bodies.

- [ ] **Step 2: Run all tests and build**

```powershell
npm test
npm run build
```

Expected: zero failures, zero Astro diagnostics, `/fpga/` plus 36 article routes and a completed Pagefind index.

- [ ] **Step 3: Visual QA**

Check `/fpga/`, one page from each batch and FPGA-35 at desktop/mobile widths. Confirm no horizontal page overflow and at least five rendered `.mermaid-diagram svg` elements per checked article.

- [ ] **Step 4: Audit and commit test expansion**

```powershell
git diff --check
git status --short
git add tests/fpga-articles.test.mjs docs/superpowers/plans/2026-08-22-fpga-remaining-series.md
git commit -m "test(fpga): enforce complete 36-article series"
```

Do not stage or modify concurrent `video-audio` changes. Do not push unless explicitly requested.
