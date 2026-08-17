# RISC-V Series First Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Publish RISC-V as a first-class Astro content series with a complete, reproducible QEMU RV64 bare-metal Hello World article.

**Architecture:** Add a riscv series ID to the data-driven content system so the generic routes, cards, filters, and article ordering work without RISC-V-specific pages. Publish the first article as a validated Markdown content entry; Node tests protect both the series registry and its article contract.

**Tech Stack:** Astro 4, TypeScript, Astro components, Node built-in test runner, Markdown, Mermaid, CMake, RISC-V GNU toolchain, QEMU system emulation, GDB.

---

## File Structure

- Modify: src/content/config.ts - Content glob and Zod enum.
- Modify: src/lib/series.ts - Series type, metadata, accent, and display order.
- Modify: src/lib/articles.ts - Runtime series ID guard.
- Modify: src/components/SeriesCard.astro - RISC-V icon and accent gradient.
- Modify: tests/site-content-config.test.mjs - Registry and article tests.
- Create: docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md - Published opening article.

## Authoritative References

Validate all version-sensitive prose and commands against the following primary sources while drafting. Link them in the article where a reader needs to investigate version differences.

- QEMU RISC-V system emulator: https://qemu.readthedocs.io/en/master/system/target-riscv.html
- QEMU virt virtual platform: https://qemu.readthedocs.io/en/master/system/riscv/virt.html
- QEMU invocation and GDB options: https://qemu.readthedocs.io/en/master/system/invocation.html
- RISC-V ELF psABI register and stack rules: https://riscv-non-isa.github.io/riscv-elf-psabi-doc/

### Task 1: Define the Publishing Contract First

**Files:**

- Modify: tests/site-content-config.test.mjs

- [ ] **Step 1: Add the failing RISC-V registry test after the Zephyr registry test**

~~~js
test('riscv is registered as a first-class article series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(contentConfig, /pattern:\s*'\{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio\}\/\*\*\/\*\.md'/);
  assert.match(contentConfig, /z\.enum\(\['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]\)/);
  assert.match(seriesConfig, /export type SeriesId = 'cuda' \| 'ee-system' \| 'rknn' \| 'riscv' \| 'zephyr' \| 'bsp' \| 'video-audio';/);
  assert.match(seriesConfig, /riscv:\s*\{/);
  assert.match(seriesConfig, /SERIES_ORDER: SeriesId\[\] = \['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'\]/);
  assert.match(articlesLib, /value === 'riscv'/);
  assert.match(seriesCard, /riscv:/);
});
~~~

- [ ] **Step 2: Add the failing first-article contract immediately after the registry test**

~~~js
test('the first RISC-V article includes required published frontmatter', () => {
  const articlePath = 'docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md';
  const markdown = readFileSync(articlePath, 'utf8');

  assert.match(markdown, /^---\r?\n[\s\S]+?\r?\n---\r?\n/);
  assert.match(markdown, /^series: riscv$/m);
  assert.match(markdown, /^order: 1$/m);
  assert.match(markdown, /^draft: false$/m);
  assert.ok(markdown.split(/\r?\n/).length >= 300);
  assert.ok((markdown.match(/^```mermaid$/gm) ?? []).length >= 5);
});
~~~

Use existing triple-backtick Mermaid fences in the implementation. The plan uses tilde fences only to keep its embedded code distinguishable.

- [ ] **Step 3: Run the test suite to confirm the red state**

Run: npm test

Expected: the registry assertions fail because riscv is not in the collection, metadata, type guard, or icon map. The article test fails because its file is absent. Record unrelated failures caused by pre-existing BSP changes without modifying them.

- [ ] **Step 4: Preserve the existing test-file changes**

The test file already contains user-owned BSP edits. Do not stage or commit it as a whole in this task. Leave the new RISC-V test hunk unstaged until the owner decides how to combine it with the BSP test work.

### Task 2: Register RISC-V in the Generic Site

**Files:**

- Modify: src/content/config.ts
- Modify: src/lib/series.ts
- Modify: src/lib/articles.ts
- Modify: src/components/SeriesCard.astro

- [ ] **Step 1: Expand the content collection**

In src/content/config.ts replace the loader with:

~~~ts
  loader: glob({ pattern: '{cuda,ee-system,rknn,riscv,zephyr,bsp,video-audio}/**/*.md', base: './docs/articles' }),
~~~

Replace the series schema field with:

~~~ts
    series: z.enum(['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio']),
~~~

- [ ] **Step 2: Extend the type and RISC-V metadata**

In src/lib/series.ts change the identifier union to:

~~~ts
export type SeriesId = 'cuda' | 'ee-system' | 'rknn' | 'riscv' | 'zephyr' | 'bsp' | 'video-audio';
~~~

Extend the accent union:

~~~ts
  accent: 'blue' | 'emerald' | 'violet' | 'indigo' | 'amber' | 'cyan' | 'rose';
~~~

Add this entry between rknn and zephyr:

~~~ts
  riscv: {
    id: 'riscv',
    title: 'RISC-V 架构精讲',
    shortTitle: 'RISC-V',
    description: '从 QEMU 裸机实验、架构原理到 FPGA 软核，建立可动手验证的 RISC-V 系统能力。',
    accent: 'indigo',
    href: '/riscv/',
    label: '架构与软核',
  },
~~~

Replace the order declaration with:

~~~ts
export const SERIES_ORDER: SeriesId[] = ['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'video-audio'];
~~~

- [ ] **Step 3: Extend the runtime guard**

In src/lib/articles.ts replace isSeriesId() with:

~~~ts
export function isSeriesId(value: string): value is SeriesId {
  return value === 'cuda' || value === 'ee-system' || value === 'rknn' || value === 'riscv' || value === 'zephyr' || value === 'bsp' || value === 'video-audio';
}
~~~

- [ ] **Step 4: Add the card palette and icon**

In src/components/SeriesCard.astro add this gradient after violet:

~~~ts
  indigo: { from: '#6366F1', to: '#0EA5E9', glow: 'rgba(99,102,241,0.15)' },
~~~

Add this icon entry between rknn and zephyr:

~~~ts
  riscv: 'M5.25 3.75h13.5v16.5H5.25V3.75Zm3 3v10.5h7.5V6.75H8.25Zm1.5 1.5h4.5v1.5H9.75v-1.5Zm0 3h4.5v1.5H9.75v-1.5Zm0 3h3v1.5h-3v-1.5Z',
~~~

- [ ] **Step 5: Run tests to confirm registry green and article red**

Run: npm test

Expected: the registry test passes. The new article test is the only RISC-V failure and reports an absent file.

- [ ] **Step 6: Commit the series registration**

~~~bash
git add src/content/config.ts src/lib/series.ts src/lib/articles.ts src/components/SeriesCard.astro
git commit -m "feat: register RISC-V article series"
~~~

### Task 3: Publish the First QEMU Article

**Files:**

- Create: docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Add the exact published frontmatter**

~~~markdown
---
title: "嵌入式知识体系 · RISC-V 架构精讲 #01 · QEMU 环境搭建与第一个 Hello World"
description: "在 QEMU virt 上以统一 CMake 工程完成 RV64 裸机程序的构建、启动、串口输出与 GDB 验证。"
pubDate: "2026-08-16"
series: riscv
order: 1
tags: ["RISC-V", "QEMU", "RV64", "CMake", "裸机", "GDB"]
draft: false
---
~~~

After the frontmatter, start with a short no-hardware goal statement. Do not add a repeated H1, change log, full article list, numbered-series references, or a preview of a future article.

- [ ] **Step 2: Write the setup and architecture sections**

Use these headings verbatim:

~~~markdown
## 1. 先定义这次实验能证明什么
## 2. 认识 QEMU virt、RV64 与最小工具链
## 3. 建立一套可复用的 CMake 工程
~~~

Define QEMU system emulation, the virt machine, RV64, cross compiler, ELF, ISA, ABI, and register aliases at first use. For each RISC-V concept, compare it to an ARM Cortex-M or Linux-hosted equivalent.

Include this project tree:

~~~text
riscv-qemu-lab/
├── CMakeLists.txt
├── cmake/
│   └── toolchain-riscv.cmake
├── linker/
│   └── qemu-virt.ld
└── src/
    ├── start.S
    └── main.c
~~~

Add two Mermaid diagrams: the host-to-QEMU build/run chain and the compiler/linker/ELF/QEMU CPU/RAM/UART layer boundaries.

- [ ] **Step 3: Include a fully consistent runnable project**

Use these four code blocks exactly.

~~~cmake
# cmake/toolchain-riscv.cmake
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR riscv64)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

set(RISCV_TOOLCHAIN_PREFIX riscv64-unknown-elf CACHE STRING "RISC-V GNU toolchain prefix")
set(CMAKE_C_COMPILER ${RISCV_TOOLCHAIN_PREFIX}-gcc)
set(CMAKE_ASM_COMPILER ${RISCV_TOOLCHAIN_PREFIX}-gcc)
set(CMAKE_OBJCOPY ${RISCV_TOOLCHAIN_PREFIX}-objcopy)
~~~

~~~cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.20)
project(riscv_qemu_hello C ASM)

add_executable(riscv-qemu-hello
  src/start.S
  src/main.c
)

target_compile_options(riscv-qemu-hello PRIVATE
  -march=rv64imac
  -mabi=lp64
  -mcmodel=medany
  -ffreestanding
  -fno-stack-protector
  -Wall
  -Wextra
)

target_link_options(riscv-qemu-hello PRIVATE
  -nostdlib
  -Wl,-T,${CMAKE_CURRENT_SOURCE_DIR}/linker/qemu-virt.ld
  -Wl,--gc-sections
)
~~~

~~~ld
/* linker/qemu-virt.ld */
ENTRY(_start)

MEMORY
{
  RAM (rwx) : ORIGIN = 0x80000000, LENGTH = 128M
}

SECTIONS
{
  . = ORIGIN(RAM);

  .text : {
    KEEP(*(.text.init))
    *(.text .text.*)
  } > RAM

  .rodata : { *(.rodata .rodata.*) } > RAM
  .data : { *(.data .data.*) } > RAM

  .bss (NOLOAD) : {
    __bss_start = .;
    *(.bss .bss.* COMMON)
    __bss_end = .;
  } > RAM

  . = ALIGN(16);
  __stack_top = ORIGIN(RAM) + LENGTH(RAM);
}
~~~

~~~asm
/* src/start.S */
.section .text.init
.globl _start
.type _start, @function

_start:
    la sp, __stack_top
    call main
1:
    wfi
    j 1b
~~~

~~~c
/* src/main.c */
#include <stdint.h>

#define QEMU_VIRT_UART0_BASE 0x10000000UL

static volatile uint8_t *const uart0 =
    (volatile uint8_t *)QEMU_VIRT_UART0_BASE;

static void uart_putc(char character)
{
    *uart0 = (uint8_t)character;
}

static void uart_puts(const char *text)
{
    while (*text != '\0')
        uart_putc(*text++);
}

int main(void)
{
    uart_puts("Hello from RISC-V on QEMU virt!\r\n");

    for (;;)
        __asm__ volatile ("wfi");
}
~~~

Explain in prose that the RAM origin and UART MMIO address apply only to QEMU virt, then link the QEMU documentation. Explain that sp is x2 and that standard ABI code maintains stack alignment; do not claim this single-function start-up example replaces a production CRT.

- [ ] **Step 4: Write the build, launch, inspection, and GDB sections**

Use these headings:

~~~markdown
## 4. 构建、装载并观察第一行串口输出
## 5. 用 ELF 和 GDB 验证程序真的从入口运行
~~~

Include preflight checks:

~~~bash
riscv64-unknown-elf-gcc --version
qemu-system-riscv64 --version
riscv64-unknown-elf-gdb --version
~~~

Use this build and run session:

~~~bash
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-riscv.cmake
cmake --build build
riscv64-unknown-elf-readelf -h build/riscv-qemu-hello
riscv64-unknown-elf-objdump -d build/riscv-qemu-hello | head -80
qemu-system-riscv64 \
  -machine virt \
  -m 128M \
  -bios none \
  -nographic \
  -kernel build/riscv-qemu-hello
~~~

State the expected serial output:

~~~text
Hello from RISC-V on QEMU virt!
~~~

Use this stopped QEMU session and GDB interaction:

~~~bash
qemu-system-riscv64 \
  -machine virt \
  -m 128M \
  -bios none \
  -nographic \
  -S \
  -gdb tcp::1234 \
  -kernel build/riscv-qemu-hello
~~~

~~~gdb
riscv64-unknown-elf-gdb build/riscv-qemu-hello
(gdb) target remote :1234
(gdb) break _start
(gdb) break main
(gdb) continue
(gdb) info registers sp pc
(gdb) x/8i $pc
~~~

Explain that -S pauses the guest and -gdb exposes a TCP stub; mention -s only as the 1234 shorthand. Add three Mermaid diagrams: GDB interaction sequence, UART data path, and failure decision tree covering absent toolchain, CMake failure, non-RISC-V ELF, missing serial output, and inaccessible TCP port.

- [ ] **Step 5: Add practice, milestone, and acceptance without breaking series red lines**

Finish in this order:

~~~markdown
### 常见失败：先按证据分层定位
### 本章练习
### 本章里程碑
### 本章验收
~~~

Exercises must require the reader to change the greeting, find _start and main with objdump, change one optimization flag and compare ELF size, and verify with GDB that sp is initialized before main. The acceptance checklist must require a cross-compilation success, RISC-V ELF inspection, exact serial output, and both GDB breakpoints.

End with exactly one tag line:

~~~markdown
> 🏷️ RISC-V · QEMU · RV64 · CMake · 裸机 · UART · GDB · 交叉编译
~~~

The completed article must contain at least 300 lines and five Mermaid blocks. It must not contain any of these disallowed phrases: 等等, 让我, 不对, 记错, 嗯, 哦, Hmm, 草稿, 思考, Part A, Part B, Part C, 下一篇, 下一章, 预告, 后续, or RV followed by a hyphen and number.

- [ ] **Step 6: Run content tests and editorial checks**

Run: npm test

Expected: both new RISC-V tests pass; report rather than alter unrelated failures.

Run:

~~~powershell
rg -n '等等|让我|不对|记错|嗯|哦|Hmm|草稿|思考|Part A|Part B|Part C|下一篇|下一章|预告|后续|RV-[0-9]+' docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md
~~~

Expected: no output.

- [ ] **Step 7: Build the complete site**

Run: npm run build

Expected: Astro accepts series: riscv, creates its index and article route, and completes successfully.

- [ ] **Step 8: Commit only the published article**

~~~bash
git add docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md
git commit -m "docs: publish first RISC-V QEMU article"
~~~

## Final Verification

- [ ] Run npm test and record the full result.
- [ ] Run npm run build and record the full result.
- [ ] Run git status --short and confirm that existing BSP and Zephyr files are untouched.
- [ ] Inspect frontmatter, article line count, Mermaid count, first section, final tag line, and red-line scan output.
