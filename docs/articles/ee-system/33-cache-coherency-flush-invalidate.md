---
title: "嵌入式知识体系 · #33 · L1 / L2 Cache 一致性问题：flush 与 invalidate 的艺术"
description: "Cache 是现代处理器性能的基石——但从嵌入式角度来说，它也是最麻烦的东西之一。"
pubDate: "2026-08-23"
series: "ee-system"
order: 33
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
Cache 是现代处理器性能的基石——但从嵌入式角度来说，它也是**最麻烦的东西之一**。

当你用 DMA 往内存里写了一组新数据，CPU 读到的却是旧版本；当你在多核系统上往共享变量里写了一个值，另一个核读出来还是老样子——这些都是 Cache 一致性问题。

这篇文章从 Cache 的基本策略说起，到 DMA、多核等场景下如何正确使用 flush / invalidate / clean 操作，最后给出嵌入式实战中的判断框架。

---

## 一、两种核心策略：write-through vs write-back

Cache 和主存之间的数据同步策略，决定了系统的一致性和性能。

### Write-Through（全写）

每次 CPU 写 Cache 时，**同时写主存**。

```
CPU 写数据 → [Cache 更新] → [主存也更新]
                         ↑ write-through
```

**优点**：一致性简单——主存始终是最新的。DMA 读主存永远读到正确数据。
**缺点**：每次写入都要访问低速的主存，**带宽浪费严重**。

典型适用场景：性能要求不高但一致性重要的小型系统（如某些 Cortex-R 系列）。

### Write-Back（回写）

CPU 写 Cache 时，**只更新 Cache，标记该行为脏（dirty）**。只有当该 Cache 行被替换出去时，才将脏数据写回主存。

```
CPU 写数据 → [Cache 更新] ← 标记 dirty
               ↓ (替换时)
            [写回主存]
```

**优点**：带宽利用率高——同一个 Cache 行 N 次写入，只产生一次主存写入。
**缺点**：主存中的数据可能是过期的——如果 DMA 从主存读，读到的是旧数据。

绝大多数嵌入式应用（Linux 驱动的 Cortex-A、高性能 MCU 如 STM32H7）使用 write-back 策略，因为性能优势太大。

### Write-Back vs Write-Through 的选择标准

| 场景 | 推荐策略 | 原因 |
|:---|:--------:|:-----|
| 程序指令读取 | Write-Back | 指令不会自修改，无一致性问题 |
| 栈/堆数据 | Write-Back | 高带宽，极少 DMA 直接访问栈区 |
| DMA buffer | Cache 禁用 或 Write-Through | 保证 CPU 和 DMA 数据一致 |
| 共享内存（多核） | Write-Back + 软件同步 | 需手动维护 Cache 一致性 |

---

## 二、DMA 操作前后的 cache clean / invalidate

DMA 是 Cache 一致性问题最典型的暴露场景。

### 场景 A：DMA 从外设往内存写数据

```
外设 → [DMA 写入内存数据] → CPU 读
```

问题：内存被 DMA 写入新数据，但 CPU 的 Cache 中还存着旧的 Cache 行。CPU 读内存时，Cache 命中旧数据——**读到的是原来缓存的内容，不是 DMA 刚写进来的新数据**。

解决方案：DMA 传输完成后，**invalidate 这段地址范围的 Cache**：

```c
/* DMA 完成后的处理（以 ARMv7-A 为例） */
void dma_rx_complete(uint32_t *buf, size_t len)
{
    /* 使 Cache 中该地址范围的数据无效，强制下次读从主存加载 */
    cache_invalidate(buf, len);

    /* 现在 CPU 读取 buf 时，Cache miss → 从主存加载 → 拿到 DMA 写入的新数据 */
    process_data(buf);
}
```

### 场景 B：CPU 往内存写数据，DMA 发送

```
CPU 写数据到内存 → [可能还在 Cache 中，未写回主存] → DMA 从内存读
```

问题：CPU 把数据写入内存（实际只写到了 Cache 中），DMA 去读主存时数据还没写回去——**DMA 发送了错误的数据**。

解决方案：DMA 启动前，**clean（写回）这段地址范围的 Cache**：

```c
void dma_tx_start(uint32_t *buf, size_t len)
{
    /* 将 Cache 中的脏数据写回主存 */
    cache_clean(buf, len);

    /* 现在主存中的数据是最新的 */
    DMA_Start(buf, len);
}
```

### Clean + Invalidate 的组合

很多场景需要先 clean 再 invalidate——比如 DMA 双向 buffer：

```c
void dma_bidir_transfer(uint32_t *buf, size_t len)
{
    /* Step 1: Clean — 把 CPU 写的脏数据刷回主存 */
    cache_clean(buf, len);

    /* Step 2: 启动 DMA（外设从 buf 读 + 往外设写回 buf） */
    DMA_Start(buf, len);
    DMA_Wait();

    /* Step 3: Invalidate — 让 CPU 看到 DMA 写回来的新数据 */
    cache_invalidate(buf, len);
}
```

ARM 架构提供了 `clean & invalidate` 的联合操作（一条指令完成）：

```c
/* 大部分 ARM Cortex-A 的实现支持 DCCIMVAC */
inline void cache_clean_invalidate(void *addr, size_t len)
{
    uint32_t start = (uint32_t)addr & ~(CACHE_LINE_SIZE - 1);
    uint32_t end = (uint32_t)(addr + len);

    for (; start < end; start += CACHE_LINE_SIZE) {
        /* DCCIMVAC: Data Cache Clean and Invalidate by MVA to PoC */
        __asm volatile("MCR p15, 0, %0, c7, c14, 1" : : "r"(start));
    }
    DSB();
}
```

### 容易被忽略的细节：Cache Line 对齐

Cache 操作的最小单位是 **Cache line**（通常是 32 或 64 字节）。如果 buffer 没有对齐到 Cache line：

```c
uint8_t buf[64] __attribute__((aligned(64)));  /* ✅ 正确对齐 */
```

不对齐的 buffer，invalidate 时可能把相邻的无关数据也 invalidate 掉（导致性能下降和潜在的一致性问题）。

---

## 三、共享内存的多核一致性问题

多核系统中，两个 CPU 核共享一块物理内存。写回策略下，一个核改了数据，在它自己的 Cache 中，其他核看不到。

### 硬件一致性的两种路线

| 方案 | 原理 | 代表平台 |
|:---|:-----|:--------|
| **Snooping 协议** | 每个核监听总线上的内存访问，发现冲突时自动处理 | x86、Cortex-A MPCore 早期 |
| **目录协议** | 每个 Cache line 记录共享状态，精确通知 | ARM CCI-400/550、CHI |

### MESI 协议速懂

MESI 是最著名的 Cache 一致性协议，每个 Cache line 有 4 种状态：

| 状态 | 含义 | 该行在本核 | 在其他核 |
|:---:|:----|:----------:|:--------:|
| **M** (Modified) | 修改过，和主存不一致 | ✅ 最新 | ❌ 已过期 |
| **E** (Exclusive) | 独占，和主存一致 | ✅ 最新 | ❌ 不存在 |
| **S** (Shared) | 共享，和主存一致 | ✅ 已同步 | ✅ 已同步 |
| **I** (Invalid) | 失效 | ❌ | 可能有 |

状态转换自动由硬件维护。例如一个核写了 M 状态的 Cache line，其他核读到同一地址时硬件会：
1. 持有 M 状态的核 snoop 到该请求
2. 将脏数据写回主存
3. 状态从 M → S
4. 请求核从主存加载，状态设为 S

### 多核编程中数据竞争的本质

即使是硬件一致性协议，也解决不了**指令重排和可见性**问题：

```c
// 双核共享变量
volatile int flag = 0;
int data = 0;

// Core 0
data = 42;
flag = 1;

// Core 1
while (!flag);  // 等待 flag
// 此时 Core 1 读到的 data 可能还是 0！
```

为什么？因为：
1. Core 0 的 store buffer 可能让 `flag = 1` 先于 `data = 42` 对外可见（Store-Store Reorder）
2. Core 1 的 TLB 或预取机制可能在 `flag == 1` 之前就把 `data` 缓存了

硬件 Cache 一致性协议负责的是 **Cache line 级别的数据同步**，不负责**内存序（memory ordering）**。

**正确的做法：使用内存屏障**

```c
// Core 0
data = 42;
__asm volatile("DMB" ::: "memory");  // 数据内存屏障 → 确保 data 先写入
flag = 1;
__asm volatile("DSB" ::: "memory");

// Core 1
while (!flag) {
    __asm volatile("ISB" ::: "memory");  // 指令同步屏障
}
__asm volatile("DMB" ::: "memory");
// 现在读 data 得到 42
```

在 Linux 内核中，这被封装为 `smp_mb()` 或 `WRITE_ONCE()/READ_ONCE()` 等宏。

---

## 四、非缓存内存区域的分配方法

有些场景下，手动 clean/invalidate 太频繁、太麻烦，更好的方案是**直接禁止对该段内存使用 Cache**。

### Linux 中分配非缓存内存

```c
/* 方法 1: dma_alloc_coherent — 分配一致性的 DMA buffer */
void *dma_buf = dma_alloc_coherent(dev, size, &dma_addr, GFP_KERNEL);
/* 这段内存被映射为 non-cacheable，CPU 和 DMA 自动一致 */

/* 方法 2: remap 已有区域为 non-cacheable */
void *noncached = ioremap_nocache(phys_addr, size);
```

### 裸机 MCU 上设置非缓存区域

以 STM32H7（Cortex-M7 带 L1 Cache）为例：

```c
/* 在 MPU 中配置某段内存为 non-cacheable */
void MPU_Config_NonCacheable(void)
{
    MPU_Region_InitTypeDef MPU_Init = {0};

    /* 禁用 MPU */
    HAL_MPU_Disable();

    MPU_Init.Enable           = MPU_REGION_ENABLE;
    MPU_Init.Number           = MPU_REGION_NUMBER0;
    MPU_Init.BaseAddress      = 0x30000000;           /* SRAM 起始 */
    MPU_Init.Size             = MPU_REGION_SIZE_64KB;
    MPU_Init.SubRegionDisable = 0x00;
    MPU_Init.TypeExtField     = MPU_TEX_LEVEL0;
    MPU_Init.AccessPermission = MPU_REGION_FULL_ACCESS;
    MPU_Init.DisableExec      = MPU_INSTRUCTION_ACCESS_ENABLE;

    /* ↓ 关键！设置 TEX=1, C=0, B=0 → Non-Cacheable */
    MPU_Init.IsShareable      = MPU_ACCESS_NOT_SHAREABLE;
    MPU_Init.IsCacheable      = MPU_ACCESS_NOT_CACHEABLE;  /* ← 禁止缓存 */
    MPU_Init.IsBufferable     = MPU_ACCESS_NOT_BUFFERABLE;

    HAL_MPU_ConfigRegion(&MPU_Init);

    /* 启用 MPU */
    HAL_MPU_Enable(MPU_PRIVILEGED_DEFAULT);
}
```

配置后，`0x30000000` 开始的 64KB 区域 CPU 读写直接走总线到 SRAM，不经过 Cache——和 DMA 之间没有一致性问题。

### Strongly-Ordered（强序）内存

还有一种比 non-cacheable 更强的属性：**Strongly-Ordered**。它的含义是：
- 不缓存（non-cacheable）
- 不允许指令重排
- 每次读写都直接产生总线事务

典型用于**外设寄存器**映射：

```c
/* GPIO 寄存器映射为 Strongly-Ordered */
#define GPIOA_ODR  (*(volatile uint32_t *)0x40020014)
```

---

## 五、实战原则：什么时候该做什么

### 判断框架

```
数据流方向：
CPU → 设备（如 DMA 发送）
   → 先 cache_clean，再启动设备

设备 → CPU（如 DMA 接收）
   → 设备完成后先 cache_invalidate，再读

CPU → CPU（多核共享）
   → 用原子操作 + DMB/DSB，或者用 spinlock + volatile

CPU → 外设寄存器
   → 用 non-cacheable 映射（ioremap_nocache 或 __iomem）
```

### 性能与正确性的取舍

| 方法 | 正确性 | 性能 | 适用场景 |
|:----|:-----:|:----:|:--------|
| Non-cacheable | ✅ 全自动 | ❌ 最慢 | DMA buffer、外设寄存器 |
| Write-Through | ✅ 较安全 | ⚠️ 一般 | 共享变量（配合 barrier） |
| Write-Back + clean/invalidate | ⚠️ 手动维护 | ✅ 最快 | 大数据传输、视频帧 |
| Write-Back + 硬件一致性 | ✅ 自动 | ✅ 很快 | 多核 MPCore（CCI 控制器） |

---

## 小结

Cache 一致性是嵌入式系统从裸机走向复杂系统的必修课。理解它的核心在于三件事：

1. **知道什么时候数据在 Cache 里、什么时候在主存里**——这是 clean 和 invalidate 操作的基础
2. **知道总线上的其他 master（DMA、另一个 CPU 核）看的是主存还是 Cache**——这决定了你需要做什么操作
3. **知道合适的工具**——non-cacheable 映射、MPU 配置、DMB/DSB 指令——在正确的地方用正确的方法

**核心口诀**：写之前 clean，读之前 invalidate，双向 buffer 先 clean 再 invalidate。遇到 DMA 出诡异 bug，十有八九就是忘了这一步。

> 🏷️ Cache 一致性 Write-Back Write-Through DMA Clean Invalidate MPU 多核 MESI
