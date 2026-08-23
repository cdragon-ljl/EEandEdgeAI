---
title: "嵌入式知识体系 · #37 · RS485 与 Modbus RTU：工业通信的黄金搭档"
description: "## 一、半双工 DE/RE 引脚的控制时机"
pubDate: "2026-08-23"
series: "ee-system"
order: 37
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
## 一、半双工 DE/RE 引脚的控制时机

RS485 是半双工总线，同一时刻只有一个节点可以发送。收发器芯片（如 MAX485 / SN65HVD3082）提供两个控制引脚：

- **DE（Driver Enable）：** 高电平使能发送器
- **RE（Receiver Enable）：** 低电平使能接收器

绝大多数设计将 DE 和 RE 短接，由同一 GPIO 控制：

```
GPIO = 1 → DE=1, RE=1（发送模式，接收器关闭）
GPIO = 0 → DE=0, RE=0（接收模式，驱动器关闭）
```

### 关键控制时序

**从接收到发送的切换：** 发送前先将 GPIO 置 1 使能驱动器，**必须等待**收发器的使能时间（`t_enable`）再发送数据。

**从发送到接收的切换：** 最后一个 bit 从 TX 引脚发出后，**不能立即**将 GPIO 置 0，必须等待最后一个 bit 实际出现在总线上的传播时间 + 收发器关闭时间。

```c
/* RS485 DE/RE 控制的典型实现（基于 STM32 HAL） */
#define RS485_DIR_PORT    GPIOB
#define RS485_DIR_PIN     GPIO_PIN_1
#define RS485_BAUD        9600
#define BIT_TIME_US       (1000000 / RS485_BAUD)  /* 约 104 μs */

/* 发送使能，等待驱动器稳定 */
void RS485_EnableTx(void)
{
    HAL_GPIO_WritePin(RS485_DIR_PORT, RS485_DIR_PIN, GPIO_PIN_SET);
    /* 等待收发器使能（典型 1~5 μs，安全起见等一个 bit 时间） */
    delay_us(BIT_TIME_US);
}

/* 接收使能，等待总线释放 */
void RS485_EnableRx(void)
{
    /* 等待最后一个字节的停止位传输完毕 */
    while (!(USART1->SR & USART_SR_TC));  /* 等待发送完成标志 */
    delay_us(BIT_TIME_US / 2);            /* 额外等待半个 bit 确保总线安静 */
    HAL_GPIO_WritePin(RS485_DIR_PORT, RS485_DIR_PIN, GPIO_PIN_RESET);
}

/* 发送一帧数据 */
void RS485_SendFrame(uint8_t *data, uint16_t len)
{
    RS485_EnableTx();
    HAL_UART_Transmit(&huart1, data, len, 100);
    RS485_EnableRx();
}
```

**⚠️ 常见 Bug：** `HAL_UART_Transmit()` 返回后最后一个字节可能才刚进入移位寄存器，此时关闭驱动器会导致最后一个字节只有部分被发出。务必等待 TC（Transmission Complete）标志。

## 二、终端电阻与偏置电阻的匹配计算

### 终端电阻

RS485 总线两端各需一个 120 Ω 终端电阻，匹配双绞线特性阻抗（~120 Ω），消除信号反射。

```
[节点1]——A—————120Ω———A———[节点2]——A——...——A———120Ω———[节点N]
        ——B—————120Ω———B——[节点2]——B——...——B———120Ω———[节点N]
```

**终端电阻只加在总线物理末端**，而非每个节点。中间节点应移除跳线或电阻。

### 偏置电阻解决"空闲不定态"

当总线上所有节点都处于接收模式（驱动器关闭），总线 A-B 之间无压差，接收器输出不确定。偏置电阻在 A 线上拉、B 线下拉，确保空闲时 A-B > 200 mV（逻辑 1）。

```c
/* 偏置电阻计算工具 */
typedef struct {
    float vcc;          /* 供电电压，如 5.0V 或 3.3V */
    int   node_count;   /* 总节点数 */
    float r_term;       /* 终端电阻，通常 120 Ω */
    float v_th;         /* 接收器阈值，需 > 0.2V */
    float r_bias;       /* 计算出的偏置电阻值 */
} BiasResistorCalc;

BiasResistorCalc calc_bias_resistor(float vcc, int nodes)
{
    BiasResistorCalc c;
    c.vcc = vcc;
    c.node_count = nodes;
    c.r_term = 120.0f;
    c.v_th = 0.25f;   /* 留余量，目标 250 mV */
    
    /* 总线等效电阻：两个 120Ω 并联（两端）+ 每个节点 12kΩ 输入阻抗并联 */
    float r_bus_eq = (c.r_term / 2.0f) / (1.0f + c.r_term / (2.0f * 12000.0f / nodes));
    /* 简化：R_bus_eq ≈ 60Ω || (12kΩ / N) */
    float r_load = (12000.0f / nodes);
    r_bus_eq = (60.0f * r_load) / (60.0f + r_load);
    
    /* 偏置电阻：R_bias = (Vcc × R_bus_eq / 2) / V_th */
    c.r_bias = (c.vcc * r_bus_eq) / (2.0f * c.v_th);
    
    return c;
}

/* 调用示例 */
/* 5V 供电，32 节点：R_bias ≈ (5.0 × 58.8) / (2 × 0.25) ≈ 588 Ω */
/* 实际取标称值 560 Ω 或 680 Ω */
```

**实测经验值（参考 TI SN65HVD3082E 数据手册）：**

| 供电 | 节点数 | 上拉/下拉电阻 | 空闲总线电压 |
|------|--------|-------------|-------------|
| 5V | 2~32 | 560 Ω | ~1.7V（差分 ~350 mV） |
| 5V | 2~16 | 1 kΩ | ~1.3V（差分 ~280 mV） |
| 3.3V | 2~32 | 680 Ω | ~1.0V（差分 ~300 mV） |
| 3.3V | 2~16 | 1.2 kΩ | ~0.9V（差分 ~240 mV） |

## 三、Modbus RTU 帧格式与 CRC 校验

### 帧结构

```
┌─────────┬──────────┬──────────────┬──────────────┬──────────┐
│ 地址域  │ 功能码   │   数据域     │   CRC 低字节 │ CRC 高字节│
│ 1 Byte  │ 1 Byte   │   0~252 Byte │   1 Byte     │  1 Byte   │
└─────────┴──────────┴──────────────┴──────────────┴──────────┘
```

- **地址域：** 1~247（从站地址），0 为广播地址
- **功能码：** 03 读保持寄存器、06 写单个寄存器、16 写多个寄存器
- **数据域：** 大端序（Big-Endian），如 0x1234 发送为 0x12 0x34
- **CRC：** Modbus RTU 专用 CRC-16（多项式 0x8005，初始值 0xFFFF）

### 帧间空闲间隔

Modbus RTU 要求相邻帧之间至少有 **3.5 字符时间** 的空闲时间，用于帧同步。若间隔 < 1.5 字符时间，视为同一帧的连续字节。

```
T_3_5 = 3.5 × 11 × (1 / BaudRate)   /* 11 = 1 start + 8 data + 1 parity + 1 stop */
```

| 波特率 | T_3_5 (ms) | T_1_5 (ms) |
|--------|-----------|-----------|
| 9600   | ~3.99 ms  | ~1.71 ms |
| 19200  | ~1.99 ms  | ~0.85 ms |
| 115200 | ~0.33 ms  | ~0.14 ms |

### CRC 校验实现

```c
/* Modbus RTU CRC-16 查表法（速度优化） */
static const uint16_t crc16_table[256] = {
    0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
    /* ... 256 个值，此处省略完整表（实际代码需完整）... */
    0x8000, 0x40C1, 0x4181, 0x0140, 0x4301, 0x03C0, 0x4200, 0x82C1
};

uint16_t ModbusCRC16(uint8_t *buffer, uint16_t length)
{
    uint16_t crc = 0xFFFF;
    
    for (uint16_t i = 0; i < length; i++) {
        crc = (crc >> 8) ^ crc16_table[(crc ^ buffer[i]) & 0xFF];
    }
    
    return crc;  /* 发送时先发低字节，后发高字节 */
}

/* 校验接收帧 */
bool Modbus_CheckFrame(uint8_t *frame, uint16_t len)
{
    if (len < 4) return false;  /* 最小帧：地址 + 功能码 + CRC(2) */
    
    uint16_t crc_calc = ModbusCRC16(frame, len - 2);
    uint16_t crc_recv = (uint16_t)frame[len - 1] << 8 | frame[len - 2];
    
    return (crc_calc == crc_recv);
}
```

### 常用功能码示例

```c
/* 读保持寄存器（功能码 03） */
/* 请求：01 03 00 00 00 01 84 0A */
/*  地址1 读 功能码3  起始0000  数量1  CRC */
typedef struct __attribute__((packed)) {
    uint8_t  addr;        /* 从站地址 */
    uint8_t  func;        /* 功能码 0x03 */
    uint16_t start_reg;   /* 起始寄存器地址（大端） */
    uint16_t reg_count;   /* 寄存器数量（大端） */
    uint16_t crc;         /* CRC 校验 */
} ModbusReadReq;

/* 响应：01 03 02 00 64 B9 AF */
/*  地址1  功能码3  字节数2  数据0x0064=100  CRC */
typedef struct __attribute__((packed)) {
    uint8_t  addr;        /* 原地址 */
    uint8_t  func;        /* 0x03 */
    uint8_t  byte_count;  /* 数据字节数 = reg_count × 2 */
    uint16_t reg_value;   /* 寄存器值（大端） */
    uint16_t crc;
} ModbusReadResp;
```

## 四、多机通信的地址分配与防冲突

### 地址分配策略

| 地址范围 | 用途 | 说明 |
|---------|------|------|
| 0 | 广播 | 所有从站接收，不响应 |
| 1~247 | 单播 | 唯一从站地址 |
| 248~255 | 保留 | 协议扩展或自定义 |

### 地址冲突预防

1. **出厂固件固化地址：** 每个设备出厂时烧录唯一地址，适合批量定制
2. **硬件拨码开关：** 最可靠，上电读取 GPIO 电平作为地址
3. **软件自动分配：** 主站扫描空地址并分配，存在竞态风险

```c
/* 硬件拨码开关读取地址 */
#define ADDR_PIN_0   GPIO_PIN_0   /* PB0 */
#define ADDR_PIN_1   GPIO_PIN_1   /* PB1 */
#define ADDR_PIN_2   GPIO_PIN_2   /* PB2 */
#define ADDR_PIN_3   GPIO_PIN_3   /* PB3 */  /* 最多 16 个地址 */

uint8_t GetAddressFromHardware(void)
{
    uint8_t addr = 0;
    
    if (HAL_GPIO_ReadPin(GPIOB, ADDR_PIN_0)) addr |= 0x01;
    if (HAL_GPIO_ReadPin(GPIOB, ADDR_PIN_1)) addr |= 0x02;
    if (HAL_GPIO_ReadPin(GPIOB, ADDR_PIN_2)) addr |= 0x04;
    if (HAL_GPIO_ReadPin(GPIOB, ADDR_PIN_3)) addr |= 0x08;
    
    /* 地址 + 1 避开 0 号广播地址 */
    return addr + 1;
}
```

### 总线冲突避免

RS485 半双工本身不防冲突。Modbus RTU 通过**主从机制**（主站轮流查询，从站不主动发送）天然避免冲突。

**非 Modbus 场景下多主竞争的方案：**

```c
/* 简单的 CSMA/CA 退避算法 */
typedef struct {
    uint8_t  node_addr;
    uint32_t backoff_base_ms;   /* 基础退避时间 */
    uint32_t contention_slot;   /* 竞争时隙 */
} RS485_CSMA;

#define CONTENTION_SLOT_MS  10

void RS485_BackoffWait(RS485_CSMA *ctx, int collision_count)
{
    /* 退避时间 = 基础退避 × (2^collision_count) × 随机因子 */
    int slot_count = 1 << collision_count;  /* 指数退避 */
    int wait_ms = ctx->backoff_base_ms + 
                  (rand() % (slot_count * CONTENTION_SLOT_MS));
    
    delay_ms(wait_ms);
}
```

### 工程实践要点

1. **总线上电时序：** 所有从站先进入接收模式，主站最后上电发送第一个查询帧
2. **故障节点隔离：** 单个节点 DE 持续高电平会拉死整个总线，加看门狗保护
3. **地电位差：** 长距离 RS485 建议 A/B 线加 TVS（如 PESD1CAN），两端之间加共模扼流圈
4. **线缆选择：** 使用特性阻抗 120 Ω 的屏蔽双绞线，屏蔽层单端接地

> 🏷️ RS485 Modbus RTU CRC 终端电阻 偏置电阻 半双工 工业通信
