# RISC-V 架构精讲（系列框架）

> 系列名：**嵌入式知识体系 · RISC-V 架构精讲**
> 定位：面向嵌入式软件工程师，学习/动手构建 **RISC-V 架构本身**（用 → 懂 → 造）
> 创建日期：2026-08-04
> 最近更新：2026-08-04（按用户最新方向重写：恢复 Part C 延伸示例、写入写作红线）

## 🎯 核心方向（2026-08-04 用户明确）

- **主线：学习/动手构建 RISC-V 架构本身**，路径：**QEMU（软件层理解架构）→ 深入内核架构 → 基于 Zynq 搭建一个 RISC-V 核（FPGA 软核落地）**
- **Part C（RISC-V + 端侧 AI）保留，但仅作延伸示例，不是核心主线**：核心是 RISC-V 架构本身；端侧 AI / NPU 是锦上添花的应用示例，写作与规划不得把 AI 放为主体
- **硬件策略：**
  - Part A：QEMU virt 机器（RV64 裸机 + FreeRTOS）—— 零硬件成本（✅ 已完成 10 篇）
  - Part B：Zynq-7000（**xc7z020**，已有板卡）+ **MicroBlaze V**（AMD 官方 RISC-V 软核，RV32IMC 无 MMU，跑裸机 + FreeRTOS；Linux 在 QEMU 上实践）
  - Part C：MilkV Duo（SG2002，1 TOPS NPU，C906 RV64 + RVV 0.7.1）—— **不强制购买**，真实芯片上的端侧 AI 应用示例
- **构建规范：** 统一使用 CMake（`toolchain-riscv.cmake` 交叉编译工具链 + `CMakeLists.txt`，后续每篇沿用同一套配置）

## 📐 系列结构（30 篇：Part A 10 + Part B 15 + Part C 5）

| 部分 | 篇目 | 学什么 | 状态 |
|:---|:---:|:---|:---|
| **A、QEMU 动手实践** | RV-01~10 | 环境、汇编、链接启动、中断、FreeRTOS 移植、调试、定制机器 | ✅ 10/10 已完成（原 qemu-riscv 系列） |
| **B、架构深入与 FPGA 落地** | RV-11~25 | 架构视角 3 + CPU 微架构 5 + OS 内核 2 + Zynq 软核 5 | ⏳ RV-11/12 首稿已交付，其余待写 |
| **C、RISC-V + 端侧 AI（延伸）** | RV-26~30 | 真实 RISC-V SoC（SG2002）+ RVV 向量 + 端侧 AI 示例 | ⏳ 0/5 待写（非核心，作延伸示例） |

> ⚠️ 弹性原则：系列结构/篇数**不要一开始定死**，后续可随写作调整；正文中**禁止**出现完整文章列表/总目录/逐篇预告/篇数。

## 篇目明细

### Part A：QEMU 动手实践（RV-01~10）—— ✅ 已完成

| # | 标题 | 文件 |
|:-:|:---|:---|
| RV-01 | 环境搭建与 Hello World | `qemu-riscv-01-env-setup-hello-world.md` |
| RV-02 | CMake 构建系统：工程化构建管理 | `qemu-riscv-02-cmake-build-system.md` |
| RV-03 | RISC-V 寄存器架构与汇编语法 | `qemu-riscv-03-register-assembly.md` |
| RV-04 | 链接脚本与启动代码 | `qemu-riscv-04-linker-startup.md` |
| RV-05 | 中断模型：CLINT + PLIC | `qemu-riscv-05-interrupt-clint-plic.md` |
| RV-06 | 系统定时器与 Tick 实现 | `qemu-riscv-06-timer-tick.md` |
| RV-07 | FreeRTOS 移植（上）— 从 0 开始写 port | `qemu-riscv-07-freertos-port-p1.md` |
| RV-08 | FreeRTOS 移植（下）— 多任务跑起来 | `qemu-riscv-08-freertos-port-p2.md` |
| RV-09 | 调试验证：QEMU GDB 与各种测试 | `qemu-riscv-09-debug-gdb-test.md` |
| RV-10 | 定制 virt 机器：从源码修改到自定义外设 | `qemu-riscv-10-customize-virt-machine.md` |

> Part A 修订计划：分批修订（先修订 RV-01~03 给用户看风格），每篇补"架构视角"小节，标题统一「嵌入式知识体系 · RISC-V 架构精讲 #NN」。

### Part B：架构深入与 FPGA 落地（RV-11~25）—— ⏳ 待写（11/12 首稿已交付）

#### 阶段一：架构视角（RV-11~13）—— 从"用"到"懂"
- **RV-11** 指令编码精讲：RISC-V 指令格式、立即数编码，QEMU 源码看一条指令如何被执行 ✅ 首稿已交付
- **RV-12** 特权级与 CSR 全景：M/S/U 模式、CSR 寄存器体系、trap 处理流程（对比 Cortex-M 的 handler 模式）✅ 首稿已交付
- **RV-13** 原子指令与内存模型：LR/SC、AMO、fence 与内存序（对比 ARM 的 LDREX/STREX）

#### 阶段二：CPU 微架构（RV-14~18）—— 一个核是怎么设计出来的
- **RV-14** 数据通路与流水线：从五级流水看 RISC-V 经典设计
- **RV-15** 流水线冒险与分支预测：冒险消除、分支预测器
- **RV-16** 缓存与访存层次：Cache 结构、替换策略、写策略
- **RV-17** 真实软核解剖：PicoRV32 / VexRiscv 源码阅读
- **RV-18** 软核对比与选型：RV32 vs RV64、性能与资源权衡

#### 阶段三：OS 内核视角（RV-19~20）—— 从裸机到操作系统
- **RV-19** Sv39 虚拟内存：页表结构、MMU 使能、TLB 与缺页（对比 Cortex-A 的 MMU）
- **RV-20** Linux 启动链：OpenSBI → Linux 内核启动流程、设备树（Linux 在 QEMU 上实践）

#### 阶段四：Zynq 软核落地（RV-21~25）—— 造一个 RISC-V 核
- **RV-21** Zynq-7000（xc7z020）架构与 Vivado：PS/PL、硬件工程搭建
- **RV-22** 集成 MicroBlaze V：AMD 官方 RISC-V 软核（RV32IMC），最小系统构建
- **RV-23** MicroBlaze V 裸机编程：GPIO/UART 点灯与串口
- **RV-24** MicroBlaze V + FreeRTOS 移植：把 QEMU 阶段的经验搬到真实 FPGA 软核
- **RV-25** 综合项目：RISC-V 软核 SoC 完整应用（如简易仪表/传感器采集）

### Part C：RISC-V + 端侧 AI（RV-26~30）—— ⏳ 待写（延伸示例，非核心主线）

> 硬件副线：MilkV Duo（SG2002，1 TOPS NPU，C906 RV64 + RVV 0.7.1 + 8051 三核），**不强制购买**
> 定位：在真实 RISC-V 芯片上深化架构认知，AI 仅作应用示例；与 NPU 系列互相印证，不展开成独立主线

- **RV-26** 带 NPU 的 RISC-V SoC 全景：MilkV Duo（SG2002）架构解剖，NPU 与 CPU 分工（衔接 NPU 系列思维）
- **RV-27** RVV 向量扩展：vsetvl、向量寄存器、编程模型（与 CUDA/NPU 的 SIMT 类比）
- **RV-28** RVV 实战：矩阵乘 / 卷积的向量化实现与自动向量化（与 NPU 系列 tiling/访存优化互相印证）
- **RV-29** 端侧 AI 部署实战：模型转换 → 推理框架 → NPU 推理在 RISC-V 平台跑通
- **RV-30** 综合项目：RISC-V 端侧 AI 完整应用（如摄像头检测/语音唤醒），RVV + NPU 协同

## 命名规则
- Part A 保留 `qemu-riscv-NN-xxx.md`（标题统一 #NN）
- Part B 用 `riscv-NN-xxx.md`：
  - `riscv-11-instruction-encoding-qemu-internals.md` ✅
  - `riscv-12-privilege-csr-trap.md` ✅
  - `riscv-13-atomic-lrsc-amo-fence.md`
  - `riscv-14-datapath-pipeline.md`
  - `riscv-15-hazard-branch-prediction.md`
  - `riscv-16-cache-memory-hierarchy.md`
  - `riscv-17-picorv32-vexriscv-analysis.md`
  - `riscv-18-softcore-rv32-vs-rv64.md`
  - `riscv-19-sv39-mmu-page-table.md`
  - `riscv-20-opensbi-linux-boot-chain.md`
  - `riscv-21-zynq-xc7z020-vivado.md`
  - `riscv-22-microblaze-v-minimal-system.md`
  - `riscv-23-microblaze-v-baremetal-gpio-uart.md`
  - `riscv-24-microblaze-v-freertos.md`
  - `riscv-25-final-project-riscv-softcore-soc.md`
- Part C 用 `riscv-NN-xxx.md`：
  - `riscv-26-sg2002-milkv-duo-npu-soc.md`
  - `riscv-27-rvv-vector-extension.md`
  - `riscv-28-rvv-matrix-mul-conv.md`
  - `riscv-29-edge-ai-deploy-riscv.md`
  - `riscv-30-final-project-riscv-edge-ai.md`

## 写作规范（沿用 NPU 系列标准 + 红线）

- **读者画像**：0 RISC-V 基础、但嵌入式功底扎实的软件工程师（懂 C/C++、ARM、单片机、RTOS、Linux）
- **硬性要求**：每个 RISC-V 概念首次出现必须定义 + ARM/嵌入式类比；关键推导完整展开到可照抄复现；每篇有可运行代码 + 练习 + 里程碑
- **正确性**：寄存器/CSR/指令编码/内存布局必须核实 RISC-V 官方 Spec、QEMU 源码与 AMD/MilkV 官方文档，不确定的内容宁缺毋滥并标注"待核实"，绝不编造
  - CSR 地址规则：bit[9:8] 读写属性（00 读写 / 01 只读）；bit[11:10] 最低访问特权级（00 U / 01 S / 10 H / 11 M）；计数器 0xC00~0xC02 默认 M 级，U 访问需 `mcounteren` 使能
- **核心性**：聚焦核心知识点讲深，不堆砌冷门扩展指令
- **构建规范**：统一 CMake（`toolchain-riscv.cmake` + `CMakeLists.txt`）
- **插图规范**：每篇至少 2 张图——①示意图用 ASCII/文字图表达（特权级切换/页表结构/启动链/流水线/tiling）②优先给官方文档图片链接（RISC-V Spec / QEMU docs / AMD/MilkV 文档）③关键插图给出 AI 生图 prompt ④正文用占位符标注图位（如【图1：…】）
- **标题规范**：禁止 emoji 前缀；正文开头可写系列简介但不写"修订记录"等元信息；正文末尾以 `> 🏷️` 标签行结尾，不附加作者/日期

### 🚫 写作红线（2026-08-04 用户强调，所有文章一律遵守）
1. **思考过程/草稿/自我怀疑文字禁止入文**（等等/让我想想/记错了/嗯/哦/Hmm 等）——正文只呈现最终正确结论
2. **禁止 "Part A/B/C" 分段称呼指代前文**——用"前面几篇""之前的实验"等自然表述
3. **禁止 "下一篇/下一章/下一节讲什么" 预告**——文章末尾以小结/里程碑/标签收尾
4. **禁止点名具体文章编号**（如 RV-10、RV-11）——系列简介回顾"上一篇/本篇"可以，但不点名编号
5. **禁止完整文章列表/总目录/篇数**（如"共 N 篇""30 篇"）
- 写完必须自查：grep 复查关键词（等等/让我/不对/记错/嗯/哦/Hmm/草稿/思考/Part A/下一篇/下一章/预告/后续/RV-NN）

## 发布节奏（待定）
- Part A 10 篇已完成，随时可按顺序发布（周二/周四/周日 21:00）
- Part B 15 篇 + Part C 5 篇，按每周 2 篇约 10 周；与 NPU 系列并行时按用户实际节奏调整

## 面试价值
- 特权级/CSR/trap、指令编码：RISC-V 内核/驱动岗位高频考点
- CPU 微架构/流水线：芯片设计、验证岗位核心
- Sv39 MMU + Linux 启动：SoC 系统软件岗位核心
- FPGA 软核（MicroBlaze V）：SoC 原型验证、FPGA 工程师加分项
- RVV + NPU（SG2002）：AI 芯片/算子岗位加分项（与 NPU 系列互相印证）
