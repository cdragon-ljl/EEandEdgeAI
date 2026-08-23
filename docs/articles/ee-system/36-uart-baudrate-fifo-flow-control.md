---
title: "嵌入式知识体系 · #36 · UART 深入：波特率容限、FIFO 与硬流控"
description: "## 一、波特率误差的计算与容限分析"
pubDate: "2026-08-23"
series: "ee-system"
order: 36
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
## 一、波特率误差的计算与容限分析

UART 的异步通信依赖于双方约定的波特率。由于时钟源频率通常无法整除目标波特率，误差不可避免。嵌入式开发中最常见的场景——从 16 MHz 系统时钟分频出 115200 bps。

### 分频值与误差计算

大多数 MCU 的 UART 外设采用整数分频器（UARTDIV），部分高端芯片支持小数分频器（如 STM32 的 USART_BRR 含 4 bit 小数位）。对于标准整数分频：

```
DIV = SYSCLK / (16 × BaudRate)  — 标准模式（16 倍过采样）
DIV = SYSCLK / (8 × BaudRate)   — 8 倍过采样模式（更高波特率）
```

以 STM32F103 @ 72 MHz 计算 115200：

```
DIV = 72000000 / (16 × 115200) = 39.0625
```

若 USARTDIV 只有整数部分，取 39，则实际波特率：

```
Baud_actual = 72000000 / (16 × 39) = 115384.6
Error = (115384.6 - 115200) / 115200 ≈ +0.16%
```

若取 40：

```
Baud_actual = 72000000 / (16 × 40) = 112500
Error = (112500 - 115200) / 115200 ≈ -2.34%
```

### 容限标准

UART 异步帧格式包含 1 start bit + 5~8 data bits + 可选 parity + 1~2 stop bits。最坏情况下，误差累积在最后一个数据位（约第 10 位采样点）。采样点偏移不得超过 1/2 bit 周期：

```
Error_tolerance ≤ ±(1 / (2 × Total Bits)) × 100%
```

- 8N1（10 bit 帧）：容限 ±5.0%
- 8E1（11 bit 帧）：容限 ±4.54%
- 8N2（12 bit 帧）：容限 ±4.17%

理论上 2.34% 误差接近但仍处于 8N1 的容限内，实践中会显著增加误码率。**推荐误差 < 1.5%**，STM32 库函数 `HAL_UART_Init()` 会对 > 3% 的配置报错。

```c
/* STM32 波特率配置代码示例 */
void UART_SetBaudrate(USART_TypeDef *USARTx, uint32_t PeriphClk, uint32_t BaudRate)
{
    uint32_t div, frac, regval;
    
    /* 整数部分 */
    div = (25 * PeriphClk) / (4 * BaudRate);
    frac = (div >> 1) & 0x07;       /* 小数部分（3 bit） */
    regval = ((div >> 3) & 0xFFF0) | frac;
    
    USARTx->BRR = regval;
    
    /* 验证实际波特率 */
    float actual = (float)PeriphClk / (16 * (div / 25.0f));
    float error = (actual - BaudRate) / BaudRate * 100.0f;
    
    if (fabs(error) > 3.0f) {
        printf("WARNING: Baud rate error %.2f%% exceeds 3%%\n", error);
    }
}
```

**经验法则：** 优先选择能被目标波特率整除的系统时钟频率，或启用小数分频器。若误差无法避免，让通信双方承受同向误差（如都偏高 0.5%），比一方偏高一方偏低更安全。

## 二、FIFO 深度的选择与溢出处理

### FIFO 为什么重要

传统 UART 每接收一个字节触发一次中断，高波特率下中断频繁，CPU 大量时间在进/出中断。FIFO 允许累计多个字节后统一触发中断，降低中断频率。

### 典型 FIFO 深度

| MCU 系列 | UART FIFO 深度 | 触发阈值选项 |
|----------|---------------|-------------|
| STM32F1 (USART) | 无硬件 FIFO | N/A（单字节） |
| STM32F4 (USART) | 无硬件 FIFO | N/A |
| STM32G4 (LPUART) | 8 字节 | 1/4/7/8 |
| STM32H7 (UART) | 16 字节 | 1/4/8/14 |
| ESP32 (UART) | 128 字节 | 可配置 1~127 |
| NXP i.MX RT (LPUART) | 4 字节 | 1/2/3/4 |
| Linux 8250 (16550A) | 16 字节 | 1/4/8/14 |

### 溢出场景与处理

FIFO 溢出发生在**数据到达速率 > CPU 读取速率**时。常见于：

1. **高波特率 + 频繁进出临界区**（关中断时间过长）
2. **DMA 未启用**，CPU 逐字节搬运
3. **操作系统任务抢占**导致 ISR 响应延迟

**解决方案优先级：**

```
① 启用 FIFO + 合理阈值 → ② DMA 传输 → ③ 环形缓冲区 → ④ 流控
```

```c
/* ESP32 UART FIFO 配置示例 */
#include "driver/uart.h"

#define UART_PORT     UART_NUM_1
#define BUF_SIZE      (2048)
#define TXD_PIN       (GPIO_NUM_4)
#define RXD_PIN       (GPIO_NUM_5)

void uart_fifo_config(void)
{
    uart_config_t uart_config = {
        .baud_rate = 921600,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .rx_flow_ctrl_thresh = 120,  /* RTS 触发阈值（FIFO 128 字节） */
        .source_clk = UART_SCLK_APB,
    };
    
    uart_param_config(UART_PORT, &uart_config);
    uart_set_pin(UART_PORT, TXD_PIN, RXD_PIN, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    
    /* 安装驱动时指定 FIFO 缓冲区大小 */
    uart_driver_install(UART_PORT, BUF_SIZE, 0, 0, NULL, 0);
    
    /* 设置 RX FIFO 满中断触发阈值（1~127） */
    uart_set_rx_full_threshold(UART_PORT, 64);
    
    /* 超时：FIFO 未满但停止接收超过 N 字符时间 */
    uart_set_rx_timeout(UART_PORT, 10);
}

/* 中断处理：批量读取 FIFO */
static void uart_event_handler(void *arg)
{
    uint8_t data[128];
    int length = uart_read_bytes(UART_PORT, data, sizeof(data), 0);
    if (length > 0) {
        process_received_data(data, length);
    }
}
```

**FIFO 深度选择的经验法则：** 深度 = 系统最大关中断时间(μs) × 波特率(bps) / 8 / 1000000。例如关中断 50 μs @ 115200 bps = 50 × 115200 / 8 / 1e6 ≈ 0.72 字节 → 4 字节 FIFO 足够。@ 921600 bps 则需要 > 5 字节 → 推荐 16 字节以上 FIFO。

## 三、RTS/CTS 硬流控的使用时机

### 流控物理信号

```
DTE（主机）                    DCE（设备）
  TXD    ——————————————————→   RXD
  RXD    ←——————————————————   TXD
  RTS    ——————————————————→   CTS
  CTS    ←——————————————————   RTS
  GND    ———————————————————   GND
```

- **RTS（Request To Send）：** 发送方输出，告诉对方"我准备好接收了"
- **CTS（Clear To Send）：** 接收方输入，对方告诉我"可以发送"

### 什么时候必须用硬流控

| 场景 | 流控必要性 | 说明 |
|------|-----------|------|
| 115200 bps，双方 CPU 空闲 | ❌ 不需要 | 软件足以处理 |
| 921600 bps，存在中断延迟 | ✅ 强烈推荐 | 中断延迟 > 1 字符时间即溢出 |
| 3M bps 以上 | ✅ 必须 | 无流控基本不可靠 |
| 长线缆 > 10m | ✅ 推荐 | 信号反射 + 噪声增加误码 |
| 多模组共享总线（RS485） | N/A | 改用 DE/RE 控制 |

```c
/* STM32 硬流控初始化 */
void UART_HwFlowInit(void)
{
    UART_HandleTypeDef huart;
    
    huart.Instance = USART1;
    huart.Init.BaudRate = 460800;
    huart.Init.WordLength = UART_WORDLENGTH_8B;
    huart.Init.StopBits = UART_STOPBITS_1;
    huart.Init.Parity = UART_PARITY_NONE;
    huart.Init.Mode = UART_MODE_TX_RX;
    huart.Init.HwFlowCtl = UART_HWCONTROL_RTS_CTS;  /* 启用硬流控 */
    huart.Init.OverSampling = UART_OVERSAMPLING_16;
    
    HAL_UART_Init(&huart);
    
    /* RTS 引脚：PA12 (USART1_RTS) */
    /* CTS 引脚：PA11 (USART1_CTS) */
}
```

**注意陷阱：** RTS/CTS 交叉连接经常被搞反。DTE（如 PC 串口）的 RTS 接 DCE（如模块）的 CTS，反之亦然。使用 USB 转串口模块（如 CP2102/CH340）时，通常已内部交叉，直连即可。

## 四、RS232 / RS422 / RS485 的电气差异与选型

### 电气特性对比

| 参数 | RS232 | RS422 | RS485 |
|------|-------|-------|-------|
| 传输方式 | 单端 | 差分 | 差分 |
| 信号线数量 | 3+（TX/RX/GND） | 4（T+/T-/R+/R-） | 2（A/B） |
| 最大距离 | ~15m | ~1200m | ~1200m |
| 最大速率 | 115.2 kbps（典型） | 10 Mbps | 10 Mbps（典型 10M@12m） |
| 共模电压范围 | ±15V | -7V ~ +12V | -7V ~ +12V |
| 接收器输入阻抗 | 3~7 kΩ | 4 kΩ（典型） | 12 kΩ（单位负载） |
| 节点数 | 点对点（2 设备） | 1 发 10 收 | 32 单位负载（最多 256 个） |
| 逻辑 1 | -3V ~ -15V | A-B > +200mV | A-B > +200mV |
| 逻辑 0 | +3V ~ +15V | A-B < -200mV | A-B < -200mV |

### 典型收发器芯片

```c
/* 选型速查表 */
const char *transceiver_recommend(const char *standard, int baud)
{
    if (strcmp(standard, "RS232") == 0) {
        if (baud <= 115200) return "MAX232 / SP3232";   /* 经典 5V 方案 */
        if (baud <= 1000000) return "MAX3223 / MAX3232"; /* 3.3V 兼容 */
        return "ADM3202";                                 /* 高速 */
    }
    else if (strcmp(standard, "RS422") == 0) {
        if (baud <= 10000000) return "MAX3490 / SN65HVD31";
        return "DS26LV31/32";
    }
    else if (strcmp(standard, "RS485") == 0) {
        if (baud <= 115200) return "MAX485 / SP485";     /* 经典廉价 */
        if (baud <= 500000) return "SN65HVD3082E";        /* 低功耗 */
        if (baud <= 50000000) return "MAX3485 / SN65HVD10";/* 高速 */
        return "THVD1550";                                /* 防雷保护 */
    }
    return "UNKNOWN";
}
```

### 选型流程图

```
需要多长距离？
├── < 15m：是否多节点？
│   ├── 仅 2 设备 → RS232（简单便宜）
│   └── > 2 设备 → RS485
└── > 15m → 必须差分
    ├── 仅 1 发多收 → RS422（四线全双工）
    └── 多节点半双工 → RS485（两线，带使能控制）
```

**实际工程提示：** 即使标称 15m，RS232 在 9600 bps 下可靠传输 30m 也很常见，取决于线缆质量和环境噪声。RS485 的 1200m 是指 100 kbps 以下的低速，速率每提高 10 倍，有效距离约缩短为 1/10（10 Mbps 时约 12m 可靠）。

> 🏷️ UART 波特率误差 FIFO 硬流控 RS232 RS422 RS485 工业通信
