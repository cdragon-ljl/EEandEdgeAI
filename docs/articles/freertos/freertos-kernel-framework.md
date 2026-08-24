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

本系列面向已经掌握 C 语言，并使用过 `xTaskCreate`、Queue、Semaphore 等基础 API，但还没有系统阅读过 FreeRTOS 内核源码的嵌入式工程师。文章会先把 API 背后的对象和问题讲清楚，再进入数据结构、调用链和 portable 层契约，不要求读者预先理解 TCB、事件链表或上下文帧。

文章不是 API 百科、配置清单或开发板移植教程。每篇从一个明确问题出发，沿公开入口进入源码，持续跟踪函数调用、对象所有权和状态变化，直到该机制完整闭合。读者应能根据文章给出的路径回到上游仓库独立复核结论。

每篇选择一个贯穿场景，用具体任务优先级、Tick、链表归属、对象字段和返回值解释源码为何这样设计。贯穿场景只服务于源码推演，不把文章改造成开发板实验教程，也不要求每篇使用相同章节标题。

## 源码基线

所有文章固定使用：

```text
FreeRTOS-Kernel V11.3.0
commit 9b777ae5c5b8e9e456065a00294d1e5f5f9facf5
FreeRTOS 202604-LTS
```

权威来源：

- [FreeRTOS-Kernel V11.3.0](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0)
- [FreeRTOS Kernel Book](https://github.com/FreeRTOS/FreeRTOS-Kernel-Book)
- [GCC ARM_CM4F port](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0/portable/GCC/ARM_CM4F)
- [GCC RISC-V port](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0/portable/GCC/RISC-V)

不引用漂移的 `main` 行号，不用 vendor fork 代替上游实现，也不把某个开发板、HAL 或 IDE 的行为写成 FreeRTOS 公共内核机制。

## 学习顺序

### 1. 源码阅读方法与 List_t/ListItem_t

**中心问题：** FreeRTOS 如何用一套通用链表表达任务状态、等待顺序和对象归属？

**主要源码：** `include/FreeRTOS.h`、`include/list.h`、`list.c`、`include/portable.h`。

从固定版本与配置开始，解释 `List_t`、`ListItem_t`、`MiniListItem_t` 的内存关系，owner/container 语义，插入、尾插、删除和 `portMAX_DELAY` 特殊分支。本篇只建立后续文章共同使用的容器基础，不提前展开 TCB 和处理器上下文。

### 2. TCB、任务创建与删除

**中心问题：** 一个任务函数如何变成调度器可以选择和最终回收的 TCB？

**主要源码：** `include/task.h`、`tasks.c`、`include/portable.h`。

分析 `TCB_t` 的关键字段、状态节点和事件节点，跟踪动态与静态创建、任务字段初始化、初始栈契约、进入 ready list、任务删除以及 Idle 延迟回收。portable 层只解释接口职责，不进入具体架构栈帧。

### 3. 调度器、Tick、阻塞与唤醒

**中心问题：** 任务如何在 ready、delayed、event wait 和 running 之间移动，调度器又在何时选择新任务？

**主要源码：** `tasks.c`、`include/task.h`、`list.c`。

沿 `vTaskStartScheduler`、`vTaskSwitchContext`、`vTaskDelay`、`vTaskDelayUntil` 和 `xTaskIncrementTick` 解释 ready list、同优先级轮转、两条 delayed list、Tick 回绕、事件解除阻塞、scheduler suspend 和 pending ready。本文只讨论公共调度策略。

### 4. Cortex-M4 移植与上下文切换

**中心问题：** GCC ARM_CM4F port 如何利用 Cortex-M 异常机制启动首任务并切换上下文？

**主要源码：** `portable/GCC/ARM_CM4F/port.c`、`portmacro.h` 和 `tasks.c` 的调度交接点。

解释初始任务栈、硬件异常帧和软件保存帧、SVC、PendSV、SysTick、PSP/MSP、EXC_RETURN、BASEPRI、FPU 上下文和 ISR API 优先级边界。不绑定具体 MCU、开发板、启动工程或厂商 HAL。

### 5. RISC-V 移植与 trap 上下文

**中心问题：** GCC RISC-V port 如何定义上下文布局、分派 trap 并完成任务切换？

**主要源码：** `portable/GCC/RISC-V/port.c`、`portASM.S`、`portContext.h`、`portmacro.h`。

解释初始上下文、通用寄存器和 CSR 保存、`mstatus`、`mepc`、`mcause`、ecall yield、timer interrupt、ISR stack、chip-specific extension，以及 save/restore 对称性。不绑定具体 SoC 或 timer 外设实现。

### 6. Queue、ISR 路径与 Queue Set

**中心问题：** Queue 如何同时管理数据、等待任务和 ISR 与任务之间的并发？

**主要源码：** `include/queue.h`、`queue.c`、`tasks.c`。

跟踪发送和接收快速路径、队列满或空时的阻塞与超时、两条事件链表、scheduler suspend、queue lock、FromISR 路径和 `pxHigherPriorityTaskWoken`，再解释 Queue Set 如何复用 queue 机制实现多对象等待。

### 7. 信号量、互斥锁与优先级继承

**中心问题：** 信号量和互斥锁为什么共享 Queue_t，却具有不同的所有权和调度语义？

**主要源码：** `include/semphr.h`、`queue.c`、`tasks.c`。

分析 binary/counting semaphore、mutex holder、recursive mutex、`uxMutexesHeld`、优先级继承、释放时降级、等待超时后的部分降级，以及 priority inheritance 能解决和不能解决的问题。

### 8. 任务通知与 Event Group

**中心问题：** 不使用完整 Queue 时，FreeRTOS 如何实现轻量级单任务通知和多任务 bit 条件等待？

**主要源码：** `tasks.c`、`include/task.h`、`event_groups.c`、`include/event_groups.h`。

解释 notification state/value、不同 `eNotifyAction`、wait/take、FromISR 通知，以及 Event Group 的 wait-all/wait-any、clear-on-exit、控制位编码和 scheduler suspended 扫描。通过对象模型和执行路径说明两者边界，不写脱离源码的选型清单。

### 9. Stream Buffer 与 Message Buffer

**中心问题：** FreeRTOS 如何用同一个环形缓冲核心分别表达字节流和有边界消息？

**主要源码：** `stream_buffer.c`、`include/stream_buffer.h`、`include/message_buffer.h`。

分析 head/tail、空槽约束、分段复制、trigger level、消息长度头、发送和接收阻塞、single-writer/single-reader 契约、ISR 完成回调，以及内部任务通知的使用方式。

### 10. 软件定时器与 Timer daemon

**中心问题：** 软件定时器命令如何从调用者进入 daemon task，并最终变成 callback 执行？

**主要源码：** `timers.c`、`include/timers.h`、`queue.c`、`tasks.c`。

跟踪 timer command queue、`Timer_t`、active/overflow timer list、daemon 启动、start/reset/change/stop/delete 命令、到期计算、auto reload、callback 串行执行和 ISR 命令路径。

### 11. 静态分配与 heap_1 到 heap_5

**中心问题：** FreeRTOS 的对象内存来自哪里，五种 heap 实现分别提供什么分配、释放和碎片行为？

**主要源码：** `include/portable.h` 和 `portable/MemMang/heap_1.c` 至 `heap_5.c`。

解释静态对象内存归属，动态创建和删除路径，块头与对齐，heap_1 bump allocation，heap_2 按大小链表且不合并，heap_3 libc 包装，heap_4 地址有序链表与相邻合并，heap_5 region 定义与边界，以及各实现实际提供的统计能力。

### 12. 源码与工程面试专题

**中心问题：** 如何从源码事实回答 FreeRTOS 工程问题，而不是背诵 API 结论？

问题覆盖任务状态、调度和 Tick，两种架构的 context switch，Queue、信号量、mutex、notification 和 Event Group，ISR API 与优先级边界，内存所有权与碎片，以及实际系统中的优先级反转、超时、丢事件和资源回收。

每个问题使用真实工程场景，引用准确源码位置，给出完整推导和错误答案分析。问题之间可以跨模块，但不重复前 11 篇正文。

## 写作原则

不规定篇幅、标题数量、源码片段数量、表格数量、Mermaid 数量或图片数量。完成标准是中心问题已经被源码闭合，而不是达到数量门槛。

正文按实际控制流组织。一个函数调用另一个函数时，先说明传入条件，再解释被调用函数改变的对象，最后回到调用者判断返回值如何影响后续执行。

不能把同一段信息拆成“入口条件、执行动作、状态变化、观察证据”等固定字段，也不能把这些字段改成表格继续使用。

源码摘录只保留理解当前判断所需的连续代码，但必须保留会改变结论的特殊分支。每组摘录注明版本、文件、函数、配置条件和 V11.3.0 fixed-tag permalink。

表格只用于真实横向比较；图只在调用链、状态迁移或对象关系仅靠文字难以保持清晰时使用。能够用连续文字讲清楚的内容不作图。

只有第 4、5 篇详细讨论平台机制。其他文章使用公共内核语义。第 12 篇可以比较两种 port，但必须明确公共内核契约与架构实现的边界。

## 暂不纳入主线

MPU wrapper 的完整安全模型、SMP 调度和 affinity、Tickless idle、trace recorder 与运行时统计体系暂不塞入这 12 篇主线。核心系列完成后再单独规划进阶篇。

## 实施顺序

先完成第 1 篇样稿，由用户检查技术密度、叙事方式和源码分析深度。样稿确认后再逐篇继续，每完成一篇单独复核。

不再一次性批量生成整套文章。
