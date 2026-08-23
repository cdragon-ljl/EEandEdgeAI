---
title: "嵌入式知识体系 · #24 · GD32 / NXP / TI 与 STM32 的差异对比"
description: "STM32 是嵌入式开发者的\"母语\"——大多数人从 STM32 入门，熟悉它的外设库、时钟树和开发流程。但当项目需要降本（换 GD32）、升性能（换 NXP i.MX RT）或客户指定平台（换 TI Tiva）时，\"好像差不多\"的直觉往往会坑人。"
pubDate: "2026-08-23"
series: "ee-system"
order: 24
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
STM32 是嵌入式开发者的"母语"——大多数人从 STM32 入门，熟悉它的外设库、时钟树和开发流程。但当项目需要降本（换 GD32）、升性能（换 NXP i.MX RT）或客户指定平台（换 TI Tiva）时，"好像差不多"的直觉往往会坑人。

这三家厂商的芯片与 STM32 都有相似之处，但每个细节差异都可能让你调通一个外设花上三天。本文从实际迁移的角度，系统梳理 GD32、NXP i.MX RT、TI Tiva 与 STM32 的关键差异，附一张选型对比表。

---

## 一、GD32：最像 STM32，但处处"差一点"

GD32 是国产厂商兆易创新（GigaDevice）的 Cortex-M 系列，以 pin-to-pin 兼容 STM32 闻名。但"兼容"不等于"相同"。

### 1.1 硬件兼容：能直接替换吗？

**引脚兼容：** √ 大部分 GD32 可以直接焊到 STM32 的 PCB 上（前提是选了对应的型号，如 GD32F103 对应 STM32F103）。

**但软件不能直接烧：**

| 差异点 | GD32 | STM32（同引脚封装） |
|--------|------|-------------------|
| 主频 | 108 MHz（GD32F103） | 72 MHz（STM32F103） |
| Flash 零等待 | 0 wait states 只到 54 MHz | 0 wait states 到 72 MHz（有些型号） |
| USART 波特率公式 | `Fclk / (16 × USARTDIV)` 略有不同 | 标准公式 |
| ADC 转换时间 | 1.17 μs（GD32） | 1.0 μs（STM32） |
| 内部 RC 精度 | ±1%（25°C） | ±1%（全温度范围） |
| Timer 基址偏移 | 部分寄存器地址不同 | — |

### 1.2 最大陷阱：Flash 零等待

GD32 的 Flash 访问速度比 STM32 慢。GD32F103 只能在前 54 MHz 保持零等待（0 cycle），超过就要插入等待周期：

```c
/* GD32F103 时钟配置时需额外考虑 Flash 等待 */
if (sysclk <= 54000000) {
    /* 0 等待 */
    FMC_WRCTL &= ~FMC_WRCTL_WSCNT;
} else if (sysclk <= 72000000) {
    FMC_WRCTL = (FMC_WRCTL & ~FMC_WRCTL_WSCNT) | FMC_WRCTL_WSCNT_1;
} else if (sysclk <= 90000000) {
    FMC_WRCTL = (FMC_WRCTL & ~FMC_WRCTL_WSCNT) | FMC_WRCTL_WSCNT_2;
} else {
    FMC_WRCTL = (FMC_WRCTL & ~FMC_WRCTL_WSCNT) | FMC_WRCTL_WSCNT_3;
}
```

如果你直接用 STM32 的 72 MHz 配置并期望 0 等待，GD32 上会在 Flash 取指时插入额外等待，少数时序敏感的代码（如 DWT 延时循环）会跑偏。

### 1.3 USART 波特率：公式不同

STM32 的波特率公式：

```
BRR = Fck / (16 × BaudRate)
```

GD32 的 USART 级联分频器在某些型号上略有差异。高波特率（如 921600 或 2 Mbps）下误差会不同。如果你从 STM32 迁移代码，发现串口在高波特率下乱码——先查波特率误差。

### 1.4 迁移经验总结

```c
/* 移植原则：使用厂商 HAL，不要直接操作寄存器（除非你读了两家的 Reference Manual）*/

/* ❌ 直接操作寄存器——GPIOB->ODR 在两家地址不同 */
GPIOB->ODR |= (1 << 5);

/* ✅ 用 HAL/库函数封装 */
#if defined(USE_STM32_HAL)
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);
#elif defined(USE_GD32_STD)
    gpio_bit_set(GPIOB, GPIO_PIN_5);
#endif
```

---

## 二、NXP i.MX RT：当 Cortex-M 遇到 FlexRAM

i.MX RT 系列把 Cortex-M7 推到了 500+ MHz，最大的设计特色是 **FlexRAM**——SRAM 可以被灵活配置为 TCM（Tightly Coupled Memory）和通用 SRAM。

### 2.1 FlexRAM：TCM 大小可配置

Cortex-M7 的架构特色是 TCM——ITCM（指令紧耦合内存，指令取指用）和 DTCM（数据紧耦合内存，数据存取用）。TCM 不经过 Cache，访问延迟恒定为一个周期。

i.MX RT 的 FlexRAM 控制器允许将总 SRAM（通常 512KB~2MB）灵活配置：

```
FlexRAM 配置示例（512KB SRAM 分配）：
├── 场景 A：高性能 DSP
│   ITCM: 128KB │ DTCM: 128KB │ SRAM: 256KB
│
├── 场景 B：图形界面（大量帧缓冲）
│   ITCM: 64KB  │ DTCM: 64KB  │ SRAM: 384KB
│
├── 场景 C：纯控制（逻辑为主）
│   ITCM: 256KB │ DTCM: 256KB │ SRAM: 0KB
```

配置通过 IOMUXC_GPR 寄存器完成：

```c
/* 配置 FlexRAM 分配（在 system_clock_init 中调用）*/
#define FLEXRAM_ITCM_SIZE   (128 * 1024)   /* 128KB ITCM */
#define FLEXRAM_DTCM_SIZE   (128 * 1024)   /* 128KB DTCM */
#define FLEXRAM_OCRAM_SIZE  (256 * 1024)   /* 256KB OCRAM */

void flexram_config(void) {
    /* 写 IOMUXC_GPR 寄存器配置 bank 分配 */
    IOMUXC_GPR->GPR17 = (ITCM_SIZE_CONFIG << 0) |
                         (DTCM_SIZE_CONFIG << 8) |
                         (OCRAM_SIZE_CONFIG << 16);
    
    /* 等待配置生效 */
    while (IOMUXC_GPR->GPR16 & 0x01);
}
```

### 2.2 Cache 策略：WT vs WA

Cortex-M7 的 L1 Cache 有两个可配置的策略，对实时性影响很大：

| 策略 | 写操作 | 适合场景 |
|------|--------|---------|
| **WT**（Write-Through） | 写 Cache 同时写内存 | 外设寄存器映射区 |
| **WA**（Write-Back / Write-Allocate） | 只写 Cache，回写时机不确定 | 纯数据缓冲区 |

```c
/* i.MX RT 中配置 MPU 定义内存区域属性 */
void mpu_config(void) {
    /* 将 DTCM 区域配置为 Write-Back（高性能数据处理）*/
    MPU->RBAR = ARM_MPU_RBAR(0, 0x20000000);
    MPU->RASR = ARM_MPU_RASR(0,                           /* 无子区域禁用 */
                              ARM_MPU_AP_RO,               /* 特权可读写 */
                              0,                           /* 无指令访问限制 */
                              0,                           /* S=0 */
                              1,                           /* TEX=1, C=1, B=1 */
                              1,                           /* S=1 */
                              0,                           /* TEX=1 */
                              ARM_MPU_REGION_SIZE_256KB);
    /* ↑ 配置为 Normal Memory, Write-Back, Write-Allocate */
    
    /* 将 OCRAM 区域配置为 Write-Through（DMA 缓冲区）*/
    MPU->RBAR = ARM_MPU_RBAR(1, 0x20200000);
    MPU->RASR = ARM_MPU_RASR(...);
    /* ↑ 配置为 Normal Memory, Write-Through */
}
```

> **关键：** 如果 DMA 访问的内存区域用了 Write-Back Cache，CPU 写入了但数据还在 Cache 中，DMA 读内存时读到的是旧数据。必须用 Write-Through 或 Cache clean 操作。

### 2.3 Bootrom 启动流程

i.MX RT 有一个复杂的启动序列，不同于 STM32 直接从 0x08000000 启动：

```
上电复位
  │
  ├─ BootROM 运行（从内部 ROM 启动）
  │
  ├─ 读取 Boot Configuration Words（从外部 Flash）
  │   └─ 配置 FlexSPI 控制器
  │
  ├─ 从外部 Flash（QSPI NOR / NAND / SD / eMMC）加载镜像
  │   └─ 镜像头包含 IVT（Image Vector Table）和 DCD（Device Configuration Data）
  │
  └─ 跳转到用户 App

IVT 结构（必须放在外部 Flash 偏移 0x1000）：
0x1000: IVT Header
0x1020: Boot Data（程序入口、栈顶）
0x1040: DCD（配置 PLL、DDR、FlexRAM 等）
0x1060: 用户代码入口
```

**与 STM32 的差异：** STM32 从内部 Flash 直接映射到地址空间，无需 IVT。i.MX RT 必须在外部 Flash 中预先准备好 IVT + DCD，BootROM 才能正确配置时钟和存储控制器。

---

## 三、TI Tiva C Series：Stellaris 的血脉

### 3.1 Stellaris 遗产

Tiva C Series（TM4C123/129）的前身是 Luminary Micro 的 Stellaris 系列，后者是全球第一款 Cortex-M3 MCU（2006 年）。TI 收购后保留了大部分架构设计，所以 Tiva 的寄存器风格和外设设计与 STM32 差异较大。

### 3.2 ROM 驱动库（DriverLib ROM）

Tiva 一个独特的设计：**芯片内部 ROM 中预烧录了驱动库**。

```
Flash 布局：
0x0000_0000 ┌──────────────────────┐
            │ User Application     │
            ├──────────────────────┤
0x0002_0000 │ ROM Driver Library   │ ← 固化在 ROM 中
            │ （driverlib ROM）     │   无需从 Flash 读取，速度更快
            └──────────────────────┘
```

```c
#include "driverlib/rom.h"      /* 注意：不是 driverlib.h */

void uart_init(void) {
    /* 从 ROM 调用标准驱动函数 */
    ROM_SysCtlPeripheralEnable(SYSCTL_PERIPH_GPIOA);
    ROM_GPIOPinConfigure(GPIO_PA0_U0RX);
    ROM_GPIOPinConfigure(GPIO_PA1_U0TX);
    ROM_UARTConfigSetExpClk(UART0_BASE, 
                            ROM_SysCtlClockGet(), 
                            115200,
                            (UART_CONFIG_WLEN_8 | UART_CONFIG_STOP_ONE |
                             UART_CONFIG_PAR_NONE));
}
```

如果 `ROM_` 前缀的函数存在，编译器会生成对 ROM 地址的直接调用（`BL 0x0002xxxx`），不占用 Flash 代码空间。这是 Tiva 在资源受限场景下的一个独特优势。

### 3.3 FPU 默认使能

STM32F4 的 FPU 在复位时默认关闭，需要手动设置 CPACR 寄存器打开。Tiva C 系列（TM4C129）的 FPU 在 **Reset Handler** 中默认使能——这是它与 STM32 在浮点运算初始化的关键差异。

```c
/* STM32F4：需要手动开启 FPU */
void SystemInit(void) {
    /* ... 其他初始化 ... */
    SCB->CPACR |= ((3UL << 10*2) | (3UL << 11*2));  /* CP10, CP11 全权限 */
}

/* Tiva C：Reset_Handler 中已默认使能 FPU，无需额外配置 */
```

### 3.4 外设寄存器风格的差异

| 功能 | STM32 | Tiva C (TM4C) |
|------|-------|---------------|
| GPIO 输出 | `BRR/BSRR` 分别清零/置位 | `DATA` 位带操作 |
| 定时器 | 独立定时器 TIMx | GPTM（通用定时器模块，可拆分为两个 16-bit） |
| 中断号 | 按外设排列（如 USART1=37） | 按中断源排列（不同） |
| ADC | 规则/注入两组 | 多达 24 个采样序列 |

Tiva 的 **GPIO 位带操作（Bit-banding）** 非常简洁：

```c
/* Tiva C — 直接位带写 */
#define LED_RED   (*((volatile uint32_t *)0x42000000 + (GPIOF_BASE + 0x040)*32 + 1))
LED_RED = 1;   /* 只需要一个访存指令，原子操作 */

/* STM32 — 需要 BSRR 或 ODR 位操作 */
HAL_GPIO_WritePin(GPIOF, GPIO_PIN_1, GPIO_PIN_SET);
```

---

## 四、迁移注意事项清单

### 4.1 时钟树差异

| 芯片 | 主频 | 时钟生成方式 | 特殊之处 |
|------|:----:|:-----------:|---------|
| STM32F4 | 168 MHz | HSE→PLL→SYSCLK | APB1=42MHz, APB2=84MHz |
| GD32F1 | 108 MHz | 类似结构 | Flash 等待周期不同 |
| i.MX RT1050 | 528 MHz | 外部 24MHz→PLL | PLL 有多组（ARM PLL、SYS PLL 等） |
| TM4C129 | 120 MHz | 主振荡器→PLL | 精度要求 ±500ppm |

### 4.2 外设寄存器基址不同

这是最容易被忽视的问题。即便 PIN TO PIN 兼容，外设挂载的 AHB/APB 总线也可能不同：

```c
/* STM32F103 — USART1 基址 */
#define USART1_BASE    0x40013800

/* GD32F103 — USART1 基址 */
#define USART1_BASE    0x40013800  /* 巧合相同，但不保证所有外设 */
```

**建议：** 不要硬编码外设基址，使用厂商提供的 `_BASE` 宏定义，迁移时只需替换头文件。

### 4.3 中断号偏移

```c
/* STM32F103 USART1 中断号 */
#define USART1_IRQn    37

/* TM4C123 UART0 中断号 */
#define INT_UART0      21
```

中断号不同意味着 NVIC 的注册方式完全不同。使用 CMSIS 的 `NVIC_SetPriority()` 等函数可以隔离部分差异，但中断向量表仍需要按目标芯片调整。

### 4.4 HAL 接口标准化

尽量用 CMSIS 标准接口隔离差异：

```c
/* 使用 CMSIS 标准 API（各厂都支持）*/
uint32_t ticks = SysTick->VAL;           /* SysTick 计数器 */
NVIC_EnableIRQ(USART1_IRQn);              /* NVIC 使能 */
__WFI();                                  /* 等待中断 */
```

对于外设级操作，建议做一层抽象封装：

```c
/* 硬件抽象层示例：GPIO 输出 */
#if defined(MCU_STM32)
    #include "stm32f4xx_hal.h"
    #define HW_GPIO_SET(pin)   HAL_GPIO_WritePin(pin.port, pin.num, GPIO_PIN_SET)
    
#elif defined(MCU_TM4C)
    #include "tm4c1294ncpdt.h"
    #define HW_GPIO_SET(pin)   (pin.port->DATA_Bits[1 << pin.num] = 0xFF)
    
#elif defined(MCU_GD32)
    #include "gd32f10x.h"
    #define HW_GPIO_SET(pin)   gpio_bit_set(pin.port, pin.num)
    
#elif defined(MCU_MIMXRT)
    #include "fsl_gpio.h"
    #define HW_GPIO_SET(pin)   GPIO_PinWrite(pin.port, pin.num, 1)
#endif
```

---

## 五、选型对比表

| 维度 | STM32F4 | GD32F4 | NXP i.MX RT | TI Tiva C |
|------|:-------:|:------:|:-----------:|:---------:|
| 内核 | Cortex-M4F | Cortex-M4F | Cortex-M7 | Cortex-M4F |
| 最高主频 | 168 MHz | 200 MHz | 528 MHz | 120 MHz |
| SRAM | ≤192 KB | ≤192 KB | ≤2 MB (FlexRAM) | ≤256 KB |
| Flash | ≤2 MB | ≤1 MB | 无内置（外部 QSPI） | ≤1 MB |
| 单价（1K） | $3~8 | $1.5~4 | $9~30 | $2~6 |
| 生态成熟度 | ★★★★★ | ★★★ | ★★★★ | ★★★ |
| 开发功耗 | 低（大量工具） | 低（兼容 STM32） | 高（需懂 MPU/Cache） | 中 |
| 适合场景 | 通用嵌入式 | 降本替代 | 高性能计算/显示 | 工业/传感器 |

**快速选型建议：**

- **想降本，不想改硬件** → GD32（pin-to-pin 替换，但软件需调整时钟和 Flash 配置）
- **需要极致计算性能** → i.MX RT（500+ MHz + TCM + Cache + 丰富外设）
- **对实时性要求高、想用 ROM 驱动库** → TI Tiva（driverlib ROM 节省 Flash）
- **开发效率优先、生态优先** → 继续用 STM32（除非非换不可）

---

> 没有"最好的芯片"，只有"最合适的平台"。迁移的本质，不是找 STM32 的替代品，而是理解新平台的设计哲学——从 GD32 的"近似兼容"，到 i.MX RT 的"Cortex-M 极限"，再到 Tiva 的"ROM 驱动库"思维。读懂差异，才能用好每一个平台。

> 🏷️ GD32 STM32 NXP i.MX RT TI Tiva FlexRAM TCM Cache策略 Cortex-M7 Flash零等待 BootROM 外设迁移 芯片选型 嵌入式
