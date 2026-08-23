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
const article4Name = 'freertos-04-cortex-m4-port-context-switch.md';
const article4Path = join(freertosDir, article4Name);
const article5Name = 'freertos-05-riscv-port-trap-context.md';
const article5Path = join(freertosDir, article5Name);
const article6Name = 'freertos-06-queue-isr-queue-set.md';
const article6Path = join(freertosDir, article6Name);
const article7Name = 'freertos-07-semaphore-mutex-priority-inheritance.md';
const article7Path = join(freertosDir, article7Name);
const article8Name = 'freertos-08-task-notification-event-group.md';
const article8Path = join(freertosDir, article8Name);
const article9Name = 'freertos-09-stream-message-buffer.md';
const article9Path = join(freertosDir, article9Name);
const article10Name = 'freertos-10-software-timer-daemon.md';
const article10Path = join(freertosDir, article10Name);
const article11Name = 'freertos-11-static-allocation-heap-one-to-five.md';
const article11Path = join(freertosDir, article11Name);
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

  assert.deepEqual(files, [article1Name, article2Name, article3Name, article4Name, article5Name, article6Name, article7Name, article8Name, article9Name, article10Name, article11Name, 'freertos-kernel-framework.md']);
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
test('Cortex-M4 port article follows initial frame, SVC, SysTick, and PendSV', () => {
  const markdown = readFileSync(article4Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

  assert.match(markdown, /^order: 4$/m);
  for (const symbol of [
    'pxPortInitialiseStack', 'portINITIAL_EXC_RETURN', 'prvPortStartFirstTask',
    'vPortSVCHandler', 'xPortSysTickHandler', 'xPortPendSVHandler',
    'vTaskSwitchContext', 'PSP', 'MSP', 'EXC_RETURN', 'BASEPRI',
    'configMAX_SYSCALL_INTERRUPT_PRIORITY', 'S16-S31',
    'vPortValidateInterruptPriority',
  ]) {
    assert.match(body, new RegExp(symbol), `missing Cortex-M4 port concept: ${symbol}`);
  }
  assert.match(body, /portable\/GCC\/ARM_CM4F\/port\.c/);
  assert.doesNotMatch(body, /STM32|CubeMX|HAL_/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
});

test('RISC-V port article follows context frame, trap dispatch, and restore', () => {
  const markdown = readFileSync(article5Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');

  assert.match(markdown, /^order: 5$/m);
  for (const symbol of [
    'portContext.h', 'portASM.S', 'pxPortInitialiseStack',
    'xPortStartFirstTask', 'freertos_risc_v_trap_handler',
    'portcontextSAVE_CONTEXT_INTERNAL', 'portcontextRESTORE_CONTEXT',
    'mstatus', 'mepc', 'mcause', 'ecall', 'mret',
    'xISRStackTop', 'vPortSetupTimerInterrupt',
    'configENABLE_FPU', 'configENABLE_VPU',
    'portasmADDITIONAL_CONTEXT_SIZE',
  ]) {
    assert.match(body, new RegExp(symbol), `missing RISC-V port concept: ${symbol}`);
  }
  assert.match(body, /portable\/GCC\/RISC-V\/portASM\.S/);
  assert.doesNotMatch(body, /开发板|SiFive|ESP32|Milk-V/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
});
test('Queue article closes task, ISR, lock, and Queue Set paths', () => {
  const markdown = readFileSync(article6Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 6$/m);
  for (const symbol of [
    'Queue_t', 'xQueueGenericSend', 'xQueueReceive', 'prvCopyDataToQueue',
    'vTaskPlaceOnEventList', 'prvLockQueue', 'prvUnlockQueue',
    'cTxLock', 'cRxLock', 'xQueueGenericSendFromISR',
    'pxHigherPriorityTaskWoken', 'xQueueCreateSet', 'xQueueAddToSet',
    'xQueueSelectFromSet', 'prvNotifyQueueSetContainer',
  ]) assert.match(body, new RegExp(symbol), `missing Queue concept: ${symbol}`);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/queue\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
});

test('mutex article closes holder, inheritance, timeout, and recursive paths', () => {
  const markdown = readFileSync(article7Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 7$/m);
  for (const symbol of [
    'xQueueSemaphoreTake', 'xMutexHolder', 'uxRecursiveCallCount',
    'uxMessagesWaiting', 'pvTaskIncrementMutexHeldCount',
    'xTaskPriorityInherit', 'xTaskPriorityDisinherit',
    'vTaskPriorityDisinheritAfterTimeout', 'uxMutexesHeld',
    'uxBasePriority', 'xQueueTakeMutexRecursive', 'xQueueGiveMutexRecursive',
  ]) assert.match(body, new RegExp(symbol), `missing mutex concept: ${symbol}`);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/(queue|tasks)\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
});

test('notification and Event Group article closes both wait and wake protocols', () => {
  const markdown = readFileSync(article8Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 8$/m);
  for (const symbol of [
    'ulNotifiedValue', 'ucNotifyState', 'ulTaskGenericNotifyTake',
    'xTaskGenericNotifyWait', 'xTaskGenericNotify',
    'xTaskGenericNotifyFromISR', 'taskWAITING_NOTIFICATION',
    'taskNOTIFICATION_RECEIVED', 'eSetValueWithoutOverwrite',
    'EventGroup_t', 'xEventGroupWaitBits', 'xEventGroupSetBits',
    'vTaskPlaceOnUnorderedEventList', 'uxBitsToClear',
    'eventUNBLOCKED_DUE_TO_BIT_SET', 'xTimerPendFunctionCallFromISR',
  ]) assert.match(body, new RegExp(symbol), `missing notification/event concept: ${symbol}`);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/(tasks|event_groups)\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
  assert.doesNotMatch(body, /^\|/m);
});
test('Stream and Message Buffer article preserves ring and message boundaries', () => {
  const markdown = readFileSync(article9Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 9$/m);
  for (const symbol of [
    'StreamBuffer_t', 'xHead', 'xTail', 'xTriggerLevelBytes',
    'xTaskWaitingToReceive', 'xTaskWaitingToSend',
    'xStreamBufferSend', 'xStreamBufferReceive',
    'prvWriteBytesToBuffer', 'prvReadBytesFromBuffer',
    'sbFLAGS_IS_MESSAGE_BUFFER', 'sbBYTES_TO_STORE_MESSAGE_LENGTH',
    'prvReadMessageFromBuffer', 'xStreamBufferNextMessageLengthBytes',
    'sbSEND_COMPLETED', 'sbRECEIVE_COMPLETED',
  ]) assert.match(body, new RegExp(symbol), `missing stream/message concept: ${symbol}`);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/stream_buffer\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
});

test('software timer article closes command, list, expiry, and callback paths', () => {
  const markdown = readFileSync(article10Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 10$/m);
  for (const symbol of [
    'Timer_t', 'xTimerQueue', 'xActiveTimerList1',
    'pxCurrentTimerList', 'pxOverflowTimerList',
    'xTimerGenericCommandFromTask', 'xTimerGenericCommandFromISR',
    'prvTimerTask', 'prvProcessTimerOrBlockTask',
    'prvInsertTimerInActiveList', 'prvProcessExpiredTimer',
    'prvProcessReceivedCommands', 'prvReloadTimer',
    'xTimerPendFunctionCall', 'tmrSTATUS_IS_AUTORELOAD',
  ]) assert.match(body, new RegExp(symbol), `missing software timer concept: ${symbol}`);
  assert.match(body, /github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\/timers\.c/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
});

test('memory article distinguishes all five heap contracts and statistics', () => {
  const markdown = readFileSync(article11Path, 'utf8');
  const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
  assert.match(markdown, /^order: 11$/m);
  for (const symbol of [
    'heap_1', 'heap_2', 'heap_3', 'heap_4', 'heap_5',
    'pvPortMalloc', 'vPortFree', 'BlockLink_t', 'prvHeapInit',
    'prvInsertBlockIntoFreeList', 'vPortDefineHeapRegions',
    'xPortGetFreeHeapSize', 'xPortGetMinimumEverFreeHeapSize',
    'vPortGetHeapStats', 'HeapStats', 'ucStaticallyAllocated',
  ]) assert.match(body, new RegExp(symbol), `missing heap concept: ${symbol}`);
  for (const heap of [1, 2, 3, 4, 5]) {
    assert.match(body, new RegExp(`portable/MemMang/heap_${heap}\\.c`), `missing heap_${heap} source link`);
  }
  assert.match(body, /heap_4[\s\S]+first sufficient/);
  assert.match(body, /heap_5[\s\S]+vPortDefineHeapRegions/);
  assert.doesNotMatch(body, /所有 heap[^\n。]*支持[^\n。]*vPortGetHeapStats|五种实现[^\n。]*统一[^\n。]*heap stats/);
  assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|可观察证据)：/m);
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
