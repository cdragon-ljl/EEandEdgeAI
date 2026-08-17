# RISC-V Register and Assembly Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish article 03 of the RISC-V series, connecting RV64 integer registers and psABI calling rules to GNU assembly and observable QEMU/GDB behavior.

**Architecture:** The article follows the project created in articles 01 and 02. It starts with architectural registers, separates ABI register roles from hardware register numbers, then uses a small assembly/C call boundary and GDB inspection commands to connect source syntax to machine state. Astro discovers the Markdown entry through the existing RISC-V collection, so no routing code changes are required.

**Tech Stack:** Astro content collection, Markdown, Mermaid, RISC-V unprivileged ISA, RISC-V psABI, GNU assembler syntax, QEMU virt, GDB, Node.js test runner.

---

### Task 1: Define the article 03 published-content contract

**Files:**
- Modify: `tests/site-content-config.test.mjs`
- Create: `docs/articles/riscv/qemu-riscv-03-register-assembly.md`

- [x] **Step 1: Write the failing test**

Add this test after the article 02 assertion:

```js
test('the third RISC-V article explains registers and assembly at the ABI boundary', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-03-register-assembly.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #03 · RISC-V 寄存器架构与汇编语法"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 3$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5, 'article should include explanatory diagrams');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: the new test fails with `ENOENT` because article 03 does not yet exist.

- [x] **Step 3: Author the article**

Create `docs/articles/riscv/qemu-riscv-03-register-assembly.md` with this frontmatter:

```yaml
---
title: "嵌入式知识体系 · RISC-V 架构精讲 #03 · RISC-V 寄存器架构与汇编语法"
description: "结合 RV64 整数寄存器、psABI 调用约定与 GNU 汇编伪指令，在 QEMU/GDB 中看懂函数调用、栈帧和反汇编。"
pubDate: "2026-08-17"
series: riscv
order: 3
tags: ["RISC-V", "RV64", "汇编", "寄存器", "psABI", "GDB"]
draft: false
---
```

Write at least 300 lines in the preceding article style. Cover: the `x0` through `x31` integer register file and program counter; why ABI aliases are conventions rather than extra hardware; caller-saved and callee-saved responsibilities; a stack-frame example with `sp`, `ra`, `s0/fp`, and `a0`; GNU assembler labels, directives, comments, and pseudoinstructions; expansion-sensitive `li`, `la`, `call`, and `ret` examples; C/assembly linkage; `objdump` and GDB commands that inspect register values and control flow; troubleshooting and acceptance checklists. Include at least five Mermaid diagrams, an ASCII register-role view, authoritative official links, exercises, and the series tag line.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all tests pass, including the new article 03 contract.

- [x] **Step 5: Commit**

The user requested direct edits in the shared workspace. Do not stage or commit unrelated changes; leave the authored file and its validation test available for review.

### Task 2: Validate generated publication output

**Files:**
- Verify: `dist/riscv/qemu-riscv-03-register-assembly/index.html`

- [x] **Step 1: Build the static site**

Run: `npm run build`

Expected: Astro reports zero diagnostics and emits `/riscv/qemu-riscv-03-register-assembly/index.html`.

- [x] **Step 2: Inspect generated article content**

Run:

```powershell
rg -n "RISC-V 寄存器架构与汇编语法|RISC-V 架构精讲|data-language=\"mermaid\"" "dist\riscv\qemu-riscv-03-register-assembly\index.html"
```

Expected: generated HTML contains the title, RISC-V series label, and Mermaid blocks.

- [x] **Step 3: Scan for unfinished prose**

Run:

```powershell
rg -n '等等|让我|不对|记错|Hmm|草稿|思考|Part A|Part B|Part C|下一篇|下一章|预告|后续' "docs\articles\riscv\qemu-riscv-03-register-assembly.md"
```

Expected: no matches.

- [x] **Step 4: Commit**

The user requested direct edits in the shared workspace. Do not stage or commit unrelated changes; leave the validated changes available for review.
