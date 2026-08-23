# FreeRTOS 内核源码解读系列设计

## 1. 目标与边界

本系列定名为《FreeRTOS 内核源码解读：从任务创建到上下文切换》，面向具备 C 语言、裸机或基础 RTOS 使用经验，希望系统理解 FreeRTOS 内部实现的嵌入式工程师。

系列的核心不是罗列 API，也不是围绕某块开发板搭建应用，而是沿真实执行链阅读 FreeRTOS-Kernel 源码：

- 一个任务如何创建、初始化并进入就绪队列；
- 调度器如何启动、选择任务、处理 Tick、阻塞和唤醒；
- 队列、信号量、互斥锁、任务通知和事件组如何复用内核对象；
- Stream Buffer、Message Buffer 和软件定时器如何运行；
- heap_1 到 heap_5 如何实现不同的内存策略；
- 公共内核如何通过 portable 层落到 Cortex-M4 和 RISC-V；
- MPU、SMP、低功耗和调试机制如何扩展经典单核内核。

公共内核部分保持平台无关，不绑定 MCU、开发板、HAL、IDE、引脚或外设。只有移植层文章进入 Cortex-M4 和 RISC-V 的架构细节。

## 2. 固定源码版本与权威来源

所有源码分析固定到 `FreeRTOS-Kernel V11.3.0`，不引用随时变化的 `main` 分支。该版本属于 FreeRTOS `202604-LTS`，便于稳定引用宏分支、结构体、函数和 GitHub 行锚点。

主要来源：

- [FreeRTOS-Kernel V11.3.0](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0)
- [FreeRTOS 202604-LTS](https://github.com/FreeRTOS/FreeRTOS-LTS)
- [FreeRTOS Kernel Book](https://github.com/FreeRTOS/FreeRTOS-Kernel-Book)
- [GCC ARM_CM4F port](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0/portable/GCC/ARM_CM4F)
- [GCC RISC-V port](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/V11.3.0/portable/GCC/RISC-V)
- Arm Cortex-M4 架构与异常模型官方文档
- RISC-V Privileged Architecture 官方规范

涉及行为结论时必须同时核对公共内核、目标 port 和官方架构文档。不能从单个函数片段推断跨上下文行为，也不能把某个 vendor fork 的实现写成上游 FreeRTOS 行为。

## 3. 内容组织方案

系列采用“执行链驱动主线 + 源码索引辅助”的组织方式。

正文按系统运行过程展开，不按源文件顺序做百科式介绍。每篇围绕一个较大的机制，跟踪公开 API、内部静态函数、数据结构、链表变化、临界区和 portable hook。文章末尾再提供本篇涉及的文件、结构体、函数、配置宏和官方链接索引。

单核调度器是公共主线。MPU 和 SMP 不贯穿基础文章，避免每个函数同时展开多套条件编译路径；它们在最后的进阶文章中单独解释。

## 4. 系列结构

系列规划为 8 个技术阶段、12 篇源码长文，并追加 3 篇面试专题，共 15 篇。规划文件本身使用 `draft: true`，正文使用连续的 `order: 1` 到 `order: 15`。

### 阶段一：源码地图与基础设施

#### 01. 源码地图与阅读方法：FreeRTOS-Kernel 是怎样组织起来的

文件：`freertos-01-kernel-source-map-config.md`

核心内容：

- V11.3.0 目录结构和公共内核与 `portable` 的边界；
- `FreeRTOSConfig.h` 如何通过条件编译改变内核；
- 基础数据类型、命名方式、宏、断言和 trace hook；
- 从公开 API 找到内部函数、数据结构和 port hook；
- 建立后续文章统一使用的源码索引与调用链记录方法。

实践结果：能够从一个 API 入口画出“公开头文件 -> 公共内核 -> portable 层”的最小调用图，并解释配置宏为何是源码阅读的一部分。

### 阶段二：任务生命周期与调度器

#### 02. 链表、TCB 与任务创建：一个任务如何进入就绪队列

文件：`freertos-02-list-tcb-task-creation.md`

核心内容：

- `list.c/list.h` 中 `List_t`、`ListItem_t` 和 `MiniListItem_t`；
- 初始化、有序插入、尾部插入、删除、owner 和 item value；
- `TCB_t` 内嵌的状态链表项和事件链表项；
- 动态和静态任务创建路径；
- `xTaskCreate`、内部创建函数、任务初始化、初始栈和 ready list；
- 调度器已运行时创建高优先级任务的抢占条件。

实践结果：手工追踪两个不同优先级任务创建后各个链表的节点、owner、value 和索引位置。

#### 03. 调度器完整运行链：启动、Tick、阻塞、唤醒与任务销毁

文件：`freertos-03-scheduler-tick-task-lifecycle.md`

核心内容：

- `vTaskStartScheduler` 的初始化和 portable 交接；
- ready、delayed、overflow delayed、pending ready、suspended 和 termination lists；
- `vTaskSwitchContext`、最高优先级选择、抢占和时间片；
- `xTaskIncrementTick`、延时链表交换和任务解阻塞；
- relative delay、absolute delay、timeout、suspend 和 resume；
- task delete、Idle task 延迟回收和任务生命周期闭环。

实践结果：重建一次“运行 -> 延时 -> Tick 解阻塞 -> 抢占 -> 删除 -> Idle 回收”的完整时间线。

### 阶段三：移植层与上下文切换

#### 04. 移植层契约与 Cortex-M4 上下文切换

文件：`freertos-04-cortex-m4-port-context-switch.md`

核心内容：

- `port.c/portmacro.h` 必须向公共内核提供的契约；
- Cortex-M4 初始任务栈帧；
- SVC 启动首个任务；
- PendSV 保存与恢复上下文；
- SysTick 到调度请求的路径；
- PRIMASK、BASEPRI、临界区和可调用 RTOS API 的中断优先级；
- EXC_RETURN、硬件自动压栈和浮点上下文。

实践结果：按指令顺序标注一次任务切换前后的 PSP、通用寄存器、异常栈帧和 `pxCurrentTCB` 变化。

#### 05. RISC-V 移植层：trap、Tick 与上下文保存

文件：`freertos-05-riscv-port-trap-context-switch.md`

核心内容：

- GCC RISC-V `port.c`、`portASM.S` 和 port macro；
- 初始任务上下文和首任务启动；
- trap 入口、通用寄存器和关键 CSR 保存；
- Tick 来源与平台提供接口；
- 中断退出和任务切换；
- 与 Cortex-M4 的自动压栈、异常返回和中断屏蔽方式对照；
- 新架构 port 的检查清单。

实践结果：用同一张上下文切换清单比较 Cortex-M4 和 RISC-V，明确公共内核保持不变而 port 必须实现的部分。

### 阶段四：线程通信与同步

#### 06. 队列源码全链路：创建、发送、接收、阻塞与 ISR 路径

文件：`freertos-06-queue-send-receive-isr.md`

核心内容：

- `Queue_t`、存储区、读写位置和等待任务链表；
- queue create 与静态/动态存储；
- send to back、send to front 和 overwrite；
- receive、peek、阻塞、timeout 和唤醒；
- `FromISR` 路径与是否需要 yield；
- `cTxLock/cRxLock` 的延迟解锁机制；
- queue reset、delete 和状态不变量。

实践结果：跟踪一个满队列上发送者阻塞、接收者取走元素、发送者被唤醒的完整链表和数据指针变化。

#### 07. 信号量与互斥锁：同一个 Queue_t 如何实现不同同步语义

文件：`freertos-07-semaphore-mutex-priority-inheritance.md`

核心内容：

- binary/counting semaphore 如何复用 queue；
- mutex holder、recursive count 和所有权；
- priority inheritance、timeout 和 disinherit；
- 多 mutex 场景的继承边界；
- ISR 可以使用哪些同步对象；
- 信号量、互斥锁和队列的内部差异与选择原则。

实践结果：用低、中、高三个优先级任务重建一次优先级反转、继承和恢复过程。

#### 08. 任务通知、事件组与 Queue Set：轻量同步机制如何实现

文件：`freertos-08-task-notification-event-group-queue-set.md`

核心内容：

- TCB notification 数组、状态和值；
- notify、take、wait、clear 和 ISR 路径；
- event group 的位等待、clear 语义和同步屏障；
- event bits 与控制位的边界；
- queue set 如何转发成员可读事件；
- notification、event group、queue set 的内存、唤醒和表达能力对比。

实践结果：为三个通信场景选择最小内核对象，并从源码证明选择理由。

### 阶段五：流式通信与软件定时器

#### 09. Stream Buffer、Message Buffer 与软件定时器

文件：`freertos-09-stream-message-buffer-software-timer.md`

核心内容：

- `stream_buffer.c` 的环形缓冲、head/tail、space 和 trigger level；
- 单写者/单读者契约及其并发边界；
- message buffer 的长度字段和原子消息语义；
- `Timer_t`、timer command queue 和 timer service task；
- active/overflow timer lists、到期处理和 callback 上下文；
- pended function call 和 timer API 的异步语义。

实践结果：分别重建一段字节流跨越缓冲区回绕，以及 timer command 从调用者进入 daemon 并执行 callback 的时间线。

### 阶段六：内存管理

#### 10. 内存管理：静态分配与 heap_1 到 heap_5 源码比较

文件：`freertos-10-memory-management-heap-one-to-five.md`

核心内容：

- `pvPortMalloc/vPortFree` 与内核对象分配契约；
- 静态任务、队列、timer 和 Idle/Timer task memory hooks；
- heap_1 到 heap_5 的适用条件和限制；
- heap_4 空闲链表、对齐、block split 和 adjacent block coalescing；
- heap_5 多区域初始化与地址排序；
- 碎片、分配失败、统计和并发保护。

实践结果：对同一分配/释放序列手工推演 heap_2、heap_4 和 heap_5 的空闲块变化。

### 阶段七：可靠性、低功耗与调试

#### 11. 可靠性、低功耗与内核调试

文件：`freertos-11-reliability-tickless-trace-debug.md`

核心内容：

- scheduler suspend、critical section 和 interrupt mask 的边界；
- `configASSERT`、stack overflow、malloc failed、Idle/Tick hooks；
- stack high-water mark 与任务状态快照；
- tickless idle 决策、预期空闲时间和 portable sleep hook；
- trace macros、run-time stats 和内核感知调试；
- 死锁、活锁、优先级反转和长临界区的取证顺序。

实践结果：为调度、队列、内存和 Tick 建立一套不改变核心语义的观测点，并生成可关联的事件记录。

### 阶段八：MPU、SMP 与综合源码实验

#### 12. MPU、SMP 与综合源码观测实验

文件：`freertos-12-mpu-smp-kernel-observability.md`

核心内容：

- MPU wrapper、特权/非特权任务、系统调用和内存区域；
- 单核主线与 `configNUMBER_OF_CORES > 1` 条件分支；
- task affinity、跨核调度、yield 和 scheduler lock；
- SMP 不是简单复制单核调度器的原因；
- 综合实验：为 task、queue、ISR、Tick 和 context switch 加入 trace；
- 从 trace 重建一条跨公共内核与 port 的完整执行链。

实践结果：形成一份可查询的源码地图、调用链、事件时间线和配置清单，能够解释单核、MPU 和 SMP 的职责边界。

### 面试专题：源码理解与工程应用

面试专题不重复前面文章的章节摘要。每个问题都从实际故障、设计取舍或调试现场出发，回答必须同时给出源码证据、运行机制、工程判断和追问扩展。

#### 13. FreeRTOS 任务、调度与上下文切换面试专题

文件：`freertos-13-interview-task-scheduler-context-switch.md`

核心场景：

- 高优先级任务已经 ready，为什么仍未立即运行；
- `vTaskDelay` 与 `vTaskDelayUntil` 在周期任务中如何选择；
- 同优先级任务在抢占、时间片和主动 yield 下如何切换；
- Tick 计数溢出后延时任务为什么仍能正确唤醒；
- 调度器挂起和中断关闭为何不是同一个概念；
- Cortex-M4 的 SVC、PendSV、SysTick 如何协作完成首任务启动和上下文切换；
- RISC-V trap 路径与 Cortex-M 异常路径有哪些本质差异；
- 删除当前任务后，栈和 TCB 为什么不能当场释放。

回答要求：每题至少给出状态或时序图、关键结构体字段、入口到内部函数的调用链、适用配置宏、易混淆回答和工程追问。

#### 14. FreeRTOS 通信、同步与内存管理面试专题

文件：`freertos-14-interview-ipc-synchronization-memory.md`

核心场景：

- queue、task notification、stream buffer 和 message buffer 如何选；
- 二值信号量、计数信号量和 mutex 为何共享 `Queue_t` 却语义不同；
- 优先级反转何时发生，priority inheritance 能解决什么、不能解决什么；
- ISR 中为什么不能使用普通阻塞 API，`pxHigherPriorityTaskWoken` 如何参与切换；
- event group 等待多个 bit 时，clear-on-exit 如何影响并发任务；
- queue 满或空时，任务如何进入事件链表并在超时/事件到达后退出；
- heap_2 与 heap_4 的碎片行为为何不同；
- 静态分配、heap_4、heap_5 在产品中的选择依据。

回答要求：每题从对象数据结构和阻塞/唤醒链路证明结论，并给出错误设计的后果、修复方案和资源取舍。

#### 15. FreeRTOS 移植、可靠性与系统设计面试专题

文件：`freertos-15-interview-porting-reliability-system-design.md`

核心场景：

- 一个新架构 port 最少要实现哪些契约；
- 中断优先级配置错误为何会表现为随机崩溃或链表损坏；
- 如何从 HardFault、栈水位、`configASSERT` 和 trace 判断栈溢出；
- tickless idle 如何计算可睡眠时间，哪些条件会提前退出；
- 软件定时器 callback 阻塞会影响哪些任务；
- 如何定位死锁、活锁、长临界区和调度延迟尖峰；
- MPU 与 SMP 分别解决什么问题，引入了哪些内核复杂度；
- 如何设计“ISR 采集数据 -> 任务处理 -> 超时恢复 -> 低功耗”的完整 RTOS 系统。

回答要求：每题包含排查顺序、需要采集的证据、源码落点和设计权衡；综合设计题必须给出任务划分、优先级、通信对象、内存策略和失败恢复。

## 5. 单篇写作标准

每篇不设置行数目标，以机制完整、叙事连续和源码证据充分为验收标准。文章使用 6 到 9 个二级标题，避免把函数逐个拆成互不相连的小节，也禁止用固定字段模板重复同一信息。

每篇必须包含：

- 一个明确的核心问题；
- 至少两条完整调用链；
- 4 到 8 组关键源码片段；
- 关键结构体、链表、状态和锁范围说明；
- 配置宏与编译分支矩阵；
- 至少一个可重复的观测或推演实验；
- 常见误读、排错顺序、阶段验收和面试表达；
- 文件、结构体、函数、宏和官方链接组成的源码索引。

## 6. 源码截取与注释规范

源码片段只截取解释当前机制所需的关键分支，不复制整个大型函数。每个片段必须注明：

- 版本 `V11.3.0`；
- 文件路径；
- 函数或宏名称；
- 生效的关键配置条件；
- GitHub 固定 tag 的 permalink。

注释必须区分原始源码和作者解读。可以在截取代码中添加带统一前缀的短注释，也可以在代码后按行组解释，但不能改写源码后仍声称是原文。涉及大量样板代码时使用等价伪代码和调用链说明。

## 7. 图示与图片 prompt 规范

不使用 ASCII 图。

以下内容直接使用 Mermaid：

- 函数调用链；
- 任务状态机；
- 链表和对象关系；
- 队列阻塞与唤醒时序；
- Tick、timer daemon 和上下文切换时序；
- 内存块分裂与合并流程。

以下内容可以保留隐藏的 `IMAGE_PROMPT` HTML 注释，供后续单独生成图片：

- Cortex-M4 硬件异常栈帧；
- RISC-V trap 上下文布局；
- CPU 寄存器保存位置；
- MPU region 和权限关系；
- SMP 多核调度示意。

每篇至少规划 5 个视觉点，其中至少 3 个为可直接渲染的 Mermaid。图片 prompt 必须写清主体、布局、标签、配色、比例和禁止项，且不作为网页可见正文发布。

## 8. 网站接入设计

文章目录：`docs/articles/freertos/`

规划文件：`docs/articles/freertos/freertos-kernel-framework.md`

系列 ID：`freertos`

站点标题：`FreeRTOS 内核源码解读`

短标题：`FreeRTOS`

描述：`沿真实调用链拆解任务、调度、通信、同步、内存管理与 Cortex-M4/RISC-V 移植层。`

站点顺序放在 `Embedded Systems` 之后、`RISC-V` 之前。封面路径使用 `/covers/freertos.webp`，尺寸和构图比例遵循现有系列封面规范；正式注册系列前必须准备可构建的 WebP 封面。

内容集合需要把 `freertos` 加入 glob、schema、`SeriesId`、`SERIES`、`SERIES_ORDER` 和 `isSeriesId`。

## 9. 测试与验收契约

新增 `tests/freertos-articles.test.mjs`，至少验证：

- 15 篇正文和 1 个 draft framework 文件数量准确；
- 文件名、order、series、draft 状态连续且唯一；
- 每篇满足长文、二级标题、Mermaid、源码索引、阶段验收和面试表达要求；
- 所有文章明确引用 V11.3.0，关键源码文件与文章主题匹配；
- Cortex-M4 port 文章包含 SVC、PendSV、SysTick、BASEPRI 和上下文栈；
- RISC-V port 文章包含 trap、CSR、portASM 和上下文保存；
- 公共内核文章不依赖具体 MCU、开发板、HAL 或 IDE；
- MPU、SMP 只在进阶文章中系统展开，基础文章保持单核主线；
- 3 篇面试专题均包含实际场景、源码证据、详细回答、错误答案辨析和追问扩展；
- 禁止草稿口吻、逐篇预告、正文文章编号和虚构运行结果；
- 站点注册、封面、路由和生产构建通过。

发布前执行全仓测试、生产构建，并在桌面与 390px 移动端检查系列页、至少一篇公共内核文章、两个 port 文章和最终进阶文章。所有 Mermaid 必须生成非空 SVG，页面不能横向溢出。

## 10. 非目标

本系列不负责：

- 从零教授 C 语言；
- 介绍 STM32 HAL、CubeMX、具体开发板外设和引脚；
- 罗列全部 FreeRTOS API；
- 展开 FreeRTOS+TCP、MQTT、OTA 等外围库；
- 深入 vendor fork，例如 ESP-IDF FreeRTOS；
- 伪造硬件时序、性能数据或未执行的实验结果。
