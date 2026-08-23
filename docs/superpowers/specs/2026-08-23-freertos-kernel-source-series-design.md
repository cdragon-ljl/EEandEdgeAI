# FreeRTOS 内核源码解读系列重新规划

## 设计状态

- 方案已确认。
- 目标文章数：12 篇。
- 当前阶段只确定系列边界、文章顺序和写作标准，不开始批量写作。

## 系列目标

本系列面向已经掌握 C 语言和基本 RTOS API，希望真正读懂 FreeRTOS 内核实现的嵌入式工程师。

文章不是 API 百科、配置清单或移植教程。主线是从公开入口进入源码，持续跟踪函数调用、对象所有权和状态变化，直到一个机制完整闭合。读者应能用文章提供的源码路径独立回到上游仓库复核结论。

系列固定使用：

```text
FreeRTOS-Kernel V11.3.0
commit 9b777ae5c5b8e9e456065a00294d1e5f5f9facf5
FreeRTOS 202604-LTS
```

不引用漂移的 `main` 行号，不用 vendor fork 代替上游实现，也不把某个开发板、HAL 或 IDE 写进公共内核机制。

## 清理边界

删除 `docs/articles/freertos` 中现有的 15 篇已发布文章。

保留并重新编写：

- `docs/articles/freertos/freertos-kernel-framework.md`；
- FreeRTOS 系列封面；
- 站点中的 FreeRTOS 系列注册和导航入口。

删除文章后，系列页面可以暂时没有已发布文章。新文章必须从样稿开始重新建立，不复用旧文章段落。

## 组织原则

采用执行链驱动，而不是 API 分类或源码文件顺序。

每篇文章只回答一个中心问题。文章结构由该问题的实际源码路径决定，不要求所有文章使用相同标题。数据结构、条件编译、临界区和 portable 交接只在解释当前机制时出现，不单独拼成固定章节。

学习顺序分为四层：

1. 先掌握内核通用容器和任务对象；
2. 再理解调度和任务状态变化；
3. 然后进入两种架构的 portable 实现；
4. 最后分析通信、同步、定时和内存管理。

面试专题放在全部核心文章之后，只使用前文已经解释过的源码事实。

## 十二篇文章

### 1. 源码阅读方法与 List_t/ListItem_t

中心问题：FreeRTOS 如何用一套通用链表表达任务状态、等待顺序和对象归属？

主要源码：`include/FreeRTOS.h`、`include/list.h`、`list.c`、`include/portable.h`。

核心内容：固定源码版本和配置的方法，`List_t`、`ListItem_t`、`MiniListItem_t` 的内存关系，owner/container 语义，插入、尾插和删除，`portMAX_DELAY` 特殊分支，以及如何从调用点判断并发保护由谁提供。

本篇不提前解释 TCB 全部字段，也不讨论具体处理器的上下文切换。

### 2. TCB、任务创建与删除

中心问题：一个任务函数如何变成调度器可以选择和最终回收的 TCB？

主要源码：`include/task.h`、`tasks.c`、`include/portable.h`。

核心内容：`TCB_t` 的关键字段，状态节点和事件节点，`xTaskCreate`、`xTaskCreateStatic`、`prvCreateTask`、`prvInitialiseNewTask`、`prvAddNewTaskToReadyList`，静态与动态内存所有权，任务删除和 Idle 延迟回收。

portable 层只讲 `pxPortInitialiseStack` 契约，不展开 Cortex-M4 或 RISC-V 栈帧。

### 3. 调度器、Tick、阻塞与唤醒

中心问题：任务如何在 ready、delayed、event wait 和 running 之间移动，调度器又在何时选择新任务？

主要源码：`tasks.c`、`include/task.h`、`list.c`。

核心内容：`vTaskStartScheduler`、ready list、`vTaskSwitchContext`、同优先级轮转、`vTaskDelay`、`vTaskDelayUntil`、两条 delayed list、Tick 回绕、`xTaskIncrementTick`、事件解除阻塞、scheduler suspend 与 pending ready。

重点是公共调度策略。实际寄存器保存留给两篇 port 文章。

### 4. Cortex-M4 移植与上下文切换

中心问题：GCC ARM_CM4F port 如何利用 Cortex-M 异常机制启动首任务并切换上下文？

主要源码：`portable/GCC/ARM_CM4F/port.c`、`portable/GCC/ARM_CM4F/portmacro.h`、`tasks.c`。

核心内容：初始任务栈、硬件异常帧和软件保存帧、SVC、PendSV、SysTick、PSP/MSP、EXC_RETURN、BASEPRI、FPU 上下文和 ISR API 优先级边界。

不绑定任何 Cortex-M4 MCU、开发板、启动工程或厂商 HAL。

### 5. RISC-V 移植与 trap 上下文

中心问题：GCC RISC-V port 如何定义上下文布局、分派 trap 并完成任务切换？

主要源码：`portable/GCC/RISC-V/port.c`、`portASM.S`、`portContext.h`、`portmacro.h`。

核心内容：初始上下文、通用寄存器和 CSR 保存、`mstatus`、`mepc`、`mcause`、ecall yield、timer interrupt、ISR stack、chip-specific extension，以及 save/restore 对称性。

不绑定具体 RISC-V SoC、开发板或 timer 外设实现。

### 6. Queue、ISR 路径与 Queue Set

中心问题：Queue 如何同时管理数据、等待任务和 ISR 与任务之间的并发？

主要源码：`include/queue.h`、`queue.c`、`tasks.c`。

核心内容：`Queue_t`、存储区和读写指针，发送与接收快速路径，满/空时的阻塞与超时，事件链表，scheduler suspend，queue lock，FromISR 路径和 `pxHigherPriorityTaskWoken`，Queue Set 如何复用 queue 机制实现多对象等待。

### 7. 信号量、互斥锁与优先级继承

中心问题：信号量和互斥锁为什么共享 Queue_t，却具有不同的所有权和调度语义？

主要源码：`include/semphr.h`、`queue.c`、`tasks.c`。

核心内容：binary/counting semaphore、mutex holder、recursive mutex、`uxMutexesHeld`、优先级继承、释放时降级、等待超时后的部分降级，以及 priority inheritance 能解决和不能解决的问题。

### 8. 任务通知与 Event Group

中心问题：不使用完整 Queue 时，FreeRTOS 如何实现轻量级单任务通知和多任务 bit 条件等待？

主要源码：`tasks.c`、`include/task.h`、`event_groups.c`、`include/event_groups.h`。

核心内容：notification state/value、不同 `eNotifyAction`、wait/take、FromISR 通知、Event Group 的 wait-all/wait-any、clear-on-exit、控制位编码和 scheduler suspended 扫描。

不写机制选型清单，直接通过对象模型和调用路径解释两者边界。

### 9. Stream Buffer 与 Message Buffer

中心问题：FreeRTOS 如何用同一个环形缓冲核心分别表达字节流和有边界消息？

主要源码：`stream_buffer.c`、`include/stream_buffer.h`、`include/message_buffer.h`。

核心内容：head/tail、空槽约束、分段复制、trigger level、消息长度头、发送和接收阻塞、single-writer/single-reader 契约、ISR 完成回调，以及内部任务通知的使用方式。

### 10. 软件定时器与 Timer daemon

中心问题：软件定时器命令如何从调用者进入 daemon task，并最终变成 callback 执行？

主要源码：`timers.c`、`include/timers.h`、`queue.c`、`tasks.c`。

核心内容：timer command queue、`Timer_t`、active/overflow timer list、daemon 启动、start/reset/change/stop/delete 命令、到期计算、auto reload、callback 串行执行和 ISR 命令路径。

### 11. 静态分配与 heap_1 到 heap_5

中心问题：FreeRTOS 的对象内存来自哪里，五种 heap 实现分别提供什么分配、释放和碎片行为？

主要源码：`include/portable.h` 和 `portable/MemMang/heap_1.c` 至 `heap_5.c`。

核心内容：静态对象内存归属，动态创建和删除路径，块头与对齐，heap_1 bump allocation，heap_2 按大小链表且不合并，heap_3 libc 包装，heap_4 地址有序链表与相邻合并，heap_5 region 定义与边界，以及各实现实际提供的统计能力。

### 12. 源码与工程面试专题

中心问题：如何从源码事实回答 FreeRTOS 工程问题，而不是背诵 API 结论？

问题范围包括任务状态、调度和 Tick，两种架构的 context switch，Queue、信号量、mutex、notification 和 Event Group，ISR API 与优先级边界，内存所有权与碎片，以及实际系统中的优先级反转、超时、丢事件和资源回收。

每个问题使用真实工程场景，引用准确源码位置，给出完整推导和错误答案分析。问题之间可以跨模块，但不重复前 11 篇正文。

## 写作标准

### 不使用数量配额

不规定文章行数、二级标题数量、源码片段数量、表格数量、Mermaid 数量或图片数量。完成标准是中心问题已经被源码闭合，而不是达到某个数量门槛。

### 沿源码推进

正文按实际控制流组织。一个函数调用另一个函数时，先说明传入条件，再解释被调用函数改变的对象，最后回到调用者判断返回值如何影响后续执行。

不能把同一段信息拆成“入口条件、执行动作、状态变化、观察证据”等固定字段，也不能把这些字段换成表格继续使用。

### 源码摘录

只截取理解当前判断所需的连续代码。摘录必须保留决定行为的特殊分支，不能为了缩短代码而删掉会改变结论的路径。

每组摘录注明 FreeRTOS-Kernel 版本、文件和函数、相关配置条件以及 V11.3.0 fixed-tag permalink。新增注释要明确是文章注释，不得伪装成上游源码。

### 表格与图示

表格只用于确实需要横向比较的数据，例如五种 heap 的能力差异或不同 port 的上下文组成。

Mermaid 只在调用链、状态迁移或对象关系仅靠文字难以保持清晰时使用。能够用两段文字讲清楚的内容不作图。不设置视觉点配额，不生成装饰性图片。

### 平台边界

只有第 4、5 篇详细讨论平台机制。其他文章使用公共内核语义，不依赖 Cortex-M 或 RISC-V 异常名称、寄存器和中断屏蔽模型。

第 12 篇面试专题可以比较两种 port，但必须明确公共内核契约与架构实现的边界。

## 编写顺序与审核方式

1. 删除现有 15 篇文章并重写系列框架；
2. 只编写第 1 篇样稿；
3. 人工检查文章是否连续、准确、无模板痕迹；
4. 用户确认样稿写法；
5. 按顺序逐篇编写后续文章，每完成一篇单独复核。

不再一次性批量生成整套文章。

## 测试策略

自动测试只检查可以机械验证的事实：frontmatter、series 和 order，文件顺序，固定源码版本和 permalink，公共文章的平台边界，已知模板字段和空表，以及 Mermaid 和站点构建。

测试不检查行数、标题数、源码片段数、图数量或固定章节名称。技术准确性和可读性必须通过源码复核与人工阅读判断。

## 暂不纳入主线

以下主题不塞入这 12 篇主线：MPU wrapper 的完整安全模型、SMP 调度和 affinity、Tickless idle、trace recorder 与运行时统计体系。

这些内容可以在核心系列完成后单独规划进阶篇，避免主线在过多概念之间跳跃。