---
title: "嵌入式知识体系 · #32 · Cortex-A 的 MMU 与虚拟内存：从页表到 TLB"
description: "MMU（Memory Management Unit）是 Cortex-A 系列处理器和单片机之间最根本的区别之一。"
pubDate: "2026-08-23"
series: "ee-system"
order: 32
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
MMU（Memory Management Unit）是 Cortex-A 系列处理器和单片机之间最根本的区别之一。

在 Cortex-M 上，你直接操作物理地址——`*(volatile uint32_t *)0x40020014` 就是在写 GPIO 寄存器。但在 Linux 或 RTOS 运行在 Cortex-A 上时，**应用程序看到的地址全是虚拟的**。你写的 `0x8000` 可能映射到物理内存的某个角落，也可能根本不在内存中——缺页异常会把它"按需"加载进来。

这篇完整拆解虚拟地址翻译的全流程，从页表结构到 TLB 缓存再到缺页处理。

---

## 一、虚拟地址 → 物理地址：翻译的起点

### 为什么需要 MMU？

简单说，MMU 提供了三层能力：

1. **隔离**：每个进程有自己的虚拟地址空间，A 进程不可能看到 B 进程的内存
2. **简化**：应用程序不用关心物理内存的大小和碎片，看到的是一个连续的虚拟地址空间
3. **保护**：通过页表项的权限位（读/写/执行/特权），硬件级阻止非法访问

### 翻译流程概览

当 CPU 执行一条加载指令 `LDR R0, [R1]`，如果 R1 中的地址启用了 MMU，硬件自动走以下流程：

```
虚拟地址 (VA)
     │
     ▼
MMU 硬件查 TLB（快表）
     ├── TLB 命中 → 直接得到物理地址 (PA) → 访存
     │
     └── TLB 未命中 → 硬件遍历页表（Page Table Walk）
              │
              ▼
         从内存读取页表项 (PTE)
              │
              ▼
         得到物理地址 → 填充 TLB → 访存
              │
              ▼
      如果 PTE 无效 → 缺页异常（Page Fault）→ 交给操作系统处理
```

关键点：**硬件的页表遍历（walk）发生在 TLB miss 之后、缺页异常之前**。硬件先走完页表，发现 PTE 无效才触发异常。

---

## 二、页表结构：四级分级的艺术

ARMv7-A / ARMv8-A 使用多级页表来管理虚拟地址空间。以 ARMv7-A 的 4KB 页、LPAE（Large Physical Address Extension）为例，完整的四级页表是这样：

```
虚拟地址 (32-bit 示意)
┌─────┬──────┬──────┬──────────┐
| PGD | PMD  | PTE  | 页内偏移  |
| 2bit| 9bit | 9bit |  12 bit   |
└─────┴──────┴──────┴──────────┘
```

### 第一级：页全局目录（PGD / L1）

PGD 是页表的入口。CPU 中的 TTBR（Translation Table Base Register）指向 PGD 的基地址。

```c
/* 硬件通过 TTBR0/TTBR1 找到 PGD */
/* 用 VA[31:20] 作为索引找到 L1 描述符 */
uint32_t *pgd = (uint32_t *)TTBR0;
uint32_t l1_index = (va >> 20) & 0xFFF;
uint32_t l1_desc = pgd[l1_index];
```

L1 描述符可以是两种类型：
- **节描述符（Section）**：直接映射 1MB 区域——适合大块连续映射（如内核空间）
- **页表描述符**：指向下一级页表（PMD 或 L2 页表）

### 第二级：页中间目录（PMD / L2）

如果 L1 描述符是页表类型，MMU 用 VA 的下一段位域索引 PMD：

```c
uint32_t *pmd = (uint32_t *)(l1_desc & 0xFFFFFC00);
uint32_t l2_index = (va >> 12) & 0xFF;  /* 9-bit 索引 */
uint32_t l2_desc = pmd[l2_index];
```

L2 描述符可以是：
- **大页（64KB）** 描述符
- **小页（4KB）** 描述符——最常用的粒度
- **无效描述符** → 缺页异常

### 第三级：页表条目（PTE / L3）

对于 4KB 页，L2 描述符指向 L3 页表，用 VA[11:0] 作为页内偏移：

```c
uint32_t *pte = (uint32_t *)(l2_desc & 0xFFFFFC00);
uint32_t pte_index = (va >> 0) & 0x3FF;  /* 10-bit */
uint32_t pte_val = pte[pte_index];

uint32_t phys_addr = (pte_val & 0xFFFFF000) | (va & 0xFFF);
```

### 页表项的权限与属性

每个 PTE 不仅仅是个地址，还包含了丰富的属性位：

```
PTE (32-bit):
Bit [31:12] : 物理页帧号 (PFN) —— 物理地址的高 20 位
Bit [11]    : 非安全 (NS) —— TrustZone 相关
Bit [10]    : 访问权限 (AP[2])
Bit [9:8]   : 访问权限 (AP[1:0]) —— 读/写/特权级
Bit [7]     : 可共享 (Shareable)
Bit [6]     : 可执行 (XN) —— eXecute Never
Bit [5]     : 脏页 (Dirty)
Bit [4]     : 已访问 (Access)
Bit [3:2]   : 内存属性 (TEX)
Bit [1]     : 缓存策略 (C) —— write-back/write-through
Bit [0]     : 缓存策略 (B) —— 是否可缓存
```

```
AP 位编码（经典）：
00: 特权读写，用户无权
01: 特权读写，用户只读
10: 特权读写，用户读写
11: 同 10，架构已废弃
```

这就是 MMU 实现进程隔离的核心——用户态程序运行的 AP=10，但其他进程对应的 PTE 的 AP 被内核设为 00，硬件的权限检查直接拒绝访问。

---

## 三、TLB：地址翻译的"快表"

页表在内存中，每次翻译都要走 3~4 次内存访问（PGD → PMD → PTE），开销极大。TLB（Translation Lookaside Buffer）就是 MMU 内部的**页表项缓存**。

### TLB 命中 vs 未命中

```
TLB 命中:   1~2 个时钟周期，直接得到物理地址
TLB 未命中: 25~100+ 个时钟周期（取决于页表级数和内存延迟）
```

现代 Cortex-A 处理器有几十到几百个 TLB 条目，分指令 TLB（iTLB）和数据 TLB（dTLB），通常还有多级 TLB 架构（L1 TLB + L2 TLB）。

### TLB 失效（TLB Flush / Invalidate）

当页表发生变更时（比如内核分配新内存、换出页面），操作系统必须主动使 TLB 中的缓存条目失效，否则 MMU 会继续使用旧的映射：

```c
/* ARMv7-A: 使整个 TLB 失效 */
inline void tlb_flush_all(void) {
    __asm volatile("MOV R0, #0");
    __asm volatile("MCR p15, 0, R0, c8, c7, 0");  /* TLBIALL */
    __asm volatile("DSB");   /* 确保 flush 完成 */
    __asm volatile("ISB");   /* 刷新指令流水线 */
}
```

**性能关键**：如果每次页表修改都 flush 整个 TLB，性能损失巨大。所以 Linux 中有"大页"（HugeTLB）和"局部 TLB 失效"（ASID-based invalidation）的优化。

### ASID：让 TLB 条目在进程切换时不失效

每个 TLB 条目可以关联一个 **ASID（Address Space ID）**。进程切换时，内核只需要切换 TTBR0（指向新进程的 PGD），而不必将整个 TLB 刷掉——TLB 中属于旧 ASID 的条目虽然还在，但对新进程不可见：

```c
/* 设置当前 ASID */
uint32_t asid = current->mm->asid;
__asm volatile("MCR p15, 0, %0, c13, c0, 1" : : "r"(asid));
```

这可以大幅降低上下文切换的 TLB miss 开销。

---

## 四、缺页中断与按需调页

缺页中断（Page Fault）是虚拟内存中最核心的机制。当 MMU 发现 PTE 无效（PTE[0] = 0）时，触发一个缺页异常——**注意**，这不是错误，而是正常操作。

### 缺页的三种类型

| 类型 | 原因 | CPU 行为 |
|:---|:-----|:--------|
| **Major Fault** | 页面在磁盘上，不在物理内存中 | 选择空闲页 → 磁盘 I/O 读取 → 更新 PTE → 唤醒进程 |
| **Minor Fault** | 页面在物理内存中，但 PTE 尚未建立 | 只需分配 PTE，设置映射即可 |
| **Segment Fault** | 访问非法地址（PTE 不存在且无映射文件） | 发送 SIGSEGV 信号杀死进程 |

### Minor Fault 的典型场景

Linux 利用 mmap 做**按需映射**——调用 `mmap` 时内核只分配了 VMA（虚拟内存区域），但不分配物理页，也不建立 PTE。真正访问时触发 minor fault：

```c
/* 进程调用 mmap 但没有立即分配物理内存 */
void *addr = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                  MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);

/* 访问时触发缺页中断 */
addr[0] = 0x42;  /* ← 此时才分配物理页 + 建立 PTE */
```

这就是为什么 `ps` 看到的 VSZ（虚拟内存大小）远大于 RSS（驻留内存大小）——RSS 只计算真正访问过的页。

### Major Fault 的全流程

```
fd = open("data.bin", O_RDONLY);
ptr = mmap(NULL, 65536, PROT_READ, MAP_SHARED, fd, 0);
printf("%c", ptr[0]);  /* ← 触发 major fault */
```

流程分解：
1. MMU 查页表，PTE 无效
2. 触发缺页异常，Linux 的 `do_page_fault()` 执行
3. 内核查该 VMA 的映射源：`data.bin` 文件的第 0 页
4. 内核分配一个物理页框（Page Frame）
5. 发起块设备 I/O，从文件的第 0 页读入物理页框
6. 更新进程页表：PTE 指向该物理页框，标记有效
7. 返回用户空间，重新执行 `ptr[0]`
8. TLB miss → 查页表（这次命中）→ 加载成功

整个过程中，应用程序**完全不知道物理内存里发生了什么**——它只看到 `ptr[0]` 正常返回了字符。

---

## 五、嵌入式 Linux 中的 MMU 配置示例

在嵌入式 Linux BSP 中，内核启动时通过 `early_mm_init()` 建立初始页表。以 ARMv7-A 为例：

```assembly
@ Linux 启动汇编中的页表初始化（head.S 简化）
    @ 设置 TTBR0 指向 swapper_pg_dir（内核页表）
    ldr r0, =swapper_pg_dir
    mcr p15, 0, r0, c2, c0, 0    @ TTBR0

    @ 设置域访问控制（允许所有域）
    mov r0, #0xFFFFFFFF
    mcr p15, 0, r0, c3, c0, 0     @ DACR

    @ 使能 MMU
    mrc p15, 0, r0, c1, c0, 0     @ SCTLR
    orr r0, r0, #0x1              @ 设置 M 位（MMU enable）
    mcr p15, 0, r0, c1, c0, 0     @ SCTLR
```

设备驱动中经常需要**禁用某段地址的 MMU 缓存**，以保证和 DMA 的 coherency：

```c
/* 将一段物理内存映射为非缓存（non-cached）区域 */
void *dma_alloc_coherent(struct device *dev, size_t size,
                         dma_addr_t *dma_handle, gfp_t flag)
{
    /* 分配物理页 */
    /* 建立页表时，PTE 的 C/B 位设为 00（non-cacheable） */
    /* 返回虚拟地址，保证 CPU 和 DMA 看到的数据一致 */
}
```

---

## 小结

理解 MMU 不是 CV 工程师的任务——对于嵌入式底层开发者来说，它是区分"只知道怎么配寄存器"和"真正理解系统运行"的分水岭。

**需要记住的核心链条：**

```
虚拟地址 → PGD → PMD → PTE → 物理地址 + 权限检查
                         ↓ (TLB miss)
                      硬件遍历页表
                         ↓ (PTE 无效)
                      缺页异常 → 操作系统处理
```

对于嵌入式场景，理解 MMU 还意味着你知道了：
- 为什么 `mmap()` 大于物理内存的文件是可行的（按需调页）
- 为什么 DMA buffer 要分配为非缓存内存（Cache 一致性问题——下一篇细讲）
- 为什么进程切换可以这么快（TLB 的 ASID 机制）

> 🏷️ MMU 虚拟内存 页表 PGD PMD PTE TLB 缺页异常 Cortex-A ARMv7
