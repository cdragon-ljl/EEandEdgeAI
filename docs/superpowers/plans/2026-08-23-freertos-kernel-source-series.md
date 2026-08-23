# FreeRTOS Kernel Source Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a 15-article, source-driven FreeRTOS-Kernel V11.3.0 learning series with platform-neutral kernel analysis, Cortex-M4 and RISC-V port deep dives, and three engineering interview guides.

**Architecture:** Register `freertos` as a first-class site series, add one draft framework and 15 ordered Markdown articles under `docs/articles/freertos`, and enforce the publication contract with a dedicated Node test. Research is performed against a local ignored clone of the exact V11.3.0 tag; articles cite fixed-tag permalinks and explain execution chains rather than reproducing whole source files.

**Tech Stack:** Astro content collections, Markdown, Mermaid, Node test runner, FreeRTOS-Kernel V11.3.0, Git, Playwright/Edge for local rendering checks.

---

## File Map

**Create:**

- `docs/articles/freertos/freertos-kernel-framework.md`
- `docs/articles/freertos/freertos-01-kernel-source-map-config.md`
- `docs/articles/freertos/freertos-02-list-tcb-task-creation.md`
- `docs/articles/freertos/freertos-03-scheduler-tick-task-lifecycle.md`
- `docs/articles/freertos/freertos-04-cortex-m4-port-context-switch.md`
- `docs/articles/freertos/freertos-05-riscv-port-trap-context-switch.md`
- `docs/articles/freertos/freertos-06-queue-send-receive-isr.md`
- `docs/articles/freertos/freertos-07-semaphore-mutex-priority-inheritance.md`
- `docs/articles/freertos/freertos-08-task-notification-event-group-queue-set.md`
- `docs/articles/freertos/freertos-09-stream-message-buffer-software-timer.md`
- `docs/articles/freertos/freertos-10-memory-management-heap-one-to-five.md`
- `docs/articles/freertos/freertos-11-reliability-tickless-trace-debug.md`
- `docs/articles/freertos/freertos-12-mpu-smp-kernel-observability.md`
- `docs/articles/freertos/freertos-13-interview-task-scheduler-context-switch.md`
- `docs/articles/freertos/freertos-14-interview-ipc-synchronization-memory.md`
- `docs/articles/freertos/freertos-15-interview-porting-reliability-system-design.md`
- `tests/freertos-articles.test.mjs`
- `public/covers/freertos.webp`

**Modify:**

- `src/content/config.ts`
- `src/lib/series.ts`
- `src/lib/articles.ts`

## Common Article Contract

Every published article must satisfy all of the following:

- frontmatter title `嵌入式知识体系 · FreeRTOS 内核源码解读 #NN · ...`;
- `series: freertos`, contiguous `order`, and `draft: false`;
- normally 800-1500 lines, with a hard test floor of 700 lines;
- 6-9 H2 sections;
- at least 3 Mermaid blocks and at least 5 total visual points when hidden `IMAGE_PROMPT` comments are included;
- explicit `FreeRTOS-Kernel V11.3.0` scope;
- at least two complete call-chain sections and four annotated source excerpts;
- `源码索引`, `配置矩阵`, `阶段验收`, and `面试表达` sections;
- fixed-tag official FreeRTOS GitHub links;
- no ASCII diagrams, board pins, HAL/CubeMX steps, invented runtime output, or benchmark claims;
- no draft reasoning, article-number cross references, or next-article previews.

The interview articles additionally require at least eight numbered scenario questions, each with `场景`, `源码落点`, `详细回答`, `错误回答`, and `追问`.

### Task 1: Pin and inspect the upstream source

**Files:**
- Read: `.tmp/FreeRTOS-Kernel/**`
- Reference: `docs/superpowers/specs/2026-08-23-freertos-kernel-source-series-design.md`

- [ ] **Step 1: Clone the exact source tag into ignored workspace storage**

Run:

```powershell
git clone --depth 1 --branch V11.3.0 https://github.com/FreeRTOS/FreeRTOS-Kernel.git .tmp/FreeRTOS-Kernel
```

Expected: `.tmp/FreeRTOS-Kernel/tasks.c`, `queue.c`, `list.c`, `timers.c`, `event_groups.c`, `stream_buffer.c`, `portable/GCC/ARM_CM4F`, and `portable/GCC/RISC-V` exist.

- [ ] **Step 2: Verify the tag and source inventory**

Run:

```powershell
git -C .tmp/FreeRTOS-Kernel describe --tags --exact-match
rg -n "typedef struct tskTaskControlBlock|typedef struct QueueDefinition|xTaskIncrementTick|vTaskSwitchContext" .tmp/FreeRTOS-Kernel
```

Expected: tag is `V11.3.0`; each core symbol resolves to the pinned source.

- [ ] **Step 3: Record research notes outside the published article tree**

Use `.tmp/freertos-source-index.md` to record exact files, functions, config guards, and permalink line anchors for all 15 articles. Do not commit the clone or temporary notes.

### Task 2: Add the failing publication contract

**Files:**
- Create: `tests/freertos-articles.test.mjs`

- [ ] **Step 1: Write the exact article manifest**

Define all 15 filenames and orders from the File Map. Assert that `docs/articles/freertos` contains 16 Markdown files: 15 published articles plus one draft framework.

- [ ] **Step 2: Add common quality assertions**

For each article, parse frontmatter and body and assert:

```js
assert.ok(lines >= 700);
assert.ok(h2Count >= 6 && h2Count <= 9);
assert.ok(mermaidCount >= 3);
assert.ok(mermaidCount + imagePromptCount >= 5);
assert.match(markdown, /^series: freertos$/m);
assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
assert.match(markdown, /^draft: false$/m);
assert.match(body, /FreeRTOS-Kernel V11\.3\.0/);
assert.match(body, /源码索引/);
assert.match(body, /配置矩阵/);
assert.match(body, /阶段验收/);
assert.match(body, /面试表达/);
```

Reject forbidden process text and platform coupling in common-kernel articles.

- [ ] **Step 3: Add topic-specific assertions**

Require article 04 to contain `SVC`, `PendSV`, `SysTick`, `BASEPRI`, `EXC_RETURN`, and FPU context. Require article 05 to contain `trap`, `CSR`, `portASM.S`, stack context, and Tick source. Require articles 13-15 to contain at least eight `### 问题 N` headings plus `场景`, `源码落点`, `详细回答`, `错误回答`, and `追问`.

- [ ] **Step 4: Run RED**

Run:

```powershell
node --test tests/freertos-articles.test.mjs
```

Expected: failures report the missing `freertos` directory and article files.

- [ ] **Step 5: Commit the test contract**

Commit only `tests/freertos-articles.test.mjs` with message:

```text
test(freertos): define kernel source series contract
```

### Task 3: Register the FreeRTOS site series and cover

**Files:**
- Modify: `src/content/config.ts`
- Modify: `src/lib/series.ts`
- Modify: `src/lib/articles.ts`
- Create: `public/covers/freertos.webp`

- [ ] **Step 1: Extend the content schema**

Add `freertos` to the article glob, Zod series enum, `SeriesId`, `isSeriesId`, and `SERIES_ORDER`. Place it after `ee-system` and before `riscv`.

- [ ] **Step 2: Add series metadata**

Use:

```ts
freertos: {
  id: 'freertos',
  title: 'FreeRTOS 内核源码解读',
  shortTitle: 'FreeRTOS',
  description: '沿真实调用链拆解任务、调度、通信、同步、内存管理与 Cortex-M4/RISC-V 移植层。',
  accent: 'rose',
  href: '/freertos/',
  label: 'RTOS 内核',
  cover: { src: '/covers/freertos.webp', width: 1920, height: 820, alt: 'FreeRTOS 内核源码解读系列封面' },
}
```

- [ ] **Step 3: Create an original cover**

Generate a 1920x820 WebP cover with a restrained red/cyan technical palette, showing an abstract scheduler timeline, linked task control blocks, and a CPU context stack. Do not copy the FreeRTOS logo or include tiny explanatory text.

- [ ] **Step 4: Run site tests**

Run `npm test`. Expected: existing tests pass; FreeRTOS article tests still fail only because content files are missing.

- [ ] **Step 5: Commit site registration**

Commit the four exact files with message:

```text
feat: register FreeRTOS kernel source series
```

### Task 4: Create the draft framework

**Files:**
- Create: `docs/articles/freertos/freertos-kernel-framework.md`

- [ ] **Step 1: Write frontmatter**

Use `series: freertos`, `order: 0`, and `draft: true` with the title and description from the approved design.

- [ ] **Step 2: Transfer the approved content design**

Include the audience, V11.3.0 boundary, platform-neutral rule, eight technical stages, 15 filenames, source excerpt rules, Mermaid/IMAGE_PROMPT rules, article contract, and red-line scan.

- [ ] **Step 3: Commit the framework**

Commit only the framework with message:

```text
docs(freertos): add kernel source series framework
```

### Task 5: Write articles 01-03 - source map, task creation, scheduler

**Files:**
- Create: `docs/articles/freertos/freertos-01-kernel-source-map-config.md`
- Create: `docs/articles/freertos/freertos-02-list-tcb-task-creation.md`
- Create: `docs/articles/freertos/freertos-03-scheduler-tick-task-lifecycle.md`

- [ ] **Step 1: Build exact source indexes**

Read `FreeRTOS.h`, `list.h/list.c`, `task.h/tasks.c`, and every referenced config guard. Record fixed-tag permalinks before writing prose.

- [ ] **Step 2: Write all three long-form articles**

Follow the approved per-article content, preserving one continuous execution chain per article. Article 02 must trace list mutations and task creation. Article 03 must trace scheduler start, Tick, delayed-list swap, unblock, switch, delete, and Idle cleanup.

- [ ] **Step 3: Verify the batch**

Run the FreeRTOS test and the forbidden-phrase scan. Expected: articles 01-03 pass; failures remain only for 04-15 and total count.

- [ ] **Step 4: Commit**

Commit exactly the three articles with message:

```text
docs(freertos): explain task creation and scheduler core
```

### Task 6: Write articles 04-05 - Cortex-M4 and RISC-V ports

**Files:**
- Create: `docs/articles/freertos/freertos-04-cortex-m4-port-context-switch.md`
- Create: `docs/articles/freertos/freertos-05-riscv-port-trap-context-switch.md`

- [ ] **Step 1: Research both official ports and architecture manuals**

Trace stack initialization, first-task start, interrupt/trap entry, Tick, context save/restore, interrupt masks, and return path. Keep platform timer setup interfaces separate from architecture-defined behavior.

- [ ] **Step 2: Write both port articles**

Include annotated assembly excerpts, stack-frame diagrams, at least one hidden illustration prompt per architecture, and a shared port-contract comparison table.

- [ ] **Step 3: Verify and commit**

Run the topic-specific tests, then commit exactly both files with message:

```text
docs(freertos): dissect Cortex-M4 and RISC-V ports
```

### Task 7: Write articles 06-08 - communication and synchronization

**Files:**
- Create: `docs/articles/freertos/freertos-06-queue-send-receive-isr.md`
- Create: `docs/articles/freertos/freertos-07-semaphore-mutex-priority-inheritance.md`
- Create: `docs/articles/freertos/freertos-08-task-notification-event-group-queue-set.md`

- [ ] **Step 1: Index queue and synchronization source paths**

Read `queue.c`, `semphr.h`, relevant `tasks.c` notification helpers, `event_groups.c`, and queue-set branches under their exact config guards.

- [ ] **Step 2: Write the three articles**

Article 06 traces full/empty blocking and `cTxLock/cRxLock`. Article 07 proves priority inheritance and its limits from source. Article 08 compares notification, event-group, and queue-set memory and wake-up paths.

- [ ] **Step 3: Verify and commit**

Run tests and commit the three exact files with message:

```text
docs(freertos): explain IPC and synchronization internals
```

### Task 8: Write articles 09-12 - buffers, timers, memory, reliability, MPU/SMP

**Files:**
- Create: `docs/articles/freertos/freertos-09-stream-message-buffer-software-timer.md`
- Create: `docs/articles/freertos/freertos-10-memory-management-heap-one-to-five.md`
- Create: `docs/articles/freertos/freertos-11-reliability-tickless-trace-debug.md`
- Create: `docs/articles/freertos/freertos-12-mpu-smp-kernel-observability.md`

- [ ] **Step 1: Index remaining source files**

Read `stream_buffer.c`, `timers.c`, `portable/MemMang/heap_1.c` through `heap_5.c`, tickless hooks, trace hooks, MPU wrappers, and `configNUMBER_OF_CORES` branches.

- [ ] **Step 2: Write the four articles**

Keep article 09's stream and timer execution chains separate inside one narrative. Deep-dive heap_4 and heap_5 in article 10. Use evidence-first failure diagnosis in article 11. Keep MPU and SMP as explicit extensions to the single-core model in article 12.

- [ ] **Step 3: Verify and commit**

Run tests and commit exactly four files with message:

```text
docs(freertos): cover memory reliability and advanced kernel paths
```

### Task 9: Write articles 13-15 - engineering interview guides

**Files:**
- Create: `docs/articles/freertos/freertos-13-interview-task-scheduler-context-switch.md`
- Create: `docs/articles/freertos/freertos-14-interview-ipc-synchronization-memory.md`
- Create: `docs/articles/freertos/freertos-15-interview-porting-reliability-system-design.md`

- [ ] **Step 1: Build the question matrix**

Use the eight approved scenarios per article. Map every question to a source file, structure/function, configuration guard, practical symptom, correct answer, common wrong answer, and follow-up.

- [ ] **Step 2: Write detailed answers**

Do not repeat glossary definitions. Each answer must explain why the observed behavior occurs, how to prove it from source or trace evidence, and what engineering decision follows.

- [ ] **Step 3: Verify and commit**

Run the interview-specific tests and commit exactly the three files with message:

```text
docs(freertos): add source-driven interview guides
```

### Task 10: Full verification and rendering QA

**Files:**
- Verify all files above

- [ ] **Step 1: Run content and red-line checks**

Run:

```powershell
node --test tests/freertos-articles.test.mjs
npm test
rg -n "让我想想|记错了|Hmm|草稿内容|下一篇|下一章|预告|FREERTOS-[0-9]{2}" docs/articles/freertos -g "freertos-[0-9][0-9]-*.md"
```

Expected: tests pass; `rg` exits 1 with no matches.

- [ ] **Step 2: Run production build**

Run `npm run build`. Expected: Astro diagnostics report zero errors, zero warnings, and zero hints; all 15 routes and cover are generated.

- [ ] **Step 3: Run browser QA**

Start preview and inspect `/freertos/`, articles 02, 04, 05, 10, 12, and 15 at 1440x900 and 390x844. Assert HTTP 200, no console errors, no document overflow, and every Mermaid block becomes a non-empty SVG.

- [ ] **Step 4: Review repository boundaries**

Confirm no unrelated Zephyr or `ee-system` files are staged. Commit any final FreeRTOS-only test cleanup with message:

```text
test(freertos): enforce complete source series
```
