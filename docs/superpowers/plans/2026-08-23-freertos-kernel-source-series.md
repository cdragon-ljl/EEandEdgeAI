# FreeRTOS Series Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除现有 15 篇 FreeRTOS 文章，只保留并重写系列框架，使仓库进入经过测试的 12 篇新规划状态。

**Architecture:** 不回退整个 Git 历史，也不修改站点注册、封面或导航。先把测试从“15 篇已发布文章合同”改成“仅有一个 draft 框架且规划 12 篇”的合同，确认测试因旧文章仍存在而失败；随后精确删除 15 个文件、重写框架并让测试转绿，最后用全站测试和生产构建验证空系列可正常部署。

**Tech Stack:** Markdown、Node.js `node:test`、Astro、Git。

---

## File Structure

- Delete: `docs/articles/freertos/freertos-01-kernel-source-map-config.md`
- Delete: `docs/articles/freertos/freertos-02-list-tcb-task-creation.md`
- Delete: `docs/articles/freertos/freertos-03-scheduler-tick-task-lifecycle.md`
- Delete: `docs/articles/freertos/freertos-04-cortex-m4-port-context-switch.md`
- Delete: `docs/articles/freertos/freertos-05-riscv-port-trap-context-switch.md`
- Delete: `docs/articles/freertos/freertos-06-queue-send-receive-isr.md`
- Delete: `docs/articles/freertos/freertos-07-semaphore-mutex-priority-inheritance.md`
- Delete: `docs/articles/freertos/freertos-08-task-notification-event-group-queue-set.md`
- Delete: `docs/articles/freertos/freertos-09-stream-message-buffer-software-timer.md`
- Delete: `docs/articles/freertos/freertos-10-memory-management-heap-one-to-five.md`
- Delete: `docs/articles/freertos/freertos-11-reliability-tickless-trace-debug.md`
- Delete: `docs/articles/freertos/freertos-12-mpu-smp-kernel-observability.md`
- Delete: `docs/articles/freertos/freertos-13-interview-task-scheduler-context-switch.md`
- Delete: `docs/articles/freertos/freertos-14-interview-ipc-synchronization-memory.md`
- Delete: `docs/articles/freertos/freertos-15-interview-porting-reliability-system-design.md`
- Modify: `docs/articles/freertos/freertos-kernel-framework.md` - 保存唯一的用户可见系列规划。
- Modify: `tests/freertos-articles.test.mjs` - 验证清空状态、12 篇规划和站点注册。
- Modify: `docs/superpowers/plans/2026-08-23-freertos-kernel-source-series.md` - 本实施计划。

站点注册、封面、`src/layouts/SiteLayout.astro` 和 `src/styles/global.css` 不在本次修改范围内。

### Task 1: Lock the planning-only state with tests

**Files:**
- Modify: `tests/freertos-articles.test.mjs`
- Test: `tests/freertos-articles.test.mjs`

- [ ] **Step 1: Replace the published-article contract with the planning contract**

保留站点注册、长标识符换行和移动端按钮测试，删除所有针对 15 篇旧文章的文件名、篇数、源码片段和面试题断言。加入以下核心断言：

```js
const expectedChapters = [
  '源码阅读方法与 List_t/ListItem_t',
  'TCB、任务创建与删除',
  '调度器、Tick、阻塞与唤醒',
  'Cortex-M4 移植与上下文切换',
  'RISC-V 移植与 trap 上下文',
  'Queue、ISR 路径与 Queue Set',
  '信号量、互斥锁与优先级继承',
  '任务通知与 Event Group',
  'Stream Buffer 与 Message Buffer',
  '软件定时器与 Timer daemon',
  '静态分配与 heap_1 到 heap_5',
  '源码与工程面试专题',
];

test('freertos directory contains only the draft framework', () => {
  const files = readdirSync(freertosDir).filter((file) => file.endsWith('.md'));
  assert.deepEqual(files, ['freertos-kernel-framework.md']);
});

test('freertos framework defines the approved 12-article sequence', () => {
  const markdown = readFileSync(join(freertosDir, 'freertos-kernel-framework.md'), 'utf8');
  assert.match(markdown, /^series: freertos$/m);
  assert.match(markdown, /^order: 0$/m);
  assert.match(markdown, /^draft: true$/m);
  assert.match(markdown, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(markdown, /9b777ae5c5b8e9e456065a00294d1e5f5f9facf5/);

  const headings = [...markdown.matchAll(/^### \d+\. (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, expectedChapters);
});

test('freertos framework rejects the old quota-driven template', () => {
  const markdown = readFileSync(join(freertosDir, 'freertos-kernel-framework.md'), 'utf8');
  assert.doesNotMatch(markdown, /800|1500|6～9|至少 \d+ 个 Mermaid|视觉点配额/);
  assert.doesNotMatch(markdown, /入口条件|执行动作|核心状态变化|可观察证据|验收记录模板/);
  assert.match(markdown, /先完成第 1 篇样稿/);
  assert.match(markdown, /不再一次性批量生成/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests\freertos-articles.test.mjs
```

Expected: FAIL because the directory still contains 15 published files and the old framework still declares the 15-article quota-driven structure.

- [ ] **Step 3: Commit the failing contract only after Task 2 is ready to implement**

Do not create a standalone red commit. Keep the failing test staged only with the deletion and framework rewrite in Task 2 so the repository history remains buildable.

### Task 2: Delete the old articles and rewrite the framework

**Files:**
- Delete: the 15 exact article paths listed in File Structure
- Modify: `docs/articles/freertos/freertos-kernel-framework.md`
- Test: `tests/freertos-articles.test.mjs`

- [ ] **Step 1: Delete exactly the 15 published files**

Use `git rm` with the explicit file paths. Do not delete the directory recursively and do not remove `freertos-kernel-framework.md`.

- [ ] **Step 2: Replace the framework with the approved outline**

The framework must keep draft frontmatter and contain these sections in this order:

```markdown
---
title: "FreeRTOS 内核源码解读系列规划"
description: "固定 FreeRTOS-Kernel V11.3.0，沿真实执行链重新规划任务、调度、移植、通信、同步、定时与内存管理源码解读。"
pubDate: "2026-08-23"
series: freertos
order: 0
tags: ["FreeRTOS", "Kernel", "Source Code", "RTOS"]
draft: true
---

# FreeRTOS 内核源码解读系列规划

## 系列目标

本系列从公开入口进入源码，持续跟踪函数调用、对象所有权和状态变化，直到一个机制完整闭合。它不是 API 百科，不绑定开发板，也不使用固定表格模板凑篇幅。

## 源码基线

FreeRTOS-Kernel V11.3.0，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。

## 学习顺序

### 1. 源码阅读方法与 List_t/ListItem_t
### 2. TCB、任务创建与删除
### 3. 调度器、Tick、阻塞与唤醒
### 4. Cortex-M4 移植与上下文切换
### 5. RISC-V 移植与 trap 上下文
### 6. Queue、ISR 路径与 Queue Set
### 7. 信号量、互斥锁与优先级继承
### 8. 任务通知与 Event Group
### 9. Stream Buffer 与 Message Buffer
### 10. 软件定时器与 Timer daemon
### 11. 静态分配与 heap_1 到 heap_5
### 12. 源码与工程面试专题

## 写作原则

不规定篇幅、标题数、源码片段数或 Mermaid 数量。每篇只回答一个中心问题，沿真实调用链连续解释；表格只用于真实横向比较，图只在文字无法清楚表达关系时使用。

## 实施顺序

先完成第 1 篇样稿并由用户确认，再逐篇继续。不再一次性批量生成整套文章。
```

在十二个标题下补充设计文档中已经批准的中心问题和主要源码，但不加入旧的固定章节配额。

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests\freertos-articles.test.mjs
```

Expected: all FreeRTOS tests pass; the directory contains exactly one Markdown file.

- [ ] **Step 4: Check the deletion boundary**

Run:

```powershell
rg --files docs\articles\freertos
```

Expected:

```text
docs\articles\freertos\freertos-kernel-framework.md
```

### Task 3: Verify the empty published series and commit

**Files:**
- Verify: all files changed in Tasks 1-2

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Build the production site**

Run:

```powershell
npm run build
```

Expected: Astro diagnostics report zero errors. The FreeRTOS series page builds with no published articles, while the framework remains excluded because `draft: true`.

- [ ] **Step 3: Check whitespace and scope**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the 15 deletions, framework rewrite, FreeRTOS test rewrite and this plan are part of this work. Existing BSP、Zephyr、ee-system modifications remain unstaged and unchanged.

- [ ] **Step 4: Commit the reset**

```powershell
git add docs\articles\freertos tests\freertos-articles.test.mjs docs\superpowers\plans\2026-08-23-freertos-kernel-source-series.md
git commit -m "docs(freertos): reset series to approved outline"
```

Do not push. Do not begin the first article in this commit.