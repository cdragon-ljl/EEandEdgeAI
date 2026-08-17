# RISC-V QEMU CMake Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish article 02 of the RISC-V series, teaching a reusable CMake build workflow for the RV64 QEMU virt bare-metal lab.

**Architecture:** Extend the working project established in article 01. The article separates toolchain selection, target-local compile/link options, generated inspection artifacts, and QEMU launch commands, so readers can see which CMake responsibility owns each build action. The existing site discovers the new Markdown entry through the RISC-V article collection; no route code changes are required.

**Tech Stack:** Astro content collection, Markdown, Mermaid, CMake, RISC-V GNU cross toolchain, QEMU virt, Node.js test runner.

---

### Task 1: Define article 02 as a published content contract

**Files:**
- Modify: `tests/site-content-config.test.mjs`
- Create: `docs/articles/riscv/qemu-riscv-02-cmake-build-system.md`

- [x] **Step 1: Write the failing test**

Add this test after the article 01 assertion:

```js
test('the second RISC-V article covers an engineering CMake build workflow', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-02-cmake-build-system.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^title: "嵌入式知识体系 · RISC-V 架构精讲 #02 · CMake 构建系统：工程化构建管理"$/m);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 2$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split('\n').length >= 300, 'article should be long-form');
  assert.ok((markdown.match(/^```mermaid$/gm) || []).length >= 5, 'article should include explanatory diagrams');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: the new test fails with `ENOENT` because article 02 does not yet exist.

- [x] **Step 3: Author the article**

Create `docs/articles/riscv/qemu-riscv-02-cmake-build-system.md` with this frontmatter:

```yaml
---
title: "嵌入式知识体系 · RISC-V 架构精讲 #02 · CMake 构建系统：工程化构建管理"
description: "把 RV64 QEMU 裸机实验拆成可复用的工具链、目标、构建选项和产物检查流程，建立可扩展的 CMake 工程骨架。"
pubDate: "2026-08-16"
series: riscv
order: 2
tags: ["RISC-V", "QEMU", "CMake", "交叉编译", "裸机", "ELF"]
draft: false
---
```

Write at least 300 lines in the same long-form style as article 01. Cover these concrete units: CMake config/generate/build stages; `toolchain-riscv.cmake` and `CMAKE_TRY_COMPILE_TARGET_TYPE`; a target-based `CMakeLists.txt`; build profiles and cache variables; `POST_BUILD` commands that produce `objdump` and `size` artifacts; a QEMU `run` target that carries explicit machine, RAM and BIOS settings; an inspection and troubleshooting checklist. Include at least five Mermaid diagrams, runnable CMake/shell snippets, authoritative documentation links, exercises, acceptance criteria, and the series tag line.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all tests pass, including the new article 02 contract.

- [x] **Step 5: Commit**

This workspace is shared and the user requested direct, uncommitted edits. Do not stage or commit unrelated changes; retain the changed files for the user to review.

### Task 2: Validate generated site output

**Files:**
- Verify: `dist/riscv/qemu-riscv-02-cmake-build-system/index.html`

- [x] **Step 1: Build the static site**

Run: `npm run build`

Expected: Astro reports zero diagnostics and emits `/riscv/qemu-riscv-02-cmake-build-system/index.html`.

- [x] **Step 2: Inspect generated article metadata and diagrams**

Run:

```powershell
rg -n "CMake 构建系统：工程化构建管理|RISC-V 架构精讲|data-language=\"mermaid\"" "dist\riscv\qemu-riscv-02-cmake-build-system\index.html"
```

Expected: generated HTML contains the article title, the RISC-V series label, and Mermaid code blocks.

- [x] **Step 3: Scan for unfinished prose**

Run:

```powershell
rg -n '等等|让我|不对|记错|Hmm|草稿|思考|Part A|Part B|Part C|下一篇|下一章|预告|后续' "docs\articles\riscv\qemu-riscv-02-cmake-build-system.md"
```

Expected: no matches.

- [x] **Step 4: Commit**

This workspace is shared and the user requested direct, uncommitted edits. Do not stage or commit unrelated changes; retain the validated changes for the user to review.
