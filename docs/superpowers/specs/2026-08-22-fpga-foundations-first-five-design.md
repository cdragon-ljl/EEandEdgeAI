# FPGA 基础阶段首批五篇写作与站点接入设计

## 目标

基于 `docs/articles/fpga/fpga-xc7z020-framework.md` 的规划，首批完成 FPGA-01 至 FPGA-05，并把 FPGA 注册为网站的一级文章系列。

这五篇不是互相独立的概念文章，而是一段连续学习路径：

```text
理解 FPGA 的执行模型
    ↓
理解组合逻辑与时序逻辑
    ↓
理解状态机如何组织硬件控制
    ↓
理解逻辑如何映射到 FPGA 资源
    ↓
使用 Verilog 写出并验证第一批 RTL
```

读者完成后应具备继续学习 SystemVerilog、testbench、波形调试和 Vivado 工程的认知基础。

## 读者与平台假设

读者具备 C/C++、MCU、ARM、RTOS 或嵌入式 Linux 经验，但可以没有数字电路、RTL 和 FPGA 基础。

硬件主线固定为 Zynq-7000 `xc7z020`。前五篇不依赖具体开发板型号、LED 引脚、晶振频率或 Vivado board file：

- FPGA-01 至 FPGA-04 主要建立硬件模型，通过表格、时序推演和结构图验收。
- FPGA-05 使用参数化 RTL 和 testbench，优先通过 Icarus Verilog 与 GTKWave 验证。
- LED 闪烁模块只描述逻辑和仿真，不写未经确认的 XDC 引脚。
- 绑定真实 xc7z020 板卡的引脚、电气标准和时钟参数留到 Vivado/XDC 阶段。

## 写作方向选择

采用学习手册式写法，不采用知识词典式或纯实验驱动式。

每篇只围绕一条核心问题链展开，控制二级标题数量，避免在多个概念之间来回跳转。概念出现顺序必须服务后续推导；代码和实验用于证明前文结论，而不是独立堆放。

## 篇目设计

### FPGA-01：为什么嵌入式软件工程师要学 FPGA

文件：`fpga-01-why-embedded-engineers-learn-fpga.md`

核心问题是软件执行模型与可重构硬件执行模型的差异。

内容链路：

1. 从 MCU 顺序执行和中断响应出发，解释时间复用。
2. 用多个逻辑通路同时工作的例子解释空间展开。
3. 区分 FPGA、MCU、CPU、GPU 与 ASIC 的工程角色。
4. 解释寄存器、中断、DMA 和总线在 RTL 中的来源。
5. 把 FPGA 原型映射到芯片软件、KMD/UMD、Runtime 和验证岗位。
6. 建立 xc7z020 的 PS/PL 总体定位，但不提前展开 Vivado 操作。
7. 以“可被 Linux 驱动访问的最小加速器”定义系列终点。

验收不要求开发工具，要求读者能把一个嵌入式任务拆为软件控制面与可并行硬件数据面，并解释为什么某些任务适合 PL。

### FPGA-02：数字电路基础

文件：`fpga-02-combinational-sequential-logic-registers.md`

核心问题是输出由当前输入决定，还是由输入与历史状态共同决定。

内容链路：

1. 从布尔值和真值表建立与、或、非、异或。
2. 通过 mux、decoder 和 encoder 解释组合逻辑网络。
3. 从“需要记住上一拍”引出 latch、D 触发器和寄存器。
4. 解释时钟边沿、同步复位和异步复位的工程含义。
5. 完整解释 setup time、hold time、clock-to-Q 和时序余量。
6. 用异步输入进入时钟域的例子解释亚稳态与两级同步器边界。
7. 将控制位、状态位和寄存器组关联到后续 MMIO 外设。

验收包括真值表推导、若干拍时序推演和 CDC 风险判断，不提前依赖 Verilog 语法。

### FPGA-03：状态机 FSM

文件：`fpga-03-fsm-hardware-control.md`

核心问题是如何把一个有步骤、有等待、有异常的硬件任务变成确定的控制逻辑。

全篇使用一个最小加速器任务控制器贯穿：`IDLE → LOAD → EXECUTE → WRITEBACK → DONE/ERROR`。

内容链路：

1. 从流程图与软件状态变量引出硬件 FSM。
2. 拆分状态寄存器、下一状态组合逻辑和输出逻辑。
3. 对比 Moore 与 Mealy 输出，说明组合路径和时序代价。
4. 定义开始、忙、完成、超时和错误信号的优先级。
5. 处理复位、非法状态恢复、单周期脉冲和重复启动。
6. 用状态表、状态图和逐拍轨迹验证设计。
7. 映射到 UART、DMA 与 NPU/GPU command scheduler。

验收要求读者从文字需求独立写出状态表，并识别漏转移、无默认分支、输出毛刺和无法恢复的设计。

### FPGA-04：FPGA 内部资源

文件：`fpga-04-resources-lut-ff-bram-dsp-clock-io.md`

核心问题是 RTL 最终落到什么物理资源，以及资源与性能为何需要共同预算。

内容链路：

1. 从组合逻辑和状态映射到 LUT 与 FF。
2. 解释 distributed RAM、BRAM 和外部 DDR 的容量/带宽/时延边界。
3. 解释 DSP48E1 适合乘加、累加和定点数据通路的原因。
4. 解释全局时钟、PLL/MMCM、clock enable 与门控时钟风险。
5. 解释 IO Bank、电压标准和引脚约束为何属于硬件契约。
6. 用一个小型流式向量/滤波加速器做资源分配练习。
7. 说明 utilization 与 timing summary 应如何一起阅读。

具体 xc7z020 资源数量只使用 AMD 官方数据表中的数值；器件、封装和速度等级相关参数必须标明适用范围。

### FPGA-05：Verilog 入门

文件：`fpga-05-verilog-module-wire-reg-always-assign.md`

核心问题是如何把前四篇的硬件结构写成可综合、可仿真的 RTL。

内容链路：

1. 从硬件边界解释 `module`、端口和参数。
2. 解释 net 与 variable 语义，以及 Verilog 中 `wire`/`reg` 的边界。
3. 使用 `assign` 和组合 `always` 描述组合逻辑。
4. 使用时钟 `always` 与非阻塞赋值描述寄存器和计数器。
5. 对比阻塞赋值 `=` 与非阻塞赋值 `<=`，展示错误波形。
6. 区分可综合 RTL 与只用于 testbench 的延时、initial 和系统任务。
7. 实现参数化计数器、LED 闪烁逻辑及自检 testbench。
8. 给出 Icarus Verilog 编译、运行、VCD 生成和 GTKWave 查看步骤。

验收要求代码能通过命令行仿真，testbench 自动判断计数与翻转行为，不以“波形看起来正确”作为唯一证据。

## 单篇结构与深度

每篇文章采用约 6 至 8 个二级标题，允许使用三级标题完成局部展开。建议顺序为：

1. 问题与学习边界。
2. 从读者已有的软件经验建立模型。
3. 原理递进与关键推导。
4. 与芯片软件、驱动或加速器的关系。
5. 可验证练习、代码或仿真。
6. 常见错误与排查。
7. 阶段验收与面试表达。

硬性质量门槛：

- 每篇不少于约 350 行有效 Markdown。
- 每篇至少 5 个 Mermaid 图，图必须承担结构、时序、状态或数据流解释任务。
- 每篇包含代码、命令、真值表、状态表或逐拍验证中的至少两类证据。
- 每篇有明确的阶段验收和面试表达，但不写逐篇预告。
- 二级标题不得把单个名词拆成彼此孤立的短节。

## 正确性与资料边界

具体器件和工具事实优先核对以下一手资料：

- AMD/Xilinx Zynq-7000 SoC Technical Reference Manual。
- AMD/Xilinx 7 Series CLB、Memory Resources、DSP48E1、Clocking Resources 和 SelectIO 用户指南。
- AMD/Xilinx Vivado Design Suite User Guide: Synthesis。
- Icarus Verilog 与 GTKWave 官方文档。
- Verilog 标准语义；无法访问标准原文时，只陈述可由工具实验和 AMD 综合文档验证的部分。

不写未经确认的板卡引脚、时钟频率、封装资源或 Vivado 版本特性。所有版本相关命令必须说明适用条件。

## 写作红线

正文不得包含思考过程、草稿语句、逐篇预告、完整系列目录或固定篇数宣传。不得使用 `Part A/B/C` 指代学习阶段，不在正文中点名其他文章编号。

完成后检查以下高风险词：

```text
等等 / 让我 / 不对 / 记错 / 嗯 / 哦 / Hmm / 草稿 / 思考
Part A / Part B / Part C / 下一篇 / 下一章 / 预告 / FPGA-NN
```

普通技术语义中的“等待”“思考方式”等词需要人工复核，不能只做机械删除。

## 站点接入

FPGA 作为第十个一级系列注册，建议位于 RISC-V 之后、Zephyr 之前：

```text
cuda → ee-system → rknn → riscv → fpga → zephyr → bsp → usb → pcie → video-audio
```

系列元数据：

- ID：`fpga`
- 标题：`FPGA 与芯片原型验证实战`
- 短标题：`FPGA / Zynq`
- 标签：`硬件原型`
- 路由：`/fpga/`
- 描述：突出 RTL、Zynq PS/PL、AXI、Linux 驱动访问 PL 与加速器原型。
- 封面：将本地 `covers/fpga.png` 压缩为 `public/covers/fpga.webp`，尺寸保持 `1921×819`。

封面继续采用已确认的 A 布局：首页完整宽幅系列卡片，系列页无裁切横幅，文章详情页不重复展示。

规划文件增加 `series: fpga`、`draft: true` 前置元数据，并在内容 loader 中明确排除 `fpga-xc7z020-framework.md`，避免规划内容成为公开文章。

## 测试与验收

自动测试需要验证：

- `fpga` 已进入内容 loader、schema、`SeriesId`、`SERIES_ORDER` 和类型守卫。
- FPGA 系列封面存在、尺寸元数据正确且被首页与系列页复用。
- 规划文件被明确排除。
- 首批恰好有 5 篇发布文章，`order` 连续为 1 至 5。
- 每篇满足前置元数据、最低篇幅、Mermaid 数量和红线检查。
- FPGA-05 包含可综合 RTL、自检 testbench 和 Icarus Verilog 命令。

站点构建需要生成 `/fpga/` 与 5 个文章页面，并完成 Pagefind 索引。桌面端和移动端检查封面比例、标题可读性、文章卡片布局与正文 Mermaid 渲染。

## 本轮非目标

- 不编写 FPGA-06 及后续文章。
- 不绑定具体 xc7z020 开发板的 XDC 引脚。
- 不创建完整 Vivado 工程、bitstream 或硬件实测数据。
- 不修改已有 RISC-V 系列文章，即使其中包含 Zynq 与软核内容。
