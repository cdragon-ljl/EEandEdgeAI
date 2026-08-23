import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const freertosDir = 'docs/articles/freertos';
const articles = [
  ['freertos-01-kernel-source-map-config.md', 1],
  ['freertos-02-list-tcb-task-creation.md', 2],
  ['freertos-03-scheduler-tick-task-lifecycle.md', 3],
  ['freertos-04-cortex-m4-port-context-switch.md', 4],
  ['freertos-05-riscv-port-trap-context-switch.md', 5],
  ['freertos-06-queue-send-receive-isr.md', 6],
  ['freertos-07-semaphore-mutex-priority-inheritance.md', 7],
  ['freertos-08-task-notification-event-group-queue-set.md', 8],
  ['freertos-09-stream-message-buffer-software-timer.md', 9],
  ['freertos-10-memory-management-heap-one-to-five.md', 10],
  ['freertos-11-reliability-tickless-trace-debug.md', 11],
  ['freertos-12-mpu-smp-kernel-observability.md', 12],
  ['freertos-13-interview-task-scheduler-context-switch.md', 13],
  ['freertos-14-interview-ipc-synchronization-memory.md', 14],
  ['freertos-15-interview-porting-reliability-system-design.md', 15],
];

function readArticle(file) {
  const path = join(freertosDir, file);
  assert.ok(existsSync(path), `${file} must exist`);
  return readFileSync(path, 'utf8');
}

test('freertos series contains 15 articles plus its framework', () => {
  assert.ok(existsSync(freertosDir), 'FreeRTOS article directory must exist');
  const files = readdirSync(freertosDir).filter((file) => file.endsWith('.md'));
  assert.equal(files.length, 16);
});

for (const [file, order] of articles) {
  test(`${file} meets the source-driven long-form contract`, () => {
    const markdown = readArticle(file);
    const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
    const h2Count = (markdown.match(/^## /gm) ?? []).length;
    const mermaidCount = (markdown.match(/^```mermaid$/gm) ?? []).length;
    const imagePromptCount = (markdown.match(/<!-- IMAGE_PROMPT:/g) ?? []).length;
    const sourceMarkerCount = (markdown.match(/^> 源码位置：/gm) ?? []).length;
    const callChainCount = (markdown.match(/^### 调用链/gm) ?? []).length;
    const permalinkCount = (markdown.match(/github\.com\/FreeRTOS\/FreeRTOS-Kernel\/blob\/V11\.3\.0\//g) ?? []).length;

    assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
    assert.match(markdown, /^title: "嵌入式知识体系 · FreeRTOS 内核源码解读 #\d{2} · .+"$/m);
    assert.match(markdown, /^series: freertos$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.ok(h2Count >= 6 && h2Count <= 9, `${file} must use 6-9 H2 sections, got ${h2Count}`);
    assert.ok(mermaidCount >= 3, `${file} must contain at least three Mermaid diagrams`);
    assert.ok(mermaidCount + imagePromptCount >= 5, `${file} must contain at least five visual points`);
    assert.ok(sourceMarkerCount >= 4, `${file} must mark at least four source excerpts`);
    assert.ok(callChainCount >= 2, `${file} must explain at least two complete call chains`);
    assert.ok(permalinkCount >= 4, `${file} must cite at least four V11.3.0 source permalinks`);
    assert.match(body, /FreeRTOS-Kernel V11\.3\.0/);
    assert.match(body, /配置矩阵/);
    assert.match(body, /源码索引/);
    assert.match(body, /阶段验收/);
    assert.match(body, /面试表达/);
    assert.doesNotMatch(body, /让我想想|记错了|Hmm|草稿内容|Part [ABC]|下一篇|下一章|预告|FREERTOS-\d{2}/i);
    assert.doesNotMatch(body, /^(入口条件|执行动作|核心状态变化|离开这一步时必须成立|可观察证据|停止条件|角色|所有权|变化时机|观察方法|常见误读|进入时|本步读取|本步修改|并发边界|返回或转交)：/m);
    assert.doesNotMatch(body, /^\| 阶段 \| 前提与读取 \| 状态变化 \| 并发边界 \| 结果与证据 \|$/m);
    assert.doesNotMatch(body, /^## 1\. 问题边界、前置条件与验收证据$/m);

    if (order <= 12) {
      const experiment = body.match(/^### 实验步骤\r?\n([\s\S]*?)(?=^### 证据表$)/m)?.[1] ?? '';
      assert.ok((experiment.match(/^\d+\. \*\*/gm) ?? []).length >= 5, `${file} must provide concrete experiment steps`);
      assert.doesNotMatch(experiment, /^\| [^|]+ \|\s*\|\s*\|\s*\|$/m);
    }
  });
}

test('article prose allows long technical identifiers to wrap on narrow screens', () => {
  const globalCss = readFileSync('src/styles/global.css', 'utf8');

  assert.doesNotMatch(globalCss, /\.prose\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(globalCss, /\.prose :where\(p, li, blockquote\)\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

test('mobile article reading is not occluded by the floating back-to-top button', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');

  assert.match(siteLayout, /id="back-to-top" class="[^"]*\bhidden\b[^"]*\bsm:flex\b/);
});
test('common-kernel articles remain board and vendor neutral', () => {
  const commonOrders = new Set([1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 14]);

  for (const [file] of articles.filter(([, order]) => commonOrders.has(order))) {
    const body = readArticle(file).replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
    assert.doesNotMatch(body, /STM32F\d+|CubeMX|HAL_[A-Za-z0-9_]+|ARM_CM4F|Cortex-M|RISC-V|HardFault|BASEPRI|PendSV|SysTick|\bPSP\b|EXC_RETURN|\bmstatus\b|\bmcause\b|\bmepc\b/);
  }
});

test('Cortex-M4 port article covers the complete exception switch path', () => {
  const markdown = readArticle('freertos-04-cortex-m4-port-context-switch.md');

  for (const keyword of ['SVC', 'PendSV', 'SysTick', 'BASEPRI', 'EXC_RETURN', 'FPU', 'pxPortInitialiseStack']) {
    assert.match(markdown, new RegExp(keyword));
  }
});

test('RISC-V port article covers trap and context implementation', () => {
  const markdown = readArticle('freertos-05-riscv-port-trap-context-switch.md');

  for (const keyword of ['trap', 'CSR', 'portASM.S', 'portContext.h', 'Tick', '上下文保存']) {
    assert.match(markdown, new RegExp(keyword, 'i'));
  }
});

test('list insertion documents the portMAX_DELAY sentinel branch', () => {
  const markdown = readArticle('freertos-02-list-tcb-task-creation.md');

  assert.match(markdown, /xValueOfInsertion\s*==\s*portMAX_DELAY/);
  assert.match(markdown, /xListEnd\.pxPrevious/);
});

test('memory guide distinguishes heap initialization and statistics contracts', () => {
  const markdown = readArticle('freertos-10-memory-management-heap-one-to-five.md');

  assert.match(markdown, /heap_4[^\n]*prvHeapInit/);
  assert.match(markdown, /heap_5[^\n]*vPortDefineHeapRegions/);
  assert.match(markdown, /heap_1\/heap_2[^\n]*xPortGetFreeHeapSize/);
  assert.match(markdown, /heap_4\/heap_5[^\n]*vPortGetHeapStats/);
  assert.doesNotMatch(markdown, /每步调用 heap stats/);
});
test('interview guides use scenario and source-evidence answers', () => {
  for (const [file] of articles.filter(([, order]) => order >= 13)) {
    const markdown = readArticle(file);
    assert.ok((markdown.match(/^### 问题 \d+/gm) ?? []).length >= 8, `${file} must contain at least eight questions`);

    assert.doesNotMatch(markdown, /^回答检查：$/m);
    const questions = markdown.split(/^### 问题 \d+[^\r\n]*$/m).slice(1);
    assert.ok(questions.length >= 8, `${file} must contain at least eight complete questions`);
    for (const [index, question] of questions.entries()) {
      assert.match(question, /\*\*场景\*\*/, `${file} question ${index + 1} must include a scenario`);
      assert.match(question, /> \*\*源码依据\*\*：/, `${file} question ${index + 1} must cite source evidence`);
      assert.match(question, /\*\*详细回答\*\*/, `${file} question ${index + 1} must provide a detailed answer`);
      assert.match(question, /> \*\*常见误区\*\*：/, `${file} question ${index + 1} must explain a misconception`);
      assert.match(question, /\*\*追问：/, `${file} question ${index + 1} must include a follow-up`);
    }
  }
});

test('freertos framework remains a draft planning artifact', () => {
  const path = join(freertosDir, 'freertos-kernel-framework.md');
  assert.ok(existsSync(path), 'FreeRTOS framework must exist');
  const markdown = readFileSync(path, 'utf8');

  assert.match(markdown, /^series: freertos$/m);
  assert.match(markdown, /^order: 0$/m);
  assert.match(markdown, /^draft: true$/m);
});

test('freertos is registered as a first-class site series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /freertos/);
  assert.match(seriesConfig, /freertos:\s*\{/);
  assert.match(seriesConfig, /href: '\/freertos\/'/);
  assert.match(articlesLib, /value === 'freertos'/);
});
