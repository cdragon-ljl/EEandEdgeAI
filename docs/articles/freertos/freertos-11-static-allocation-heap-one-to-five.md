---
title: "FreeRTOS 内核源码解读 11：静态分配与 heap_1 到 heap_5"
description: "对照 FreeRTOS-Kernel V11.3.0 的五个 MemMang 实现，分析对象内存所有权、块头、分配释放、碎片、region 和统计能力。"
pubDate: "2026-08-23"
series: freertos
order: 11
tags: ["FreeRTOS", "Memory Management", "heap_4", "heap_5", "Source Code"]
draft: false
---

# FreeRTOS 内核源码解读 11：静态分配与 heap_1 到 heap_5

FreeRTOS 公共内核只调用 `pvPortMalloc()`、`vPortFree()` 等 portable 接口，不规定底层必须使用哪种 allocator。`portable/MemMang` 提供五个互斥实现文件，它们导出相同基础符号，却拥有完全不同的释放、合并、region 和统计能力。链接哪一个文件，决定动态对象的实际内存语义。

本篇固定使用 **FreeRTOS-Kernel V11.3.0**，commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`。先说明静态对象所有权，再逐个阅读 heap_1 到 heap_5；不假设五种实现存在统一的高级统计 API。

## 静态创建与动态创建决定谁拥有对象内存

Task、Queue、Semaphore、Event Group、Timer 和 Stream Buffer 都同时提供静态/动态创建变体。动态 API 在内部调用 `pvPortMalloc()`，删除时根据对象保存的 allocation flag 调用 `vPortFree()`；静态 API 接收应用提供的 control block 和 storage，内核只在其生命周期内使用，不拥有也不释放这些内存。

以 task 为例，动态创建通常同时申请 TCB 与 stack；静态创建接收 `StaticTask_t` 和 `StackType_t[]`。当两种方式同时启用时，TCB 的 `ucStaticallyAllocated` 区分“TCB/stack 都动态”“stack 静态、TCB 动态”“两者都静态”，删除时只释放真正由 allocator 创建的部分。

静态分配不是把 `malloc` 换成编译期数组这么简单。应用必须保证缓冲区大小、对齐和生命周期满足对应 API；同一块静态存储不能同时交给两个内核对象。动态分配则把容量和碎片风险交给选中的 heap 实现。

五个实现的能力差异适合直接横向比较：

| 实现 | 内存来源 | free | 空闲块组织 | 合并 | 内核统计接口 |
|---|---|---|---|---|---|
| heap_1 | 单一 `ucHeap[]` | 不回收 | bump offset | 无 | `xPortGetFreeHeapSize` |
| heap_2 | 单一 `ucHeap[]` | 支持 | 按块大小排序 | 不合并 | `xPortGetFreeHeapSize` |
| heap_3 | C library heap | 取决于 libc | 由 libc 决定 | 由 libc 决定 | 无统一 FreeRTOS heap stats |
| heap_4 | 单一 `ucHeap[]` | 支持 | 按地址排序 | 相邻块合并 | free/min-ever/`vPortGetHeapStats` |
| heap_5 | 多个应用 region | 支持 | 按地址连接多个 region | region 内相邻块合并 | free/min-ever/`vPortGetHeapStats` |

这张表只描述 V11.3.0 文件实际导出的能力，不代表所有 allocator 的实时性能。

## heap_1 是只能前进的对齐 bump allocator

[`heap_1.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_1.c#L79-L140) 只有一个 `xNextFreeByte`。每次申请先对齐大小，再判断剩余容量：

```c
if( ( xWantedSize & portBYTE_ALIGNMENT_MASK ) != 0x00 )
{
    xWantedSize +=
        ( portBYTE_ALIGNMENT -
          ( xWantedSize & portBYTE_ALIGNMENT_MASK ) );
}

if( ( xNextFreeByte + xWantedSize ) <= configADJUSTED_HEAP_SIZE )
{
    pvReturn = &( ucHeap[ xNextFreeByte ] );
    xNextFreeByte += xWantedSize;
}
```

没有 block header，没有 free list，也没有搜索。分配成本固定且行为容易推演，但 `vPortFree()` 不回收任何空间。对象被 delete 后，公共内核可能调用 free 接口，heap_1 仍不会让 `xNextFreeByte` 后退。

`xPortGetFreeHeapSize()` 返回 `configADJUSTED_HEAP_SIZE - xNextFreeByte`，表示尚未分配过的尾部容量。它不能回答“哪些已删除对象可以复用”，因为该实现根本没有复用概念。

heap_1 适合启动阶段创建全部动态对象、运行后不再删除的系统。若运行期反复创建和删除，空闲量会单调减少直至失败，即使对象逻辑上已经销毁。

## heap_2 按大小寻找最小可用块，但不合并相邻 free block

[`heap_2.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_2.c) 在每个块前放置 `BlockLink_t`：

```c
typedef struct A_BLOCK_LINK
{
    struct A_BLOCK_LINK * pxNextFreeBlock;
    size_t xBlockSize;
} BlockLink_t;
```

Free list 按 `xBlockSize` 从小到大排序。Malloc 从头寻找第一个不小于 wanted size 的块，因此选中的是当前链表中的最小可用块；块足够大时分裂余量，并把 remainder 按大小重新插回 free list。

Free 从 payload 地址向前减去 `xHeapStructSize` 找到 header，清除 allocated 标志并按大小插回链表。插入宏只比较 size，没有检查物理地址连续性，也不把相邻块合并。

因此 heap_2 能复用释放块，却会积累外部碎片。总空闲字节可能大于申请值，但如果没有单块足够大，malloc 仍失败。`xPortGetFreeHeapSize()` 只能给总量，不能给 largest block 或 block count，诊断碎片需要调试器遍历内部 free list。

## heap_3 把并发保护包在 libc malloc/free 外

[`heap_3.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_3.c#L59-L103) 不定义 `ucHeap[]`，直接调用 C library：

```c
void * pvPortMalloc( size_t xWantedSize )
{
    void * pvReturn;

    vTaskSuspendAll();
    {
        pvReturn = malloc( xWantedSize );
    }
    ( void ) xTaskResumeAll();

    return pvReturn;
}

void vPortFree( void * pv )
{
    if( pv != NULL )
    {
        vTaskSuspendAll();
        {
            free( pv );
        }
        ( void ) xTaskResumeAll();
    }
}
```

分配算法、碎片合并、内存来源和统计能力全部由链接的 libc 决定。FreeRTOS 只用 scheduler suspend 包围调用，并执行 trace/malloc-failed hook。

heap_3 不提供 `xPortGetFreeHeapSize()`、minimum-ever 或 `vPortGetHeapStats()` 的统一实现。若产品需要统计，必须使用目标 C library 的 allocator 接口或替换 wrapper，不能调用其他 heap 文件才有的符号。

## heap_4 用地址有序 free list 实现相邻块合并

heap_4 也使用 `BlockLink_t`，但 free list 按地址升序，而不是按大小排序。第一次 `pvPortMalloc()` 看到 `pxEnd == NULL` 时调用 [`prvHeapInit()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_4.c#L456-L502)，对齐 `ucHeap` 边界，建立 xStart、首个大 free block 和 pxEnd 哨兵。

申请大小先增加对齐后的 header，并检查 size_t 溢出和 allocation bit。Malloc 沿地址链表寻找第一个 size 足够的块：

```c
pxPreviousBlock = &xStart;
pxBlock = xStart.pxNextFreeBlock;

while( ( pxBlock->xBlockSize < xWantedSize ) &&
       ( pxBlock->pxNextFreeBlock != NULL ) )
{
    pxPreviousBlock = pxBlock;
    pxBlock = pxBlock->pxNextFreeBlock;
}
```

这是 first sufficient，不是 best fit。选中块从 free list 移除；若余量大于 `heapMINIMUM_BLOCK_SIZE`，在 `block + xWantedSize` 处构造新 header，把 remainder 插回地址链表。Allocated block 的 size 最高位被置一，`pxNextFreeBlock` 保持 NULL，payload 位于 header 之后。

Free 恢复 header，验证 allocated bit 和 next pointer，清标志后调用 [`prvInsertBlockIntoFreeList()`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_4.c#L504-L570)。函数先找地址前驱，再分别检查：

```c
if( ( ( uint8_t * ) pxIterator + pxIterator->xBlockSize ) ==
    ( uint8_t * ) pxBlockToInsert )
{
    pxIterator->xBlockSize += pxBlockToInsert->xBlockSize;
    pxBlockToInsert = pxIterator;
}

if( ( ( uint8_t * ) pxBlockToInsert +
      pxBlockToInsert->xBlockSize ) ==
    ( uint8_t * ) pxIterator->pxNextFreeBlock )
{
    /* 再与后块合并。 */
}
```

地址排序让前后物理相邻判断只需 O(1) 比较，但找到插入点仍是 O(n)。合并显著降低 heap_2 的外部碎片，不代表永远没有碎片；被 allocated blocks 隔开的 free blocks 仍不能组成连续大块。

heap_4 提供 `xPortGetFreeHeapSize()`、`xPortGetMinimumEverFreeHeapSize()` 和 `vPortGetHeapStats()`。后者遍历 free list 计算 largest/smallest block、free block count 和成功/失败次数，适合判断“总量足够但最大连续块不足”。

## heap_5 先定义 region，再复用 heap_4 的地址算法

heap_5 不拥有固定 `ucHeap[]`。应用必须在任何可能调用 `pvPortMalloc()` 的对象创建之前调用 `vPortDefineHeapRegions()`；未定义 region 就分配属于错误调用顺序。

Region 数组按地址升序、互不重叠，并以 `{ NULL, 0 }` 结束。每个 region 起点向上对齐，末尾放置自己的 end marker，剩余部分成为该 region 的首 free block。前一 region 的 end marker 链接到下一 region 首块，形成全局地址有序 free list。

```c
HeapRegion_t xHeapRegions[] =
{
    { pucRegion0, xRegion0Size },
    { pucRegion1, xRegion1Size },
    { NULL, 0 }
};

vPortDefineHeapRegions( xHeapRegions );
```

固定实现见 [`heap_5.c`](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/V11.3.0/portable/MemMang/heap_5.c#L553-L669)。Region 之间可以有物理 gap；各自 end marker 防止 free block 被跨 gap 合并。若两个 region 实际连续且边界组织允许，仍必须以源码建立的 marker 关系为准，不能由应用假设自动拼接。

Region 初始化完成后，malloc/free、BlockLink_t、allocation bit、分裂、地址插入和统计逻辑与 heap_4 同源。`vPortGetHeapStats()` 也可用，但结果覆盖所有已定义 region 组成的全局 free list。

## 统计必须匹配当前链接的实现

FreeRTOS 工程通常只链接一个 `heap_n.c`，因为五个文件导出同名 `pvPortMalloc/vPortFree`。Map file 是确认实际实现的第一依据，不能仅凭 `FreeRTOSConfig.h` 推断。

各实现可观测能力不同：heap_1/2 只有总 free；heap_3 没有统一 FreeRTOS 统计；heap_4/5 才提供 minimum-ever 和完整 HeapStats。将只在 heap_4/5 存在的 `vPortGetHeapStats()` 写成通用接口，会在其他实现链接失败。

即使有 HeapStats，也不能用 minimum-ever 代替当前最大连续块。Minimum-ever 只记录历史最低总空闲，largest block 才直接关联一次大申请是否可能成功。长期稳定性分析应同时记录当前 free、minimum-ever、largest block、block count、malloc/free 失败和对象生命周期。

内存管理的选择最终取决于生命周期，而不是“哪个 heap 最先进”。永不删除可以用最简单 bump；固定尺寸高频对象可能更适合应用专用 pool；需要通用动态释放时 heap_4/5 提供合并；已有成熟 libc allocator 时 heap_3 只是适配层。无论选择哪一个，静态/动态对象所有权和实际链接实现必须在删除路径上保持一致。