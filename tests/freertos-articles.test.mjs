import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const freertosDir = 'docs/articles/freertos';
const frameworkPath = join(freertosDir, 'freertos-kernel-framework.md');
const article1Name = 'freertos-01-source-reading-list-internals.md';
const article1Path = join(freertosDir, article1Name);
const article2Name = 'freertos-02-tcb-task-create-delete.md';
const article2Path = join(freertosDir, article2Name);
const article3Name = 'freertos-03-scheduler-tick-block-unblock.md';
const article3Path = join(freertosDir, article3Name);
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

test('freertos directory contains the framework and approved first sample only', () => {
  const files = readdirSync(freertosDir)
    .filter((file) => file.endsWith('.md'))
    .sort();

  assert.deepEqual(files, [article1Name, article2Name, article3Name, 'freertos-kernel-framework.md']);
});

test('freertos framework defines the approved 12-article sequence', () => {
  const markdown = readFileSync(frameworkPath, 'utf8');

  assert.match(markdown, /^series: freertos$/m);
  assert.match(markdown, /^order: 0$/m);
  assert.match(markdown, /^draft: true$/m);
  assert.match(markdown, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(markdown, /9b777ae5c5b8e9e456065a00294d1e5f5f9facf5/);

  const headings = [...markdown.matchAll(/^### \d+\. (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, expectedChapters);
});

test('freertos framework rejects the old quota-driven template', () => {
  const markdown = readFileSync(frameworkPath, 'utf8');

  assert.doesNotMatch(markdown, /800|1500|6～9|至少 \d+ 个 Mermaid|视觉点配额/);
  assert.doesNotMatch(markdown, /^(入口条件|执行动作|核心状态变化|可观察证据|验收记录模板)：/m);
  assert.match(markdown, /先完成第 1 篇样稿/);
  assert.match(markdown, /不再一次性批量生成/);
});

test('first FreeRTOS sample follows the source instead of a fixed article template', () => {
  assert.ok(existsSync(article1Path), `${article1Name} must exist`);
  const markdown = readFileSync(article1Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

  assert.match(markdown, /^title: "FreeRTOS 内核源码解读 01：源码阅读方法与 List_t\/ListItem_t"$/m);
  assert.match(markdown, /^series: freertos$/m);
  assert.match(markdown, /^order: 1$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.match(body, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(body, /9b777ae5c5b8e9e456065a00294d1e5f5f9facf5/);

  for (const symbol of [
    'struct xLIST_ITEM',
    'struct xMINI_LIST_ITEM',
    'typedef struct xLIST',
    'vListInitialise',
    'vListInitialiseItem',
    'vListInsertEnd',
    'vListInsert',
    'uxListRemove',
    'listGET_OWNER_OF_NEXT_ENTRY',
    'pxIndex',
    'pvOwner',
    'pxContainer',
    'portMAX_DELAY',
    'xListEnd.pxPrevious',
  ]) {
    assert.match(body, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing source concept: ${symbol}`);
  }

  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/include\/list\.h/);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/list\.c/);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/tasks\.c/);
  assert.match(body, /listINSERT_END[\s\S]+pxReadyTasksLists/);
  assert.match(body, /xTimeToWake[\s\S]+vListInsert/);
  assert.match(body, /configMAX_PRIORITIES[\s\S]+xEventListItem/);

  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据|停止条件)：/m);
  assert.doesNotMatch(body, /^\|/m);
  assert.doesNotMatch(body, /配置矩阵|证据表|阶段验收|面试表达|视觉点|800|1500/);
  assert.doesNotMatch(body, /STM32|Cortex-M|RISC-V|BASEPRI|PendSV|SysTick|EXC_RETURN/);
});
test('task lifecycle article follows TCB creation, publication, deletion, and ownership', () => {
  const markdown = readFileSync(article2Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

  assert.match(markdown, /^order: 2$/m);
  assert.match(markdown, /^draft: false$/m);
  for (const symbol of [
    'TCB_t', 'xTaskCreate', 'xTaskCreateStatic', 'prvCreateTask',
    'prvInitialiseNewTask', 'pxPortInitialiseStack',
    'prvAddNewTaskToReadyList', 'pxReadyTasksLists',
    'vTaskDelete', 'xTasksWaitingTermination',
    'prvCheckTasksWaitingTermination', 'prvDeleteTCB',
    'ucStaticallyAllocated',
  ]) {
    assert.match(body, new RegExp(symbol), `missing task lifecycle source concept: ${symbol}`);
  }
  assert.match(body, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/tasks\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
  assert.doesNotMatch(body, /Cortex-M|RISC-V|BASEPRI|PendSV|mstatus|mcause/);
});

test('scheduler article closes the ready, delayed, tick, and pending-ready paths', () => {
  const markdown = readFileSync(article3Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

  assert.match(markdown, /^order: 3$/m);
  assert.match(markdown, /^draft: false$/m);
  for (const symbol of [
    'pxReadyTasksLists', 'pxDelayedTaskList', 'pxOverflowDelayedTaskList',
    'xPendingReadyList', 'vTaskStartScheduler', 'xPortStartScheduler',
    'taskSELECT_HIGHEST_PRIORITY_TASK', 'vTaskSwitchContext',
    'vTaskDelay', 'xTaskDelayUntil', 'prvAddCurrentTaskToDelayedList',
    'xTaskIncrementTick', 'xNextTaskUnblockTime',
    'configUSE_TIME_SLICING', 'xTaskResumeAll',
  ]) {
    assert.match(body, new RegExp(symbol), `missing scheduler source concept: ${symbol}`);
  }
  assert.match(body, /FreeRTOS-Kernel V11\.3\.0/);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/tasks\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
  assert.doesNotMatch(body, /Cortex-M|RISC-V|BASEPRI|PendSV|mstatus|mcause/);
});
test('article prose allows long technical identifiers to wrap on narrow screens', () => {
  const globalCss = readFileSync('src/styles/global.css', 'utf8');

  assert.doesNotMatch(globalCss, /\.prose\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(globalCss, /\.prose :where\(p, li, blockquote\)\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

test('mobile article reading is not occluded by the floating back-to-top button', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');

  assert.match(siteLayout, /id="back-to-top" class="[^"]*\bhidden\b[^"]*\bsm:flex\b/);
});

test('freertos remains registered as a first-class site series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /freertos/);
  assert.match(seriesConfig, /freertos:\s*\{/);
  assert.match(seriesConfig, /href: '\/freertos\/'/);
  assert.match(articlesLib, /value === 'freertos'/);
});