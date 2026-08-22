# FPGA Foundations First Five Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register FPGA as a first-class site series and publish five progressive long-form foundation articles covering hardware execution, digital logic, FSMs, FPGA resources and introductory Verilog.

**Architecture:** The framework file remains a draft planning artifact excluded from Astro content loading. Five independent Markdown articles use `series: fpga`, while central series metadata owns routing and the optimized `1921×819` WebP cover. Node tests enforce registration, article order, depth, diagrams, redlines and the executable Verilog lab contract.

**Tech Stack:** Astro 4 content collections, Markdown, Mermaid, Node test runner, WebP, Verilog-2001, Icarus Verilog, GTKWave, GitHub Pages.

---

## File Map

- Modify `src/content/config.ts`: register `fpga` and exclude `fpga-xc7z020-framework.md`.
- Modify `src/lib/series.ts`: add FPGA metadata between RISC-V and Zephyr.
- Modify `src/lib/articles.ts`: recognize `fpga` as a valid series ID.
- Modify `docs/articles/fpga/fpga-xc7z020-framework.md`: add draft frontmatter without changing the planning body.
- Create `public/covers/fpga.webp`: optimized cover derived from local `covers/fpga.png`.
- Create `docs/articles/fpga/fpga-01-why-embedded-engineers-learn-fpga.md`.
- Create `docs/articles/fpga/fpga-02-combinational-sequential-logic-registers.md`.
- Create `docs/articles/fpga/fpga-03-fsm-hardware-control.md`.
- Create `docs/articles/fpga/fpga-04-resources-lut-ff-bram-dsp-clock-io.md`.
- Create `docs/articles/fpga/fpga-05-verilog-module-wire-reg-always-assign.md`.
- Modify `tests/site-content-config.test.mjs`: update canonical series lists and add FPGA registration/content assertions.
- Modify `tests/series-covers.test.mjs`: require the FPGA cover and intrinsic dimensions.
- Create `tests/fpga-articles.test.mjs`: enforce long-form, diagrams, heading limits, redlines and FPGA-05 lab content.

### Task 1: Define the FPGA publication contract

**Files:**
- Modify: `tests/site-content-config.test.mjs`
- Modify: `tests/series-covers.test.mjs`
- Create: `tests/fpga-articles.test.mjs`

- [ ] **Step 1: Update expected series registration and add FPGA tests**

Use this canonical order everywhere:

```js
['cuda', 'ee-system', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'usb', 'pcie', 'video-audio']
```

Add a test that requires `fpga` in the loader, schema, type union, metadata registry, order list and type guard. Require explicit exclusion of `fpga-xc7z020-framework.md`.

- [ ] **Step 2: Add the FPGA cover expectation**

Extend the cover map:

```js
fpga: [1921, 819],
```

- [ ] **Step 3: Create the article quality tests**

The test reads the five exact filenames and asserts:

```js
assert.equal(files.length, 6); // five articles plus one framework file
assert.match(markdown, /^series: fpga$/m);
assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
assert.match(markdown, /^draft: false$/m);
assert.ok(markdown.split(/\r?\n/).length >= 350);
assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5);
const h2Count = (markdown.match(/^## /gm) ?? []).length;
assert.ok(h2Count >= 6 && h2Count <= 9);
```

Reject draft-process and preview language with a focused pattern that does not flag legitimate words such as “等待状态”:

```js
const forbidden = /让我想想|记错了|Hmm|草稿内容|Part [ABC]|下一篇|下一章|预告|FPGA-\d{2}/i;
assert.doesNotMatch(body, forbidden);
```

FPGA-05 must contain `module`, `assign`, `always`, both `=` and `<=`, a self-checking testbench using `$fatal` or an equivalent failure path, `iverilog`, `vvp` and `gtkwave`.

- [ ] **Step 4: Run focused tests and verify RED**

```powershell
node --test tests/site-content-config.test.mjs tests/series-covers.test.mjs tests/fpga-articles.test.mjs
```

Expected: failures identify missing FPGA registration, cover and article files.

### Task 2: Register the FPGA series and framework

**Files:**
- Modify: `src/content/config.ts`
- Modify: `src/lib/series.ts`
- Modify: `src/lib/articles.ts`
- Modify: `docs/articles/fpga/fpga-xc7z020-framework.md`
- Create: `public/covers/fpga.webp`

- [ ] **Step 1: Generate the WebP cover**

Use the installed `baoyu-compress-image` workflow at quality 80 with `--keep`, then move only `fpga.webp` into `public/covers`. Preserve `covers/fpga.png` locally under the root-only ignore rule.

- [ ] **Step 2: Register the collection and exclude the framework**

Update the glob to include `fpga` and exclude both framework filenames:

```ts
loader: glob({
  pattern: '{cuda,ee-system,rknn,riscv,fpga,zephyr,bsp,usb,pcie,video-audio}/**/!(riscv-architecture-framework|fpga-xc7z020-framework).md',
  base: './docs/articles',
}),
```

Add `fpga` to the schema enum.

- [ ] **Step 3: Add central FPGA metadata**

```ts
fpga: {
  id: 'fpga',
  title: 'FPGA 与芯片原型验证实战',
  shortTitle: 'FPGA / Zynq',
  description: '从数字逻辑、RTL 与 Zynq PS/PL，到 AXI、Linux 驱动访问 PL 和硬件加速器原型。',
  accent: 'cyan',
  href: '/fpga/',
  label: '硬件原型',
  cover: { src: '/covers/fpga.webp', width: 1921, height: 819, alt: 'FPGA 与芯片原型验证实战系列封面' },
},
```

Add `fpga` after `riscv` in `SeriesId`, `SERIES_ORDER` and `isSeriesId`.

- [ ] **Step 4: Add draft frontmatter to the planning file**

```yaml
---
title: "FPGA 与芯片原型验证实战系列框架"
description: "基于 xc7z020，规划从数字逻辑与 RTL 到 Zynq PS/PL、Linux 驱动和加速器原型的完整学习路径。"
pubDate: "2026-08-22"
series: fpga
order: 0
tags: ["FPGA", "Zynq-7000", "xc7z020", "RTL", "芯片原型验证"]
draft: true
---
```

- [ ] **Step 5: Run registration and cover tests**

Run the focused command from Task 1. Expected: registration and cover tests pass; article tests fail only because the five articles are absent.

### Task 3: Write FPGA-01

**Files:**
- Create: `docs/articles/fpga/fpga-01-why-embedded-engineers-learn-fpga.md`

- [ ] **Step 1: Research primary sources**

Use AMD Zynq-7000 TRM/product documentation for PS/PL and AXI facts. Do not introduce board-specific values.

- [ ] **Step 2: Write the article**

Frontmatter:

```yaml
title: "嵌入式知识体系 · FPGA 与芯片原型验证实战 #01 · 为什么嵌入式软件工程师要学 FPGA"
series: fpga
order: 1
draft: false
```

Use 6–8 H2 sections and at least five meaningful diagrams. Develop one chain from sequential software execution to spatial hardware, then connect registers, IRQ, DMA, AXI, Linux drivers and a minimal accelerator prototype.

- [ ] **Step 3: Verify the article contract**

```powershell
node --test tests/fpga-articles.test.mjs
```

Expected: FPGA-01 assertions pass; remaining files are still reported missing.

- [ ] **Step 4: Commit FPGA-01**

```powershell
git add docs/articles/fpga/fpga-01-why-embedded-engineers-learn-fpga.md
git commit -m "docs(fpga): explain hardware execution model"
```

### Task 4: Write FPGA-02

**Files:**
- Create: `docs/articles/fpga/fpga-02-combinational-sequential-logic-registers.md`

- [ ] **Step 1: Research primary sources**

Use AMD 7 Series CLB documentation and clocking/synthesis guides for flip-flop, timing and synchronizer boundaries. Avoid numeric timing claims that depend on speed grade.

- [ ] **Step 2: Write the article**

Frontmatter order is 2. Build from truth tables and muxes to D flip-flops, registers, reset, setup/hold, metastability and two-stage synchronization. Include truth tables, timing traces and a CDC risk exercise.

- [ ] **Step 3: Run FPGA article tests**

Expected: FPGA-01 and FPGA-02 pass their individual quality checks.

- [ ] **Step 4: Commit FPGA-02**

```powershell
git add docs/articles/fpga/fpga-02-combinational-sequential-logic-registers.md
git commit -m "docs(fpga): teach digital logic and timing"
```

### Task 5: Write FPGA-03

**Files:**
- Create: `docs/articles/fpga/fpga-03-fsm-hardware-control.md`

- [ ] **Step 1: Research primary sources**

Use AMD Vivado synthesis guidance for state-machine coding and recovery behavior. Separate language-independent FSM design from syntax introduced later.

- [ ] **Step 2: Write the article**

Frontmatter order is 3. Use one accelerator controller with `IDLE`, `LOAD`, `EXECUTE`, `WRITEBACK`, `DONE` and `ERROR` throughout. Include a state table, Mermaid state diagram, cycle trace, invalid-state recovery and output pulse analysis.

- [ ] **Step 3: Run FPGA article tests**

Expected: the first three articles pass.

- [ ] **Step 4: Commit FPGA-03**

```powershell
git add docs/articles/fpga/fpga-03-fsm-hardware-control.md
git commit -m "docs(fpga): build hardware control with FSMs"
```

### Task 6: Write FPGA-04

**Files:**
- Create: `docs/articles/fpga/fpga-04-resources-lut-ff-bram-dsp-clock-io.md`

- [ ] **Step 1: Research primary sources**

Use AMD 7 Series CLB, Memory Resources, DSP48E1, Clocking, SelectIO and xc7z020 data-sheet documentation. Cite all exact device-resource numbers.

- [ ] **Step 2: Write the article**

Frontmatter order is 4. Map an example streaming accelerator onto LUT, FF, BRAM, DSP, clock and IO resources. Explain why utilization and timing must be reviewed together and distinguish on-chip memory from DDR.

- [ ] **Step 3: Run FPGA article tests**

Expected: the first four articles pass.

- [ ] **Step 4: Commit FPGA-04**

```powershell
git add docs/articles/fpga/fpga-04-resources-lut-ff-bram-dsp-clock-io.md
git commit -m "docs(fpga): map RTL onto FPGA resources"
```

### Task 7: Write FPGA-05

**Files:**
- Create: `docs/articles/fpga/fpga-05-verilog-module-wire-reg-always-assign.md`

- [ ] **Step 1: Research language and tool behavior**

Use AMD Vivado synthesis guidance plus official Icarus Verilog and GTKWave documentation. Keep code within portable Verilog-2001 unless SystemVerilog is explicitly marked.

- [ ] **Step 2: Write synthesizable examples and a self-checking testbench**

Frontmatter order is 5. Include a combinational mux, parameterized counter, LED divider/top module and self-checking testbench. Show blocking vs non-blocking behavior and distinguish synthesizable RTL from simulation-only constructs.

- [ ] **Step 3: Verify the command-line lab**

The article must provide:

```bash
iverilog -g2005-sv -o build/led_tb rtl/counter.v rtl/led_blink.v tb/led_blink_tb.v
vvp build/led_tb
gtkwave build/led_blink.vcd
```

If Icarus Verilog is installed locally, extract the article code into `.tmp/fpga-05-lab` and run it. If unavailable, validate syntax with another installed Verilog parser and state the limitation.

- [ ] **Step 4: Run FPGA article tests**

Expected: all five article tests pass, including lab-content checks.

- [ ] **Step 5: Commit FPGA-05**

```powershell
git add docs/articles/fpga/fpga-05-verilog-module-wire-reg-always-assign.md
git commit -m "docs(fpga): add first Verilog simulation lab"
```

### Task 8: Full verification and handoff

**Files:**
- Verify all files above.

- [ ] **Step 1: Run redline and structural checks**

```powershell
rg -n "让我想想|记错了|Hmm|草稿内容|Part [ABC]|下一篇|下一章|预告|FPGA-[0-9]{2}" docs/articles/fpga/fpga-0*.md
node --test tests/fpga-articles.test.mjs tests/site-content-config.test.mjs tests/series-covers.test.mjs
```

Expected: `rg` returns no matches; focused tests pass.

- [ ] **Step 2: Run the full test suite and production build**

```powershell
npm test
npm run build
```

Expected: zero test failures, zero Astro diagnostics and generated `/fpga/` plus five article pages.

- [ ] **Step 3: Inspect desktop and mobile pages**

Check the homepage FPGA cover card, `/fpga/`, FPGA-01 and FPGA-05 at 1440px and 390px. Verify no image distortion, no horizontal overflow, readable code and rendered Mermaid diagrams.

- [ ] **Step 4: Audit Git scope**

```powershell
git diff --check
git status --short
```

Expected: only FPGA framework, five articles, cover, registration, tests and this plan are present.

- [ ] **Step 5: Commit integration and tests**

```powershell
git add public/covers/fpga.webp src/content/config.ts src/lib/series.ts src/lib/articles.ts tests/site-content-config.test.mjs tests/series-covers.test.mjs tests/fpga-articles.test.mjs docs/articles/fpga/fpga-xc7z020-framework.md docs/superpowers/plans/2026-08-22-fpga-foundations-first-five.md
git commit -m "feat: publish FPGA foundations series"
```

Do not push unless the user explicitly requests deployment in a later instruction.
