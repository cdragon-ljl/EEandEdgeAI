# FPGA-06～36 剩余系列写作设计

## 目标与范围

在已完成 FPGA-01～05 的基础上，按规划文件顺序完成 FPGA-06～36，共 31 篇文章。

文章必须形成连续学习路径：

```text
RTL 与仿真
    ↓
Vivado 与 Zynq PS/PL
    ↓
AXI 与自定义 IP
    ↓
Linux 驱动访问 PL
    ↓
硬件加速器原型
    ↓
验证、bring-up 与作品集
```

本轮只扩展 FPGA 系列，不重写已完成的前五篇，不修改 RISC-V、BSP、PCIe 或其他系列正文。

## 板卡中立原则

硬件器件固定为 Zynq-7000 `xc7z020`，但不假定具体开发板。

以下内容必须通过读者自己的原理图、器件封装、board file、硬件导出和 Vivado 报告发现：

- LED、按键、UART、时钟等 XDC 引脚；
- `IOSTANDARD` 与 IO Bank 电压；
- 板载晶振频率；
- Processing System preset；
- DDR 型号、宽度与时序参数；
- MIO/EMIO 分配；
- AXI 地址映射；
- 中断号；
- Linux 设备树中的 `reg`、`interrupts`、`clocks` 和 `memory-region`；
- bitstream、XSA 和软件平台的实际输出路径。

文章提供发现流程、校验命令和变量化模板。示例使用 `<BOARD_PART>`、`<PART>`、`<LED_PORT>`、`<CLOCK_PORT>`、`<BASE_ADDR>`、`<IRQ>` 等明显占位符，不给出虚构固定值。

需要真实板卡才能完成的步骤明确标注“需在当前板卡核实”。没有实测环境时，不声称下载成功、LED 点亮、DMA 正常或性能达到某个数值。

## 执行结构

剩余文章分为六个批次。每个批次完成后运行结构测试、红线扫描和站点构建，不等待人工逐批确认。

### 批次一：FPGA-06～10

目标是让读者能稳定写 RTL、构造验证环境并从波形定位问题。

- FPGA-06：同步/异步复位、counter、enable、register bank、单驱动原则。
- FPGA-07：组合 `always`、`case`、`if`、默认赋值、latch 与组合路径。
- FPGA-08：SystemVerilog `logic`、`always_ff`、`always_comb`、`enum`、`struct`、`interface` 的适用边界。
- FPGA-09：testbench 的时钟、复位、激励、monitor、reference model、自检与超时保护。
- FPGA-10：GTKWave/Vivado Simulator 中的时钟、状态、valid/ready、反压和错误定位。

该批次的代码保持可复制。没有本地仿真器时，只声明静态检查和站点构建结果。

### 批次二：FPGA-11～15

目标是建立 Zynq PS/PL 与 Vivado 工程闭环。

- FPGA-11：PS、PL、Cortex-A9、DDR、MIO/EMIO、GP/HP/ACP 接口及职责划分。
- FPGA-12：project/source/constraint/synthesis/implementation/bitstream/utilization/timing 流程。
- FPGA-13：PACKAGE_PIN、IOSTANDARD、create_clock、input/output delay 与原理图核对。
- FPGA-14：IP Integrator、ZYNQ7 Processing System、AXI interconnect、reset、wrapper 与 XSA。
- FPGA-15：PS GPIO 经 EMIO 到 PL 端口，配合 Baremetal 控制与板级验证证据。

所有 GUI 操作必须同时给出对象名称、前置条件和可检查结果，不写“点击几下即可”。能用 Tcl 表达的关键状态提供 Tcl 查询命令。

### 批次三：FPGA-16～21

目标是把软件寄存器访问和流式数据搬运还原成 AXI 协议。

- FPGA-16：AXI-Lite、AXI4 memory-mapped、AXI-Stream 与 valid/ready。
- FPGA-17：自定义 AXI-Lite 寄存器 IP、地址译码和访问语义。
- FPGA-18：MMIO、volatile、ioremap、readl/writel、side effect、W1C 与 polling。
- FPGA-19：PL 中断接入 PS GIC、触发类型、状态保持与 Linux IRQ 路径。
- FPGA-20：AXI-Stream、TLAST、TKEEP、反压和 FIFO。
- FPGA-21：AXI DMA MM2S/S2MM、simple/SG、DDR buffer、cache 一致性与错误恢复。

AXI 时序只引用 AMD/Arm 官方协议资料和 AMD IP 文档。示例必须区分协议规则、IP 配置与板级地址。

### 批次四：FPGA-22～26

目标是把 PL 外设纳入 Linux 设备模型和 DMA API。

- FPGA-22：从 Baremetal 物理地址访问转到设备树与 platform driver。
- FPGA-23：PL 外设的设备树 `compatible/reg/interrupts/clocks/reserved-memory`。
- FPGA-24：UIO mmap 与用户态中断，明确安全和工程边界。
- FPGA-25：字符设备、probe、MMIO、ioctl、poll、IRQ、wait queue 与任务生命周期。
- FPGA-26：coherent/streaming DMA、CMA、reserved memory、scatterlist、IOMMU 与用户 buffer 边界。

内核 API 以 Linux 官方文档与当前主线接口为依据。厂商 kernel 可能不同的地方明确标注版本边界，不编造 vendor 路径。

### 批次五：FPGA-27～31

目标是建立可被软件提交、等待、恢复和分析的最小硬件加速器模型。

- FPGA-27：command/status/address/length/IRQ/error/performance 寄存器与任务状态机。
- FPGA-28：向量加法数据通路、DMA 输入输出、Linux 提交、结果校验与测量方法。
- FPGA-29：3×3 滤波、line buffer、sliding window、pipeline、BRAM 复用与 AXI-Stream。
- FPGA-30：cycle/busy/stall/input-wait/output-wait 计数器与瓶颈归因。
- FPGA-31：Runtime、UMD、KMD、command buffer、DMA buffer、interrupt、fence、mmap、ioctl 与 profiling 的最小对应。

性能部分只提供测量设计、计数器定义和报告模板，不伪造加速倍数。CPU 与 PL 对比必须说明数据规模、时钟、DMA、缓存、预热和统计口径。

### 批次六：FPGA-32～36

目标是形成验证、原型 bring-up 和作品集闭环。

- FPGA-32：ILA probe、trigger、采样深度、AXI/IRQ/DMA 在线观察与软件日志对齐。
- FPGA-33：directed/random、assertion、scoreboard、reference model、回归和 CI。
- FPGA-34：RTL simulation、emulation、FPGA prototype、硅前验证与硅后 bring-up 的证据边界。
- FPGA-35：基于 xc7z020 的完整加速器参考工程架构、寄存器、RTL、驱动、Runtime、测试和交付清单。
- FPGA-36：README、架构图、寄存器规范、接口文档、性能报告、问题记录和面试表达。

综合项目是可实施参考设计，不声称已在未指定板卡上生成 bitstream 或取得硬件性能数据。

## 单篇质量标准

每篇文章遵循：

- `series: fpga`；
- `order` 连续为 6～36；
- `draft: false`；
- 不少于 350 行有效 Markdown；
- 至少 5 个承担解释任务的 Mermaid 图；
- 6～9 个二级标题；
- 包含代码、命令、状态表、寄存器表、时序表或测试结果模板中的至少两类证据；
- 包含“阶段验收”和“面试表达”；
- 不含思维草稿、逐篇预告、完整目录或正文文章编号引用。

文章应尽量围绕一个贯穿案例，避免为满足篇幅重复定义 LUT、AXI、DMA 等已建立概念。首次出现的新概念要定义，已介绍概念只补充当前场景需要的细节。

## 正确性资料层级

优先级从高到低：

1. AMD/Xilinx 官方器件、Vivado、Zynq 和 IP 文档；
2. Arm AMBA AXI 官方规范或官方概览；
3. Linux 官方驱动 API、DMA API、UIO、设备树和内核文档；
4. Icarus Verilog、Verilator、GTKWave、cocotb 官方文档；
5. 可在本地工具中复现的行为。

博客、论坛和二手教程不能作为寄存器、时序、API 或工具行为的唯一依据。

## 测试设计

`tests/fpga-articles.test.mjs` 扩展到 36 篇，并按批次加入专项断言：

- 06～10：RTL 与仿真关键词、自检和波形路径；
- 11～15：板卡占位符、Vivado/Tcl、XDC 与 XSA；
- 16～21：AXI 通道、握手、寄存器和 DMA；
- 22～26：设备树、UIO、platform driver 和 DMA API；
- 27～31：任务、buffer、IRQ、fence 和 profiling；
- 32～36：ILA、scoreboard、prototype、综合项目和交付材料。

每批运行：

```text
结构与 frontmatter
Mermaid 数量
二级标题数量
红线扫描
专项关键词与代码契约
全站测试
生产构建
```

最终构建必须生成 `/fpga/` 与 FPGA-01～36 全部公开页面，并完成 Pagefind 索引。

## 提交策略

每个批次完成并通过测试后创建一个本地提交，共六个正文批次提交；测试扩展与最终全系列验收单独提交。

不在本轮自动推送。完成后报告本地提交、测试、构建和无法在当前环境运行的硬件/EDA 验证项。

## 非目标

- 不选择或假定具体 xc7z020 开发板。
- 不提供虚构 XDC、DDR preset、AXI 地址、中断号或性能数据。
- 不生成真实 bitstream、XSA、Linux 内核模块二进制或板级测试结果。
- 不把 FPGA 原型结果宣称为 ASIC 性能结论。
- 不新增 36 之后的文章。
