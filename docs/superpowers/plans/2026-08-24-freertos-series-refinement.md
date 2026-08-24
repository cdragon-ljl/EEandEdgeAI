# FreeRTOS Series Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen all 12 FreeRTOS source articles for readers who know basic APIs but have never read the kernel.

**Architecture:** Preserve the approved article sequence and V11.3.0 source baseline. Refine articles in dependency order so each batch can reuse concepts established by the previous batch, while unique contract tests protect source coverage and reject the old quota-driven template.

**Tech Stack:** Markdown, Mermaid, FreeRTOS-Kernel V11.3.0 source permalinks, Node test runner, Astro.

---

### Task 1: Strengthen Series Contracts

**Files:**
- Modify: `tests/freertos-articles.test.mjs`
- Modify: `docs/articles/freertos/freertos-kernel-framework.md`

- [ ] Add unique refinement markers to each article contract: concrete value walkthroughs, configuration boundaries, failure branches and debugger-visible fields. Markers must be article-specific rather than generic length or heading quotas.
- [ ] Add framework language that defines the reader as a basic API user and requires a continuous scenario without imposing repeated section names.
- [ ] Run `node --test tests\freertos-articles.test.mjs` and confirm the new article markers fail before content changes.
- [ ] Commit with `test(freertos): define beginner source guide contracts`.

### Task 2: Refine Container, Task and Scheduler Foundations

**Files:**
- Modify: `docs/articles/freertos/freertos-01-source-reading-list-internals.md`
- Modify: `docs/articles/freertos/freertos-02-tcb-task-create-delete.md`
- Modify: `docs/articles/freertos/freertos-03-scheduler-tick-block-unblock.md`

- [ ] In article 01, add a three-node numeric list walkthrough covering sentinel, stable ordering, `pxIndex`, owner/container and removal.
- [ ] In article 02, trace one created task from API parameters through allocation, stack units, TCB initialization, publication, self-delete and Idle cleanup; include allocation failure rollback and debugger fields.
- [ ] In article 03, trace three tasks through ready selection, delay, event wait, Tick expiry, wrap and pending-ready movement; explain bitmap and time slicing configuration boundaries.
- [ ] Run the focused FreeRTOS tests, inspect headings for continuous prose, and commit with `docs(freertos): deepen task and scheduler foundations`.

### Task 3: Refine Cortex-M4 and RISC-V Ports

**Files:**
- Modify: `docs/articles/freertos/freertos-04-cortex-m4-port-context-switch.md`
- Modify: `docs/articles/freertos/freertos-05-riscv-port-trap-context.md`

- [ ] In article 04, add exception-frame prerequisites, explicit PSP values, first-task SVC flow, PendSV register ownership, FPU branch and BASEPRI priority examples.
- [ ] In article 05, add ABI/CSR prerequisites, slot-by-slot context layout, initial `mstatus/mepc`, trap/ISR stack transition, ecall/timer return-address examples and extension save/restore rules.
- [ ] Run focused tests and commit with `docs(freertos): deepen portable context switch guides`.

### Task 4: Refine Communication and Synchronization

**Files:**
- Modify: `docs/articles/freertos/freertos-06-queue-isr-queue-set.md`
- Modify: `docs/articles/freertos/freertos-07-semaphore-mutex-priority-inheritance.md`
- Modify: `docs/articles/freertos/freertos-08-task-notification-event-group.md`

- [ ] In article 06, add queue creation memory layout, concrete ring addresses, lost-wakeup window, queue-lock settlement, ISR yield and Queue Set capacity walkthrough.
- [ ] In article 07, add semaphore count/ownership comparison, a three-task inversion timeline, inheritance/disinherit field changes, nested-mutex limits and debugger evidence.
- [ ] In article 08, add notification slot state transitions for every `eNotifyAction`, a wait race walkthrough, Event Group control-bit encoding, multi-waiter clear behavior and daemon queue failure.
- [ ] Run focused tests and commit with `docs(freertos): deepen communication and synchronization guides`.

### Task 5: Refine Buffers, Timers and Memory

**Files:**
- Modify: `docs/articles/freertos/freertos-09-stream-message-buffer.md`
- Modify: `docs/articles/freertos/freertos-10-software-timer-daemon.md`
- Modify: `docs/articles/freertos/freertos-11-static-allocation-heap-one-to-five.md`

- [ ] In article 09, add ring-space arithmetic with wrap, stream partial writes, message atomicity, trigger-level wakeups, single-reader/writer reasoning and ISR callback behavior.
- [ ] In article 10, add daemon startup, command queue capacity, concrete Tick/list placement, auto-reload catch-up, callback serialization and pended-call failure paths.
- [ ] In article 11, add object ownership, alignment/header calculations, concrete block transformations for heap_1 through heap_5, fragmentation diagnostics and allocator selection boundaries.
- [ ] Run focused tests and commit with `docs(freertos): deepen buffer timer and memory guides`.

### Task 6: Refine Engineering Interview and Verify Site

**Files:**
- Modify: `docs/articles/freertos/freertos-12-source-engineering-interview.md`
- Test: `tests/freertos-articles.test.mjs`

- [ ] Expand each interview answer from mechanism to source evidence, incorrect reasoning and field debugging; add scenarios for timeout races, queue lock, nested mutexes, timer daemon congestion and heap fragmentation.
- [ ] Scan all 12 articles for fixed-template remnants and floating `main` source links.
- [ ] Run `npm test`, `node node_modules\astro\astro.js check`, and `npm run build`; require zero failures and all 12 routes.
- [ ] Inspect representative desktop/mobile pages for long identifiers, code blocks and Mermaid overflow.
- [ ] Commit with `docs(freertos): refine complete kernel source series`, merge to `main`, push, wait for GitHub Pages, and verify the series and final article return HTTP 200.
