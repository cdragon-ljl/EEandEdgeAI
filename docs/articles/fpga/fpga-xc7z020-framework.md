---
title: "FPGA 与芯片原型验证实战系列框架"
description: "基于 xc7z020，规划从数字逻辑与 RTL 到 Zynq PS/PL、Linux 驱动和加速器原型的完整学习路径。"
pubDate: "2026-08-22"
series: fpga
order: 0
tags: ["FPGA", "Zynq-7000", "xc7z020", "RTL", "芯片原型验证"]
draft: true
---
# 嵌入式知识体系 · FPGA 与芯片原型验证实战

> 基于 xc7z020，从 Verilog 到 Zynq PS/PL 协同，再到 Linux 驱动与 AI 加速器原型。

---

## 一、系列定位

这个系列不是普通的 FPGA 入门点灯教程，而是围绕后续职业方向设计：

- 芯片软件开发；
- NPU / GPU / AI 加速器驱动；
- AI Runtime / KMD / UMD；
- 硅前验证；
- 硅后 bring-up；
- FPGA 原型验证；
- Linux 驱动与硬件协同；
- AXI / AHB / APB 总线理解；
- Baremetal / RTOS / Linux 多层软件栈。

硬件平台固定为：

```text
Zynq-7000 / xc7z020
```

这个系列的核心目标不是把读者训练成纯 FPGA 工程师，而是让嵌入式软件工程师具备理解硬件、驱动硬件、调试硬件、验证硬件的能力。

最终能力链如下：

```text
数字电路与 RTL
    ↓
Verilog / SystemVerilog
    ↓
Vivado + Zynq PS/PL
    ↓
AXI-Lite / AXI-Stream / AXI DMA
    ↓
自定义硬件 IP
    ↓
Baremetal / FreeRTOS / Linux 驱动访问 PL
    ↓
FPGA 原型验证
    ↓
AI / NPU / GPU 驱动与 Runtime 能力铺垫
```

---

## 二、为什么要单独拆出 FPGA 系列

此前 FPGA 内容被放在 RISC-V 架构精讲系列中，主要作为 Zynq 软核落地部分存在，例如 MicroBlaze V、软核 SoC、裸机和 FreeRTOS 实验。

但从后续学习方向看，FPGA 不应该只是 RISC-V 系列的附属内容。

它本身可以承担更重要的能力训练：

1. **理解硬件执行模型**
   - 软件是顺序执行、时间复用；
   - FPGA 是并行逻辑、空间展开；
   - 这对理解 NPU/GPU 加速器非常关键。

2. **理解寄存器、中断和 DMA 的硬件来源**
   - Linux 驱动不是凭空访问寄存器；
   - 寄存器背后是 RTL；
   - 中断背后是硬件状态机；
   - DMA 背后是总线 master 和内存访问。

3. **理解 AXI 总线和 SoC 结构**
   - AXI-Lite 对应寄存器配置；
   - AXI-Stream 对应数据流；
   - AXI DMA 对应 DDR 与 PL 数据搬运；
   - 这些能力直接服务芯片软件和驱动开发。

4. **构建 AI/NPU 加速器原型思维**
   - command register；
   - status register；
   - input/output buffer；
   - descriptor；
   - interrupt done；
   - performance counter；
   - user runtime + kernel driver + hardware accelerator。

5. **服务硅前/硅后验证**
   - RTL 仿真；
   - testbench；
   - ILA 板级波形；
   - FPGA prototype；
   - driver bring-up；
   - hardware/software co-debug。

因此，FPGA 系列独立出来更合理。

---

## 三、系列总结构

建议规划为 **FPGA-01 ~ FPGA-36**，共 36 篇，分 7 个阶段。

| 阶段 | 篇数 | 目标 |
|---|---:|---|
| 阶段一：FPGA 与数字逻辑基础 | 4 篇 | 建立硬件思维 |
| 阶段二：Verilog/SystemVerilog 与仿真 | 6 篇 | 能写 RTL、能仿真、能看波形 |
| 阶段三：Vivado 与 xc7z020 工程 | 5 篇 | 能搭建 Zynq 工程 |
| 阶段四：AXI 总线与自定义 IP | 6 篇 | 理解 PS/PL 通信 |
| 阶段五：Linux 驱动访问 PL 外设 | 5 篇 | 打通 Linux + FPGA |
| 阶段六：硬件加速器与 AI/NPU 原型 | 5 篇 | 服务 NPU/GPU 驱动方向 |
| 阶段七：验证、调试与综合项目 | 5 篇 | 服务硅前/硅后验证与作品集 |

---

## 四、阶段一：FPGA 与数字逻辑基础

这个阶段解决几个基础问题：

- FPGA 到底是什么；
- FPGA 和 MCU/CPU/ASIC 有什么区别；
- 什么是组合逻辑；
- 什么是时序逻辑；
- 什么是触发器、寄存器、状态机；
- FPGA 内部资源有哪些。

重点是建立硬件思维，而不是一上来就打开 Vivado 点灯。

---

### FPGA-01：为什么嵌入式软件工程师要学 FPGA？

核心内容：

- FPGA 不是单片机，也不是普通外设；
- FPGA 的本质是可重构硬件；
- 软件思维和硬件思维的区别；
- FPGA 在芯片软件、AI 加速器、驱动开发中的价值；
- 为什么 NPU/GPU 驱动工程师需要懂总线、寄存器、中断、DMA；
- xc7z020 在整个系列中的定位；
- 本系列最终目标：做一个可以被 Linux 驱动访问的硬件加速器原型。

关键认知：

```text
CPU 是按时间复用执行指令；
FPGA 是用空间展开实现逻辑。
```

这句话是理解 FPGA 的起点。

---

### FPGA-02：数字电路基础：组合逻辑、时序逻辑、触发器与寄存器

核心内容：

- 与、或、非、异或；
- mux；
- decoder；
- encoder；
- latch 和 flip-flop；
- register；
- clock；
- reset；
- setup time / hold time；
- metastability 亚稳态；
- 为什么硬件设计必须考虑时钟边沿。

这一篇为后续 Verilog、状态机、AXI 时序打基础。

---

### FPGA-03：状态机 FSM：硬件控制逻辑的灵魂

核心内容：

- 状态机是什么；
- Moore / Mealy 状态机；
- 状态寄存器、下一状态逻辑、输出逻辑；
- 用状态机控制 UART、DMA、加速器任务；
- 状态机在 NPU command scheduler 中的作用；
- 常见错误：状态漏转移、组合逻辑锁存器、reset 状态不明确。

这篇要把状态机和后续硬件任务调度联系起来。

---

### FPGA-04：FPGA 内部资源：LUT、FF、BRAM、DSP、Clock、IO

核心内容：

- LUT 是什么；
- FF 是什么；
- BRAM 是什么；
- DSP Slice 是什么；
- PLL/MMCM；
- IO Bank；
- 为什么乘法器适合放 DSP；
- 为什么缓存适合放 BRAM；
- 为什么大容量数据不能全塞进 FPGA 内部；
- 资源利用率怎么看。

这一篇要服务后面 AI 加速器原型设计。

---

## 五、阶段二：Verilog/SystemVerilog 与仿真

这个阶段解决：

- 怎么写 RTL；
- 怎么区分可综合代码和仿真代码；
- 怎么写 testbench；
- 怎么看波形；
- 怎么从波形定位硬件问题。

---

### FPGA-05：Verilog 入门：module、wire、reg、always 与 assign

核心内容：

- module 定义；
- input/output；
- wire 和 reg/logic；
- assign 连续赋值；
- always 块；
- 阻塞赋值 `=`；
- 非阻塞赋值 `<=`；
- 可综合代码和不可综合代码；
- 写第一个 LED 闪烁模块。

---

### FPGA-06：时序逻辑写法：reset、clock、counter 与寄存器设计

核心内容：

- 同步 reset；
- 异步 reset；
- counter；
- enable；
- register bank；
- 为什么时序逻辑推荐使用非阻塞赋值；
- 常见 bug：一个 reg 被多个 always 驱动；
- 对应到驱动视角：寄存器为什么有 bit 位、状态位、控制位。

---

### FPGA-07：组合逻辑写法：case、if、mux 与避免 latch

核心内容：

- 组合 always；
- case；
- if/else；
- default；
- latch 产生原因；
- 如何避免 latch；
- 组合路径过长对时序的影响；
- 与软件 if/else 的区别。

---

### FPGA-08：SystemVerilog 基础：logic、interface、always_ff、always_comb

核心内容：

- 为什么现代项目常用 SystemVerilog；
- logic 替代 wire/reg 的好处；
- always_ff；
- always_comb；
- enum 状态机；
- struct；
- interface 简介；
- 与 Verilog 的关系。

这篇不用写太深，但要让后面验证更自然。

---

### FPGA-09：Testbench 入门：不用上板也能验证 RTL

核心内容：

- testbench 是什么；
- clock 产生；
- reset 产生；
- stimulus 激励；
- monitor；
- dump 波形；
- 使用 Icarus Verilog / Verilator / Vivado Simulator；
- 如何验证一个 counter；
- 为什么芯片软件方向也要懂 testbench。

---

### FPGA-10：波形调试：从 GTKWave/Vivado Simulator 看懂硬件行为

核心内容：

- 波形怎么看；
- clock、reset、valid、ready；
- 状态机状态变化；
- counter 变化；
- AXI handshake 波形；
- 常见 bug 如何从波形定位；
- 软件 log 和硬件 waveform 的区别。

---

## 六、阶段三：Vivado 与 xc7z020 基础工程

这个阶段开始绑定硬件平台，目标是让读者能够在 xc7z020 上完成最小 Zynq 工程。

---

### FPGA-11：认识 xc7z020：Zynq-7000 的 PS/PL 架构

核心内容：

- Zynq 是什么；
- PS = Processing System；
- PL = Programmable Logic；
- ARM Cortex-A9；
- DDR、MIO、EMIO；
- AXI GP/HP/ACP 端口；
- PS 和 PL 如何通信；
- 为什么 Zynq 很适合嵌入式软件工程师学习 FPGA。

核心结构：

```text
ARM PS  <---- AXI ---->  PL 自定义逻辑
```

---

### FPGA-12：Vivado 工程入门：创建工程、添加 RTL、约束与综合

核心内容：

- Vivado project；
- source；
- constraints；
- XDC；
- synthesis；
- implementation；
- bitstream；
- utilization；
- timing summary；
- 生成最小 LED 工程；
- 上板下载 bitstream。

---

### FPGA-13：XDC 约束文件：引脚、时钟与电气标准

核心内容：

- set_property PACKAGE_PIN；
- IOSTANDARD；
- create_clock；
- 时钟约束；
- input/output delay 简介；
- 约束错误会导致什么问题；
- 如何根据原理图绑定 LED、按键、UART。

---

### FPGA-14：Block Design 入门：用图形化方式搭建 Zynq 系统

核心内容：

- IP Integrator；
- ZYNQ7 Processing System；
- Run Block Automation；
- AXI Interconnect；
- Processor System Reset；
- Generate Output Products；
- Create HDL Wrapper；
- Export Hardware；
- 和 Vitis/SDK 的关系。

---

### FPGA-15：PS 控制 PL：通过 EMIO 点亮 PL LED

核心内容：

- MIO 和 EMIO；
- PS GPIO；
- PL 引脚连接；
- Baremetal 程序控制 GPIO；
- 为什么这是 PS/PL 协同的第一个实验；
- 软件如何控制硬件逻辑。

---

## 七、阶段四：AXI 总线与自定义 IP

这个阶段非常关键，直接服务 Linux 驱动、芯片软件、NPU/GPU 驱动和 AI 加速器方向。

---

### FPGA-16：AXI 总线基础：AXI-Lite、AXI-Stream、AXI-Full 到底是什么？

核心内容：

- AXI 是 ARM AMBA 总线协议；
- AXI-Lite：寄存器访问；
- AXI-Stream：流式数据；
- AXI-Full：高性能内存映射传输；
- valid/ready 握手；
- address/data/response 通道；
- 为什么驱动写寄存器本质就是 AXI-Lite transaction；
- 为什么视频/NPU 更常用 AXI-Stream + DMA。

---

### FPGA-17：AXI-Lite 寄存器外设：自己做一个可配置硬件 IP

核心内容：

- 自定义 IP；
- 寄存器映射；
- control register；
- status register；
- data register；
- version register；
- PS 通过地址读写 PL；
- Baremetal 读写寄存器；
- 这就是很多硬件 IP 驱动的最小模型。

寄存器设计示例：

```text
0x00 CTRL
0x04 STATUS
0x08 INPUT
0x0C OUTPUT
0x10 VERSION
```

---

### FPGA-18：从软件看硬件寄存器：MMIO、volatile 与驱动访问模型

核心内容：

- MMIO 是什么；
- ARM 如何访问外设寄存器；
- `volatile` 为什么重要；
- `ioremap()`；
- `readl()` / `writel()`；
- 裸机和 Linux 驱动访问寄存器的区别；
- 寄存器 side effect；
- write-one-to-clear；
- status polling。

这一篇连接 C 语言、Linux 驱动和硬件 RTL。

---

### FPGA-19：中断机制：PL 逻辑如何通知 ARM？

核心内容：

- 硬件为什么需要中断；
- PL interrupt 接到 PS GIC；
- Vivado 中配置 IRQ_F2P；
- 中断触发方式；
- baremetal interrupt handler；
- Linux 中断处理；
- top half / bottom half；
- 加速器完成后 interrupt done 的典型模型。

---

### FPGA-20：AXI-Stream 与 FIFO：流式数据通路基础

核心内容：

- valid/ready；
- tdata；
- tlast；
- tkeep；
- backpressure；
- FIFO 缓冲；
- 为什么视频、音频、AI tensor 都适合流式接口；
- AXI-Stream FIFO 实验；
- 波形观察数据流。

---

### FPGA-21：AXI DMA：PS 内存与 PL 数据通路打通

核心内容：

- DMA 是什么；
- MM2S；
- S2MM；
- simple mode；
- scatter-gather 简介；
- DDR buffer；
- cache flush/invalidate；
- DMA-BUF 和 Linux 后续关联；
- 用 AXI DMA 把 DDR 数据送进 PL，再取回结果。

这是整个系列核心篇之一。

---

## 八、阶段五：Linux 驱动访问 PL 外设

这个阶段服务 Linux 驱动和芯片软件方向，目标是打通 Linux 用户态、内核态、PL 自定义硬件。

---

### FPGA-22：从 Baremetal 到 Linux：PL 外设如何交给内核管理？

核心内容：

- baremetal 直接访问物理地址；
- Linux 需要设备树描述硬件；
- reg；
- compatible；
- interrupts；
- clocks；
- resets；
- memory-region；
- 驱动 probe；
- 为什么 Linux 不能随便裸写物理地址。

---

### FPGA-23：设备树描述 PL 外设：reg、interrupts、clocks 与 reserved-memory

核心内容：

- device tree node；
- `compatible`；
- `reg`；
- `interrupt-parent`；
- `interrupts`；
- `clocks`；
- `dma-coherent`；
- `reserved-memory`；
- PL IP 的设备树示例；
- 如何确认 DTB 生效。

---

### FPGA-24：UIO 驱动：最快把 PL 寄存器暴露给用户态

核心内容：

- UIO 是什么；
- 适合快速原型验证；
- userspace mmap；
- userspace 处理中断；
- 设备树绑定；
- `/dev/uio0`；
- 用户态读写 PL 寄存器；
- UIO 的局限：不适合复杂 DMA、安全性弱、工程化有限。

---

### FPGA-25：字符设备驱动访问 PL IP：从 probe 到 ioctl

核心内容：

- platform_driver；
- probe；
- ioremap；
- cdev；
- file_operations；
- ioctl；
- poll；
- interrupt；
- wait queue；
- 用户态提交任务；
- 内核等待硬件完成。

这篇会非常贴近 NPU/GPU KMD 模型。

---

### FPGA-26：Linux DMA 驱动基础：PL 加速器如何处理大块数据？

核心内容：

- dma_alloc_coherent；
- dma_map_single；
- streaming DMA；
- cache 一致性；
- IOMMU 简介；
- 用户态 buffer 到内核 DMA 的问题；
- reserved memory；
- CMA；
- scatterlist；
- DMA API 与 AXI DMA 的关系。

---

## 九、阶段六：硬件加速器与 AI/NPU 原型

这个阶段开始贴近 NPU/GPU/AI 加速器方向。

目标不是实现真正复杂的 NPU，而是用 FPGA 做一个最小加速器模型，让软件工程师理解真实加速器软件栈的核心机制。

---

### FPGA-27：从寄存器 IP 到硬件加速器：任务提交模型设计

核心内容：

- 加速器最小抽象；
- command register；
- input address；
- output address；
- length；
- start bit；
- busy bit；
- done interrupt；
- error code；
- performance counter；
- 软件如何提交任务；
- 硬件如何执行任务；
- 和 NPU/GPU command queue 的关系。

典型寄存器：

```text
0x00 CTRL
0x04 STATUS
0x08 SRC_ADDR
0x0C DST_ADDR
0x10 LENGTH
0x14 IRQ_ENABLE
0x18 PERF_CYCLE
```

---

### FPGA-28：实现一个向量加法加速器：从 RTL 到 Linux 调用

核心内容：

- vector add 原理；
- AXI DMA 输入输出；
- PL 做计算；
- PS/Linux 提交任务；
- 中断通知完成；
- 校验结果；
- 统计 CPU vs PL 耗时；
- 这是 AI tensor 算子雏形。

---

### FPGA-29：实现一个简单卷积/滤波加速器：理解图像与 AI 算子硬件化

核心内容：

- 3×3 convolution；
- line buffer；
- sliding window；
- pipeline；
- BRAM 缓存；
- AXI-Stream 输入输出；
- 图像滤波；
- 和 CNN 卷积的关系；
- 为什么真实 NPU 需要大量数据复用。

---

### FPGA-30：性能计数器与 Profiling：硬件加速器到底快在哪里？

核心内容：

- cycle counter；
- busy counter；
- stall counter；
- input wait；
- output wait；
- AXI backpressure；
- throughput；
- latency；
- 软件读取性能寄存器；
- 如何判断瓶颈在计算、DMA、DDR 还是软件调度。

这篇非常服务后续 NPU/GPU profiling。

---

### FPGA-31：从 FPGA 原型看 NPU/GPU 驱动：KMD/UMD/Runtime 的最小模型

核心内容：

- 用户态 runtime；
- 内核态 driver；
- 硬件寄存器；
- command buffer；
- DMA buffer；
- interrupt；
- fence；
- wait queue；
- mmap；
- ioctl；
- profiling；
- 和真实 NPU/GPU 软件栈的对应关系。

这篇是整个系列和职业方向的关键连接篇。

---

## 十、阶段七：验证、调试与综合项目

这个阶段服务硅前验证、硅后 bring-up、FPGA prototype 和作品集整理。

---

### FPGA-32：ILA 在线调试：在 FPGA 里抓真实硬件波形

核心内容：

- ILA 是什么；
- 为什么板上问题不能只靠仿真；
- probe 信号；
- trigger；
- valid/ready；
- AXI handshake；
- 中断信号；
- DMA 状态；
- 如何定位 PL 逻辑卡死；
- 与软件 log 联合调试。

---

### FPGA-33：仿真验证方法：Testbench、断言与回归测试

核心内容：

- directed test；
- random test 简介；
- assertion；
- scoreboard；
- reference model；
- Verilator；
- cocotb 可选；
- CI 自动跑仿真；
- 为什么芯片软件工程师也要懂验证流程。

---

### FPGA-34：FPGA 原型验证与硅前/硅后 Bring-up 的关系

核心内容：

- FPGA prototype 是什么；
- 和 RTL simulation 的区别；
- 和 emulator 的区别；
- 硅前验证；
- 硅后 bring-up；
- DE / DV / SW 协同；
- spec、寄存器文档、驱动、测试用例之间的关系；
- 软件如何提前基于 FPGA 原型开发驱动。

---

### FPGA-35：综合项目：基于 xc7z020 的简易 AI 加速器原型

核心内容：

最终项目建议做：

```text
Linux 用户态程序
    ↓ ioctl
Linux 字符设备驱动
    ↓ MMIO + DMA API
Zynq PS
    ↓ AXI-Lite / AXI DMA
PL 自定义加速器
    ↓
向量加法 / 图像滤波 / 简单卷积
```

项目能力覆盖：

- Vivado 工程；
- 自定义 IP；
- AXI-Lite 寄存器；
- AXI DMA；
- 中断；
- Linux 设备树；
- 字符设备驱动；
- ioctl；
- DMA buffer；
- 性能计数器；
- 用户态测试程序；
- 性能对比报告。

---

### FPGA-36：作品集收尾：如何把 FPGA 项目包装成芯片软件/NPU 驱动能力

核心内容：

- 项目 README 怎么写；
- 架构图怎么画；
- 寄存器表怎么写；
- 驱动接口怎么描述；
- 性能数据怎么展示；
- 面试中如何表达；
- 如何从这个项目延伸到 NPU/GPU Runtime；
- 如何回答 DMA/cache/interrupt/ioctl/mmap/fence 相关追问。

---

## 十一、与现有系列的关系

FPGA 系列独立后，和其他系列的关系如下：

```text
Linux BSP 系列
    负责 Linux 内核、设备树、驱动、rootfs、bring-up

USB/PCIe 系列
    负责高速外设驱动和总线设备模型

CUDA/NPU/RKNN 系列
    负责 AI 算子、模型部署、NPU 工具链

AV 系列
    负责 Camera/ISP/V4L2/编码/推流

FPGA 系列
    负责 RTL、AXI、Zynq PS/PL、硬件原型、Linux 驱动访问 PL、自定义加速器

RISC-V 系列
    负责 CPU 架构、指令集、特权级、QEMU、裸机/RTOS
```

FPGA 系列不再只是 RISC-V 的附属内容，而是成为后续学习链中的一个核心支点。

---

## 十二、写作规范

这个系列不能写成单纯操作截图教程，也不能写成纯理论文章。

每篇文章建议固定采用以下结构：

```text
1. 这篇解决什么问题
2. 背景概念
3. 和芯片软件 / 驱动 / AI 加速器有什么关系
4. Vivado / Verilog / Linux 实际操作
5. 关键代码
6. 波形或架构图
7. 常见错误和排查
8. 阶段验收
9. 面试可表达点
```

尤其要固定加入一节：

```text
这和芯片软件 / NPU-GPU 驱动有什么关系？
```

这样整个系列不会变成普通 FPGA 教程，而是始终服务用户的核心职业方向。

---

## 十三、建议优先开写顺序

建议先写前 5 篇：

1. FPGA-01：为什么嵌入式软件工程师要学 FPGA？
2. FPGA-02：数字电路基础：组合逻辑、时序逻辑、触发器与寄存器
3. FPGA-03：状态机 FSM：硬件控制逻辑的灵魂
4. FPGA-04：FPGA 内部资源：LUT、FF、BRAM、DSP、Clock、IO
5. FPGA-05：Verilog 入门：module、wire、reg、always 与 assign

前 5 篇不要急着进入复杂 Vivado 工程，先把硬件思维建立起来。

否则后面 AXI、DMA、Linux 驱动、AI 加速器原型会很难真正理解。

---

## 十四、系列最终目标

这个系列最终要让读者完成一个基于 xc7z020 的端到端项目：

```text
自定义 PL 加速器
    ↓
AXI-Lite 寄存器控制
    ↓
AXI DMA 数据搬运
    ↓
PL 计算逻辑
    ↓
中断通知 PS
    ↓
Linux 内核驱动
    ↓
用户态 Runtime
    ↓
性能计数与 profiling
```

这个项目可以作为后续面向芯片软件、NPU/GPU 驱动、AI 加速器 Runtime、硅前验证、FPGA 原型验证方向的作品集基础。

> 🏷️ FPGA / Zynq / xc7z020 / Verilog / SystemVerilog / Vivado / AXI / AXI DMA / Linux 驱动 / 芯片软件 / NPU驱动 / GPU驱动 / 硅前验证 / FPGA原型验证
