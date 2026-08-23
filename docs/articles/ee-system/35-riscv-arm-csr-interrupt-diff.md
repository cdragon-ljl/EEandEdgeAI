---
title: "嵌入式知识体系 · #35 · RISC-V 与 ARM 的核心差异：CSR 寄存器与中断模型"
description: "RISC-V 是嵌入式领域近年来最大的变量。它的开源指令集架构（ISA）让芯片设计者不再受制于 ARM 的商业授权，RISC-V 核（如 SiFive E/U 系列、平头哥玄铁系列、嘉楠 K230）正在从 IoT 向边缘计算渗透。"
pubDate: "2026-08-23"
series: "ee-system"
order: 35
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
RISC-V 是嵌入式领域近年来最大的变量。它的开源指令集架构（ISA）让芯片设计者不再受制于 ARM 的商业授权，RISC-V 核（如 SiFive E/U 系列、平头哥玄铁系列、嘉楠 K230）正在从 IoT 向边缘计算渗透。

但 RISC-V 不是"免费版 ARM"。它虽然借鉴了很多 ARM 的设计思想，但在具体实现上有显著差异——尤其是**控制/状态寄存器**和**中断模型**这两块。不理解这些差异，移植代码时寸步难行。

本文从三个维度深入对比：CSR 寄存器体系、中断控制器模型、特权架构——最后分析 RISC-V 向量扩展对嵌入式 AI 的意义。

---

## 一、CSR 寄存器 vs ARM 协处理器

### ARM 的做法：协处理器接口（CP15）

在 ARM Cortex-A 中，系统控制寄存器通过**协处理器（Coprocessor）接口**访问。最常用的是 CP15：

```assembly
@ ARM 协处理器寄存器访问指令
@ CP15 中的寄存器只能通过 MCR/MRC 访问
MCR p15, 0, R0, c1, c0, 0    @ 写 SCTLR（系统控制寄存器）
MRC p15, 0, R0, c0, c0, 0    @ 读 MIDR（处理器 ID 寄存器）
```

这些指令的格式是 `MRC/MCR{cond} Cp, op1, Rd, CRn, CRm, op2`：

```
MRC  p15,  0,   R0,   c0,   c0,   0
│    │    │    │    │    │    └ op2（第二操作数）
│    │    │    │    └----  CRm（第二协处理器寄存器）
│    │    │    └---------  CRn（主协处理器寄存器）
│    │    └──────────────  Rd（ARM 通用寄存器）
│    └─── op1（第一操作数）
└── 协处理器（15 = 系统控制）
```

### RISC-V 的做法：CSR 地址空间

RISC-V 用一个独立的 **12-bit CSR 地址空间**（4096 个寄存器）来管理系统状态。访问方式是通过专门的 CSR 指令：

```assembly
@ RISC-V CSR 读写指令
csrr  t0, mstatus          @ 读 mstatus CSR 到 t0
csrw  mstatus, t0          @ 写 t0 到 mstatus
csrs  mstatus, (1 << 3)    @ 设置 mstatus 中的某一位
csrc  mstatus, (1 << 3)    @ 清除 mstatus 中的某一位
csrrw t0, mie, t1          @ 读 mie 到 t0，同时将 t1 写入 mie（原子交换）
```

### CSR 地址的编码规则

12-bit CSR 地址的高 4 位（`csr[11:8]`）编码了访问权限：

| CSR[11:8] | 访问权限 | 含义 |
|:--------:|:--------:|:-----|
| 0b00xx | 读/写 | 所有特权级可访问 |
| 0b01xx | 读/写 | 仅低特权级可读（用于性能计数） |
| 0b10xx | 读/写 | 只读——写操作触发非法指令异常 |
| 0b11xx | 读/写 | 仅 Machine 模式可访问 |

### 关键的 CSR 寄存器

RISC-V 定义了一套标准的 CSR 寄存器，类比 ARM 的 CP15：

| CSR 地址 | 名称 | ARM 对应 | 功能 |
|:-------:|:----:|:--------:|:-----|
| 0x300 | `mstatus` | SCTLR + CPSR | Machine 模式状态（中断使能、特权级切换） |
| 0x304 | `mie` | CPSR.I/F | Machine 模式中断使能位 |
| 0x305 | `mtvec` | VBAR/VTOR | 中断向量表基地址 |
| 0x341 | `mepc` | LR (异常时) | 异常返回地址（类似 ARM 的 saved PC） |
| 0x342 | `mcause` | 异常号 | 异常原因编码 |
| 0x343 | `mtval` | IFSR/DFSR | 异常相关地址/信息（类似 ARM 的 Fault Address Register） |
| 0x344 | `mip` | 中断标志 | 等待处理的中断位图 |
| 0x3A0 | `pmpcfg0` | MPU 配置寄存器 | 物理内存保护配置 |
| 0x3B0 | `pmpaddr0` | MPU 地址寄存器 | 物理内存保护地址 |

### 核心哲学差异

| 维度 | ARM (CP15) | RISC-V (CSR) |
|:----|:----------:|:------------:|
| 访问方式 | MCR/MRC 协处理器指令 | csrr/csrw/csrs/csrc 专用指令 |
| 地址编码 | 5个字段（cp, op1, CRn, CRm, op2） | 12-bit 统一地址（简单直接） |
| 原子操作 | 无直接支持 | csrrw/csrs/csrc 原子读-改-写 |
| 扩展性 | 有标准（按版本递增） | 预留了自定义空间（0x7C0-0x7FF） |

RISC-V 的设计更"干净"——统一的地址空间让仿真器、调试器和操作系统的处理更简单。ARM 的协处理器模型是 32 位时代的遗留设计，AArch64 已经改用系统寄存器（SysReg）接口，思路和 RISC-V 的 CSR 非常接近。

---

## 二、CLIC vs NVIC：两种中断控制哲学

### ARM Cortex-M 的 NVIC

NVIC（Nested Vectored Interrupt Controller）是 Cortex-M 的内置中断控制器。它的关键特性：

- **嵌套**：高优先级中断自动抢占低优先级
- **向量化**：每个异常直接对应向量表中的入口地址
- **尾链优化**：连续中断无需重复入栈/出栈

NVIC 的配置寄存器通过**内存映射**访问：

```c
/* STM32F4 NVIC 配置示例 */
NVIC_SetPriorityGrouping(5);               /* 4-bit 抢占 + 4-bit 子优先级 */
NVIC_SetPriority(UART_IRQn, 2);            /* 优先级 = 2 */
NVIC_EnableIRQ(UART_IRQn);                 /* 使能 UART 中断 */
```

关键点：**NVIC 的优先级逻辑在中断控制器中，不在 CPU 核心中**。CPU 看到的是一个已经裁决好的最高优先级中断请求。

### RISC-V 的 CLIC

CLIC（Core-Local Interrupt Controller）是 RISC-V 的标准中断控制器规范，对标 NVIC。它也支持：

- **分级优先级**（可配置 1~256 级）
- **向量化中断**（类似 NVIC，直接跳转到对应 handler）
- **可抢占嵌套**

但 CLIC 的实现方式不同——它将中断控制寄存器和**CSR 系统深度集成**：

```assembly
@ CLIC 的中断配置（通过内存映射的 CLIC 寄存器）
@ 每个中断源有一个 8-bit 控制字节
#define CLIC_BASE        0x08000000
#define CLIC_INT_CTRL(n) (*(volatile uint8_t *)(CLIC_BASE + n))

CLIC_INT_CTRL(3) = (3 << 5) | 2;  /* 中断源 3: 优先级=3, 使能=1 */
```

### CLIC vs NVIC 的对比

| 特性 | ARM NVIC | RISC-V CLIC |
|:----|:--------:|:-----------:|
| 中断源数量 | 固定（芯片系列决定） | 可配置（0~4095） |
| 优先级级别 | 可配（最多 256 级） | 可配（最多 256 级） |
| 向量化 | ✅ 硬件向量化 | ✅ 支持（CLIC 模式） |
| 抢占嵌套 | ✅ 自动 | ✅ 自动 |
| 尾链优化 | ✅ 硬件 | ✅ 类似实现 |
| 中断延迟 | 12 周期（典型） | 15-20 周期（典型） |
| 标准统一性 | 各厂商 NVIC 实现一致 | 不同 CLIC 实现有差异 |

RISC-V 也有更简单的 **CLINT**（Core-Local Interruptor）——没有优先级和向量化，适合超低成本的 IoT MCU。CLIC 是对 CLINT 的增强升级。

### PLIC：RISC-V 的全局中断控制器

除了 CLIC，RISC-V 还有 **PLIC（Platform-Level Interrupt Controller）** 用于管理多核系统中的外部中断：

```
外设中断源 → PLIC  →  仲裁（优先级）  →  分发到各 CPU 核的 CLIC/CLINT
                                                    ↓
                                            CPU 核读取 mcause
                                                    ↓
                                            跳转中断服务程序
```

PLIC 类似 ARM GIC（Generic Interrupt Controller）的角色，负责多核中断分发。嵌入式双核 RISC-V SoC 通常配置为：PLIC + 每个核的 CLIC。

---

## 三、特权架构：Machine / Supervisor / User 三级

ARM 有 EL0/EL1/EL2/EL3，RISC-V 也有类似的特权级——但少一级。

### RISC-V 的特权级

| 特权级 | 编码 | ARM 对照 | 说明 |
|:-----:|:----:|:--------:|:----|
| **U (User)** | 00 | EL0 | 用户态应用 |
| **S (Supervisor)** | 01 | EL1 | 操作系统内核 |
| **M (Machine)** | 11 | EL3 | 最高权限，固件/监控器 |

注意：RISC-V 没有直接对应 ARM EL2（Hypervisor）的特权级——**H (Hypervisor) 扩展**是可选的，通过 `H` 扩展实现，在 S 模式之上增加一层虚拟化管理。

### 特权级切换

与 ARM 通过异常/ERET 切换类似，RISC-V 通过 **异常/中断** 进入更高特权级，通过 `mret`（Machine 模式返回）或 `sret`（Supervisor 模式返回）降级：

```assembly
@ 从 S 模式中触发 ecall，进入 M 模式
ecall                        @ 类似 ARM 的 SMC
@ → CPU 陷入 M 模式
@ → mcause = 11 (ecall from S-mode)
@ → mepc = 当前 PC，保存到 mepc
@ → mtval = 0（无额外信息）
@ → PC = mtvec（跳转到 M 模式中断向量表）

@ M 模式处理完毕后返回 S 模式
mret                          @ 类似 ARM 的 ERET
@ → PC = mepc
@ → 恢复 MPP 中保存的先前模式
```

### 物理内存保护（PMP）vs ARM MPU

RISC-V 的 **PMP（Physical Memory Protection）** 对标 ARM Cortex-M 的 MPU——用于在裸机/RTOS 中提供内存区域保护。

```assembly
@ 配置 PMP：允许 U 模式读写地址范围 [0x80000000, 0x80001000)
csrw  pmpcfg0, 0x1B          @ PMP0: TOR, R, W, L (lock)
csrw  pmpaddr0, 0x80000      @ PMP0 地址 = 0x80000000 >> 2
@ 第二个地址边界
csrw  pmpaddr1, 0x80004      @ 0x80001000 >> 2
```

PMP 使用**地址匹配模式**（NAPOT/TOR/NA4）定义保护区域，每个区域配置读写执行权限。和 ARM MPU 的核心功能一致——但 PMP 通过 CSR 配置，ARM MPU 通过内存映射寄存器配置。

---

## 四、向量扩展（V Extension）的前景

### RISC-V V 扩展 vs ARM NEON/SVE

RISC-V 的 **V 扩展**定义了可变的向量长度（VLEN），从 128 位到 1024 位甚至更宽。ARM 有 NEON（固定 128 位）和 SVE（可变长度）。

| 特性 | RISC-V V | ARM NEON | ARM SVE |
|:----|:--------:|:--------:|:--------:|
| 向量长度 | 可配 (128~1024+) | 固定 128-bit | 可配 (128~2048-bit) |
| 寄存器数量 | 32 个向量寄存器 | 32×128-bit | 32 个可变长度 |
| 掩码支持 | ✅ 谓词（predicate） | ❌ 无 | ✅ 谓词 |
| 粒度 | 支持元素级/向量级 | 固定寄存器 | 向量长度无关 |

### 对嵌入式 AI 的意义

嵌入式 AI 模型推理高度依赖向量化计算。RISC-V V 扩展的出现让 RISC-V 在边缘 AI 场景有了和 ARM NEON 平等竞争的机会。

例如，一个 8×8 的 int8 矩阵乘法的向量化实现：

```assembly
@ RISC-V V 扩展: 8×8 int8 矩阵乘法核心循环
@ vl = 8 (向量长度=8个int8)
@ vs1 = A 行向量, vs2 = B 列向量, vd = 结果

loop:
    vsetvli t0, a2, e8, m1    @ 设置向量长度和数据类型
    vlbu.v  v8, (a0)          @ 从 A 矩阵加载 8 个 int8
    vlbu.v  v16, (a1)         @ 从 B 矩阵加载 8 个 int8
    vmul.vv v24, v8, v16      @ 向量点乘（int8 → int16 扩展）
    vadd.vv v0, v0, v24       @ 累加
    add     a0, a0, t0        @ A 地址偏移
    add     a1, a1, t0        @ B 地址偏移
    sub     a2, a2, t0        @ 剩余元素计数
    bnez    a2, loop
```

这段代码**向量长度无关**——同一个二进制可以在 VLEN=128 和 VLEN=256 的芯片上运行，只是后者一次处理更多元素，性能自动翻倍。

### V 扩展的生态现状

截至 2024-2025 年，RISC-V V 扩展已经得到主流工具链支持：
- **GCC**: 从 12 开始支持 `-march=rv64gcv`
- **LLVM/Clang**: 从 15 开始支持
- **SiFive P650/P670**、**玄铁 C910/C920** 等高性能核心已支持 V 扩展

对于嵌入式开发者，这意味着**未来 RISC-V 芯片上跑 AI 推理不再是 ARM 的专利**——而且 V 扩展的开源特性让芯片公司可以自定义向量指令，这是 ARM 封闭生态做不到的。

---

## 五、移植要点总结

如果要从 ARM 向 RISC-V 移植代码，以下差异需要注意：

| 模块 | ARM 做法 | RISC-V 做法 |
|:----|:--------|:-----------|
| 系统寄存器 | MCR/MRC CP15 | csrr/csrw 访问 CSR |
| 中断向量表 | VTOR 寄存器指向 | mtvec/stvec 指向 |
| 中断使能 | CPSIE/CPSID 或 NVIC API | csrs mie / csrc mie |
| 上下文切换 | PUSH/POP + BX LR | save/restore + mret |
| 内存保护 | MPU 内存映射寄存器 | PMP 通过 CSR 配置 |
| 原子操作 | LDREX/STREX | LR/SC (Load-Reserved/Store-Conditional) |
| 启动代码 | Reset_Handler → SystemInit | _start → crt0 |
| 调试接口 | SWD/JTAG (CoreSight) | JTAG (RISC-V Debug Spec) |

---

## 小结

RISC-V 和 ARM 的核心差异不是"谁好谁坏"，而是设计哲学的差异：

- **CSR vs 协处理器**：RISC-V 的 12-bit CSR 地址空间设计更规整、扩展性更好
- **CLIC vs NVIC**：功能定位一致，但 CLIC 通过 CSR + 内存映射混合配置
- **M/S/U 三级 vs EL0-EL3**：ARM 多了一个 EL2 虚拟化层，RISC-V 通过 H 扩展可选补上
- **V 扩展 vs NEON/SVE**：RISC-V 的向量长度无关设计更前瞻，但目前生态成熟度不如 ARM

对于嵌入式开发者，最重要的是理解：**指令集差异只是表面的，真正的差异在中断响应机制和系统寄存器管理流程**。每次移植 RTOS 或底层驱动，改的最多的就是这两块。

> 🏷️ RISC-V ARM CSR CLIC NVIC PMP M模式 S模式 U模式 V扩展 特权架构
