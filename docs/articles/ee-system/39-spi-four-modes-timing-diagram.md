---
title: "嵌入式知识体系 · #39 · SPI 的四种模式与时序图速记法"
description: "## 一、CPOL（时钟极性）与 CPHA（时钟相位）的组合"
pubDate: "2026-08-23"
series: "ee-system"
order: 39
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
## 一、CPOL（时钟极性）与 CPHA（时钟相位）的组合

SPI 的四种模式由两个参数决定：CPOL（Clock Polarity）和 CPHA（Clock Phase）。

### CPOL：空闲时钟电平

| CPOL | 空闲电平 | 有效沿方向 |
|------|---------|-----------|
| 0 | 低电平（SCK 空闲为 0） | 低→高（上升沿）和 高→低（下降沿） |
| 1 | 高电平（SCK 空闲为 1） | 高→低（下降沿）和 低→高（上升沿） |

### CPHA：数据采样边沿

| CPHA | 采样边沿 | 数据变化边沿 |
|------|---------|-------------|
| 0 | 第一个时钟边沿采样 | 第二个时钟边沿变化 |
| 1 | 第二个时钟边沿采样 | 第一个时钟边沿变化 |

### 四种模式一览

| 模式 | CPOL | CPHA | 采样边沿 | 数据发射边沿 | 典型器件 |
|------|------|------|---------|-------------|---------|
| Mode 0 | 0 | 0 | 上升沿 | 下降沿 | **最通用**，W25Qxx、SD 卡、MAX31865 |
| Mode 1 | 0 | 1 | 下降沿 | 上升沿 | 部分 ADC（如 MCP3008） |
| Mode 2 | 1 | 0 | 下降沿 | 上升沿 | 部分射频芯片 |
| Mode 3 | 1 | 1 | 上升沿 | 下降沿 | NRF24L01、部分 EEPROM |

```c
/* STM32 SPI 模式配置 */
#include "stm32f4xx_hal.h"

SPI_HandleTypeDef hspi1;

void SPI_ModeConfiguration(void)
{
    hspi1.Instance = SPI1;
    hspi1.Init.Mode = SPI_MODE_MASTER;
    hspi1.Init.Direction = SPI_DIRECTION_2LINES;
    hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
    hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;    /* CPOL = 0 */
    hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;         /* CPHA = 0 */
    hspi1.Init.NSS = SPI_NSS_SOFT;                 /* 软件片选 */
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
    hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
    hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
    hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
    hspi1.Init.CRCPolynomial = 10;
    
    HAL_SPI_Init(&hspi1);
}

/* 快速切换模式（连接不同器件时） */
void SPI_SwitchMode(int mode)
{
    HAL_SPI_DeInit(&hspi1);
    
    switch (mode) {
        case 0:
            hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
            hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
            break;
        case 1:
            hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
            hspi1.Init.CLKPhase = SPI_PHASE_2EDGE;
            break;
        case 2:
            hspi1.Init.CLKPolarity = SPI_POLARITY_HIGH;
            hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
            break;
        case 3:
            hspi1.Init.CLKPolarity = SPI_POLARITY_HIGH;
            hspi1.Init.CLKPhase = SPI_PHASE_2EDGE;
            break;
    }
    
    HAL_SPI_Init(&hspi1);
}
```

## 二、四种模式的时序图对比

### Mode 0（CPOL=0, CPHA=0）

```
CS     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╸     ↑ 片选拉低开始
                                                 ╸━━━
SCK    ╸╸___╸___╸___╸___╸___╸___╸___╸___╸___╸        ↑ SCK 空闲低
         ↑   ↑   ↑   ↑   ↑   ↑   ↑   ↑
       采样 采样 采样 采样 采样 采样 采样 采样（上升沿）
MOSI   ╸╸ D7╸ D6╸ D5╸ D4╸ D3╸ D2╸ D1╸ D0            ↑ MOSI 在下降沿变化
MISO   ╸╸ d7╸ d6╸ d5╸ d4╸ d3╸ d2╸ d1╸ d0
```

### Mode 1（CPOL=0, CPHA=1）

```
CS     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╸
                                                 ╸━━━
SCK    ╸╸___╸___╸___╸___╸___╸___╸___╸___╸___╸
           ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓
         采样 采样 采样 采样 采样 采样 采样 采样（下降沿）
MOSI   ╸╸ D7╸ D6╸ D5╸ D4╸ D3╸ D2╸ D1╸ D0            ↑ 第一个边沿变化（上升沿）
MISO   ╸╸ d7╸ d6╸ d5╸ d4╸ d3╸ d2╸ d1╸ d0
```

### Mode 2（CPOL=1, CPHA=0）

```
CS     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╸
                                                 ╸━━━
SCK    ╸╸━━━╸___╸___╸___╸___╸___╸___╸___╸___╸        ↑ SCK 空闲高
           ↑   ↑   ↑   ↑   ↑   ↑   ↑   ↑
         采样 采样 采样 采样 采样 采样 采样 采样（下降沿）
MOSI   ╸╸ D7╸ D6╸ D5╸ D4╸ D3╸ D2╸ D1╸ D0
MISO   ╸╸ d7╸ d6╸ d5╸ d4╸ d3╸ d2╸ d1╸ d0
```

### Mode 3（CPOL=1, CPHA=1）

```
CS     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╸
                                                 ╸━━━
SCK    ╸╸━━━╸___╸___╸___╸___╸___╸___╸___╸___╸
           ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓
         采样 采样 采样 采样 采样 采样 采样 采样（上升沿）
MOSI   ╸╸ D7╸ D6╸ D5╸ D4╸ D3╸ D2╸ D1╸ D0
MISO   ╸╸ d7╸ d6╸ d5╸ d4╸ d3╸ d2╸ d1╸ d0
```

### 速记口诀

```
CPOL=0 空闲低，CPOL=1 空闲高
CPHA=0 第一个沿采样，CPHA=1 第二个沿采样

Mode 0：低空闲 + 上升采样（最常用，几乎全兼容）
Mode 1：低空闲 + 下降采样
Mode 2：高空闲 + 下降采样
Mode 3：高空闲 + 上升采样
```

硬件工程师速记法：**"CPOL 看空闲，CPHA 看第几个采样。Mode 0 = Mode 3 互换（反转 CPOL），Mode 1 = Mode 2 互换。"**

## 三、DMA 配合 SPI 实现高速传输

### 为什么需要 DMA + SPI

纯 CPU 轮询传输时，每个字节都需要 CPU 等待发送完成，8 MHz SCK 下每秒约 1 MB 的数据量会导致 CPU 占用率接近 100%。DMA 让 CPU 仅配置传输参数，后续数据搬运由 DMA 控制器完成。

```c
/* STM32F4 SPI + DMA 双缓冲传输 */

#define SPI_TX_DMA_STREAM   DMA2_Stream3
#define SPI_RX_DMA_STREAM   DMA2_Stream2
#define SPI_BUFFER_SIZE     4096

static uint8_t tx_buffer[SPI_BUFFER_SIZE] __attribute__((aligned(32)));
static uint8_t rx_buffer[SPI_BUFFER_SIZE] __attribute__((aligned(32)));

/* SPI + DMA 初始化 */
void SPI_DMA_Init(void)
{
    /* SPI 配置（Mode 0，8 MHz SCK） */
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_8;  /* 84 MHz / 8 = 10.5 MHz */
    hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
    hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
    HAL_SPI_Init(&hspi1);
    
    /* 使能 SPI 的 DMA 请求 */
    __HAL_SPI_ENABLE(&hspi1);
    
    /* 配置 TX DMA */
    hdma_tx.Instance = SPI_TX_DMA_STREAM;
    hdma_tx.Init.Channel = DMA_CHANNEL_3;        /* SPI1 TX 通道 */
    hdma_tx.Init.Direction = DMA_MEMORY_TO_PERIPH;
    hdma_tx.Init.PeriphInc = DMA_PINC_DISABLE;
    hdma_tx.Init.MemInc = DMA_MINC_ENABLE;
    hdma_tx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
    hdma_tx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
    hdma_tx.Init.Mode = DMA_NORMAL;              /* 双缓冲使用循环模式 */
    hdma_tx.Init.Priority = DMA_PRIORITY_HIGH;
    hdma_tx.Init.FIFOMode = DMA_FIFOMODE_ENABLE;
    HAL_DMA_Init(&hdma_tx);
    __HAL_LINKDMA(&hspi1, hdmatx, hdma_tx);
    
    /* 配置 RX DMA */
    hdma_rx.Instance = SPI_RX_DMA_STREAM;
    hdma_rx.Init.Channel = DMA_CHANNEL_3;
    hdma_rx.Init.Direction = DMA_PERIPH_TO_MEMORY;
    hdma_rx.Init.PeriphInc = DMA_PINC_DISABLE;
    hdma_rx.Init.MemInc = DMA_MINC_ENABLE;
    hdma_rx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
    hdma_rx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
    hdma_rx.Init.Mode = DMA_NORMAL;
    hdma_rx.Init.Priority = DMA_PRIORITY_HIGH;
    hdma_rx.Init.FIFOMode = DMA_FIFOMODE_ENABLE;
    HAL_DMA_Init(&hdma_rx);
    __HAL_LINKDMA(&hspi1, hdmarx, hdma_rx);
}

/* 双缓冲传输：前一半传输期间填充后一半 */
void SPI_DMA_PingPongTransfer(int data_len)
{
    const int half = data_len / 2;
    
    /* 用双缓冲机制：先发前一半，同时准备后一半 */
    for (int round = 0; round < 2; round++) {
        uint8_t *buf = (round == 0) ? tx_buffer : tx_buffer + half;
        
        /* 准备数据（可在上一个 DMA 传输期间并行准备） */
        PrepareData(buf, half, round);
    }
    
    /* 启动第一个半区的 DMA 传输 */
    HAL_SPI_Transmit_DMA(&hspi1, tx_buffer, half);
    
    /* 在中断回调中再启动第二个半区 */
}

/* DMA 传输完成回调 */
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
    static int half_done = 0;
    static int total_sent = 0;
    
    if (hspi->Instance == SPI1) {
        int next_half = (half_done + 1) % 2;
        int offset = next_half * (SPI_BUFFER_SIZE / 2);
        
        PrepareData(tx_buffer + offset, SPI_BUFFER_SIZE / 2, next_half);
        
        HAL_SPI_Transmit_DMA(&hspi1, tx_buffer + offset, SPI_BUFFER_SIZE / 2);
        half_done = next_half;
        total_sent += SPI_BUFFER_SIZE / 2;
    }
}
```

**性能对比（STM32F4 @ 168 MHz, SCK @ 10.5 MHz）：**

| 传输方式 | 理论吞吐量 | CPU 占用 | 适用场景 |
|---------|-----------|---------|---------|
| 轮询 | ~1 MB/s | ~95% | 少量数据（< 64 字节） |
| 中断 | ~1 MB/s | ~30% | 中等数据量 |
| DMA（单次） | ~1 MB/s | ~5% | 大块数据 |
| DMA（双缓冲） | ~1 MB/s | ~2% | 实时连续流（如音频 DAC） |

## 四、QSPI / Dual SPI 与 XIP（就地执行）

### 标准 SPI vs 多线 SPI

| 类型 | 数据线数 | 单次时钟传输 | 常用器件 |
|------|---------|-------------|---------|
| SPI | 1 TX + 1 RX | 1 bit | 几乎所有 SPI 外设 |
| Dual SPI | 2 IO（IO0/IO1） | 2 bit | W25Q16JV（Dual Output） |
| Quad SPI | 4 IO（IO0~IO3） | 4 bit | W25Q64, MX25L256, NAND Flash |
| Octo SPI | 8 IO | 8 bit | 高端 HyperFlash, Xccela |

```c
/* W25Q64 读操作对比 */
void W25Q_Read_STD(uint32_t addr, uint8_t *data, uint32_t len)
{
    uint8_t cmd[4] = {0x03,          /* 标准读命令 */
                      (addr >> 16) & 0xFF,
                      (addr >> 8) & 0xFF,
                      addr & 0xFF};
    
    CS_LOW();
    HAL_SPI_Transmit(&hspi1, cmd, 4, 1000);     /* 发送命令 + 地址 */
    HAL_SPI_Receive(&hspi1, data, len, 1000);    /* 单线读数据 */
    CS_HIGH();
    /* 速率：30 MHz SCK × 1 bit = 3.75 MB/s */
}

void W25Q_Read_QUAD(uint32_t addr, uint8_t *data, uint32_t len)
{
    uint8_t cmd[6] = {0xEB,          /* Quad I/O 快速读 */
                      (addr >> 16) & 0xFF,
                      (addr >> 8) & 0xFF,
                      addr & 0xFF,
                      0xFF,          /* 模式位 */
                      0xFF};         /* 等待期（需 6 dummy cycles） */
    
    /* 切换到 Quad I/O 模式 */
    QUAD_Enable();                    /* 设置 QE bit 在状态寄存器 */
    
    CS_LOW();
    /* 前 6 字节：命令 + 地址 + dummy（在标准 SPI 模式下发送） */
    HAL_SPI_Transmit(&hspi1, cmd, 6, 1000);
    
    /* 后续数据：使用 4 线 Quad 模式（IO0~IO3 全双工） */
    HAL_QSPI_Receive(&hqspi, data, len, 1000);
    CS_HIGH();
    /* 速率：30 MHz SCK × 4 bit = 15 MB/s（4倍提升！） */
}
```

### 配置 QSPI 的步骤

```c
/* STM32H7 QUADSPI 初始化（W25Q64 为例） */
void QUADSPI_Init(void)
{
    hqspi.Instance = QUADSPI;
    hqspi.Init.ClockPrescaler = 2;         /* 200 MHz / (2+1) = 66.7 MHz */
    hqspi.Init.FifoThreshold = 4;
    hqspi.Init.SampleShifting = QSPI_SAMPLE_SHIFTING_NONE;
    hqspi.Init.FlashSize = 23;             /* 2^23 = 8 MB */
    hqspi.Init.ChipSelectHighTime = 2;     /* CS 高电平最小保持 */
    hqspi.Init.ClockMode = QSPI_CLOCK_MODE_0;
    hqspi.Init.FlashID = QSPI_FLASH_ID_1;
    hqspi.Init.DualFlash = QSPI_DUALFLASH_DISABLE;
    HAL_QSPI_Init(&hqspi);
    
    /* 启用 Quad 模式（设置 W25Q64 状态寄存器 QE bit） */
    QSPI_WriteEnable();
    QSPI_AutoPollingMemReady();
}
```

### XIP（eXecute In Place）

XIP 使 CPU 可以直接从外部 QSPI Flash 执行代码，无需将代码复制到 RAM 中。适用于：

- 代码量超过片上 Flash 的场景
- 需要大容量固件存储的应用
- 部分 OTA 升级方案

**实现前提：**

1. MCU 必须支持 Memory-Mapped 模式（如 STM32H7 的 QUADSPI Bank1 映射到 0x90000000）
2. QSPI Flash 必须支持 XIP（大部分 NOR Flash 支持，NAND Flash 不支持）
3. Linker script 需将代码段定位到 QSPI 映射地址

```ld
/* STM32H750 链接脚本片段：将代码定位到外部 QSPI */
MEMORY
{
    /* 内部 Flash（128 KB）存放 bootloader 和关键配置 */
    FLASH      (rx)  : ORIGIN = 0x08000000, LENGTH = 128K
    
    /* 外部 QSPI Flash（2 MB）存放主应用程序和数据 */
    EXT_FLASH  (rx)  : ORIGIN = 0x90000000, LENGTH = 2M
    
    /* 内部 SRAM */
    RAM        (rw)  : ORIGIN = 0x24000000, LENGTH = 512K
    DTCM       (rw)  : ORIGIN = 0x20000000, LENGTH = 128K
}

SECTIONS
{
    /* 中断向量表放内部 Flash（更快响应） */
    .isr_vector : {
        KEEP(*(.isr_vector))
    } > FLASH
    
    /* 主代码放在外部 QSPI 执行 */
    .text : {
        *(.text*)
        *(.rodata*)
    } > EXT_FLASH
    
    /* 读写数据放在内部 RAM */
    .data : {
        *(.data*)
    } > RAM AT > EXT_FLASH
    
    .bss : {
        *(.bss*)
    } > RAM
}
```

**XIP 性能影响因素：**

| 因素 | 影响 | 优化措施 |
|------|------|---------|
| QSPI 时钟频率 | 33~100 MHz | 调高（受 PCB 走线限制） |
| CPU Cache | 命中率 > 90% 时损耗 < 5% | 启用 ICache + DCache |
| Flash 读延迟 | 多数 QSPI Flash 有 6~8 个 dummy cycle | 使用快速读命令 + 预取 |
| 写操作 | XIP 区域不可写 | 写 Flash 前跳转到 RAM 执行 |

> 🏷️ SPI CPOL CPHA 四种模式 DMA QSPI XIP 时序图
