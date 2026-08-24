# FreeRTOS 源码系列深化设计

## 目标与读者

保持现有 12 篇主题、顺序和 FreeRTOS-Kernel V11.3.0 源码基线不变，将系列从“能跟随源码结论”深化为“使用过基础 API 的读者可以独立建立内核模型并复核执行路径”的学习手册。

读者已经使用过 `xTaskCreate`、Queue、Semaphore 等基础 API，但不了解 TCB、内核链表、调度器、portable 层和对象生命周期。文章不从 C 语言或 RTOS 通识重新讲起，也不假设读者已有源码阅读经验。

## 统一学习逻辑

每篇从熟悉的 API 或故障现象进入，先说明当前机制要解决的问题，再建立对象关系和完整执行路径，随后沿固定版本源码追踪正常、阻塞、超时、ISR 或回收分支。每篇使用一个具体场景持续推演任务优先级、Tick、链表归属、对象字段和返回值，最后给出调试器中可以观察的证据。

这是一套学习逻辑，不是固定排版模板。文章标题、章节数量和段落组织必须服从各自机制，不重复使用“入口条件、执行动作、状态变化、观察证据”等字段，也不设置字数、代码块、表格或 Mermaid 配额。

## 逐篇深化范围

1. **List 内核容器**：补链表术语、哨兵设计、`pxIndex` 游标、稳定插入、owner/container 双向关系、具体节点值推演和调试观察。
2. **TCB 与任务生命周期**：补任务创建参数到 TCB 的映射、栈深度单位、动态/静态失败回滚、初始上下文契约、发布边界、自删除与 Idle 清理时间线。
3. **调度器与 Tick**：补 ready bitmap、同优先级轮转、绝对/相对延时、双 delayed list 回绕、事件与超时双索引、scheduler suspend/pending-ready 的具体任务推演。
4. **Cortex-M4 port**：补异常自动压栈基础、PSP/MSP 与 EXC_RETURN、初始伪造帧、SVC 首任务、PendSV 汇编逐段解释、BASEPRI 和 ISR 优先级判断。
5. **RISC-V port**：补 ABI/CSR 基础、context slot 布局、初始 `mstatus/mepc`、trap 保存与 ISR stack、ecall 与 timer 的返回地址差异、扩展上下文对称性。
6. **Queue**：补环形缓冲具体地址推演、创建内存布局、发送/接收快速路径、检查到阻塞之间的竞态、queue lock 结算、FromISR yield、Queue Set 容量与消费协议。
7. **Semaphore 与 mutex**：补共享 `Queue_t` 的原因、count/ownership 差异、优先级反转时间线、继承和降级源码、多个 mutex 的限制、递归语义与调试字段。
8. **Notification 与 Event Group**：补 notification slot 状态机、各 `eNotifyAction` 的数据语义、wait/take 原子性、Event Group 条件编码与清位、ISR 延迟到 Timer daemon 的失败边界。
9. **Stream/Message Buffer**：补环形空间公式、分段拷贝逐值示例、消息长度头、阻塞与 trigger level、single-writer/single-reader 无锁前提、ISR callback 与多写者保护。
10. **软件定时器**：补 daemon 创建条件、command queue 容量、双 timer list、命令时间和到期时间、auto-reload 追赶、callback 串行阻塞影响、pended function 路径。
11. **内存管理**：补内核对象内存归属、对齐/header 开销、五种 heap 的具体块变化示例、heap_4/5 合并过程、碎片与统计解释、选择依据和错误释放边界。
12. **工程面试**：保留场景式问答，扩充答案推导、常见错误答案、源码证据和现场排查顺序，使问题同时考察 API 使用、源码机制和工程决策。

## 源码与表达约束

- 固定引用 V11.3.0 tag 和 commit `9b777ae5c5b8e9e456065a00294d1e5f5f9facf5`，不引用漂移的 `main` 行号。
- 摘录只保留影响当前结论的连续代码，中文注释明确标记为文章添加。
- 首次出现的内核术语用普通语言解释，再给出正式名称；不把英文符号简单翻译成另一个陌生词。
- 图只用于对象关系、调用链、状态迁移和上下文布局。能够靠连续文字清楚表达的内容不作图。
- 平台细节只在 Cortex-M4 和 RISC-V 两篇展开，其他文章保持公共内核语义。
- 不引入 MPU wrapper、SMP、Tickless idle、trace recorder 等原规划之外的进阶主题。

## 验证标准

- 12 篇 frontmatter、顺序、源码版本和站点注册保持不变。
- 每篇新增内容必须能回答一个初学者会提出的“为什么”，并能回到具体数据结构、函数或 port 契约验证。
- 全系列扫描拒绝旧模板字段、虚构性能数据和不带条件的平台结论。
- 自动测试、Astro check 和生产构建通过；抽查桌面与移动端长文、代码块和 Mermaid 不发生横向溢出。
