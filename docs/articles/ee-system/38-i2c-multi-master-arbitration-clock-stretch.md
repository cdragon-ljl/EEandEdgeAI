---
title: "嵌入式知识体系 · #38 · I²C 多主仲裁与时钟拉伸：从机不听话怎么办"
description: "## 一、多主仲裁的逐位竞争机制"
pubDate: "2026-08-23"
series: "ee-system"
order: 38
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
## 一、多主仲裁的逐位竞争机制

I²C 总线支持多主站配置——多个主设备可以在没有总控的情况下共存。仲裁在 SDA 线上以**位级别**进行，不会丢失数据。

### 仲裁原理

每个主设备在 SDA 上发送数据位的同时，监控 SDA 的实际电平：

- 如果驱动的高电平（释放 SDA 由上拉电阻拉高）且检测到 SDA 被拉低 → **仲裁失败**，立即退出
- 如果驱动的低电平且检测到 SDA 为低 → 继续持有总线

```c
/* I²C 仲裁过程的软件模拟 */
typedef enum {
    ARB_WON,       /* 赢得仲裁 */
    ARB_LOST,      /* 失去仲裁 */
    ARB_IDLE       /* 总线空闲 */
} ArbitrationResult;

ArbitrationResult I2C_Arbitrate(GPIO_TypeDef *sda_port, uint16_t sda_pin)
{
    /* 检查总线是否空闲（SDA + SCL 均为高） */
    if (HAL_GPIO_ReadPin(sda_port, sda_pin) && 
        HAL_GPIO_ReadPin(sda_port, SCL_PIN)) {
        return ARB_IDLE;
    }
    
    /* 发送自己的起始条件 */
    HAL_GPIO_WritePin(sda_port, sda_pin, GPIO_PIN_RESET);  /* SDA 拉低 */
    delay_us(4);  /* t_HD:STA */
    HAL_GPIO_WritePin(sda_port, SCL_PIN, GPIO_PIN_RESET);  /* SCL 拉低 */
    
    /* 开始逐位竞争 */
    for (int bit = 7; bit >= 0; bit--) {
        int my_bit = (own_address >> bit) & 0x01;
        
        if (my_bit) {
            /* 发送 1：释放 SDA（由上拉拉高） */
            HAL_GPIO_WritePin(sda_port, sda_pin, GPIO_PIN_SET);
            delay_us(1);
        } else {
            /* 发送 0：SDA 拉低 */
            HAL_GPIO_WritePin(sda_port, sda_pin, GPIO_PIN_RESET);
        }
        
        /* 时钟高电平，从机或另一主机可能拉低 SDA */
        HAL_GPIO_WritePin(sda_port, SCL_PIN, GPIO_PIN_SET);
        delay_us(5);  /* t_HIGH */
        
        if (my_bit && !HAL_GPIO_ReadPin(sda_port, sda_pin)) {
            /* 我想发 1 但总线是 0 → 仲裁失败！ */
            HAL_GPIO_WritePin(sda_port, sda_pin, GPIO_PIN_SET);  /* 释放 SDA */
            return ARB_LOST;
        }
        
        HAL_GPIO_WritePin(sda_port, SCL_PIN, GPIO_PIN_RESET);
    }
    
    return ARB_WON;
}
```

### 仲裁的关键规则

1. **仲裁在 SDA 上进行，SCL 由所有主设备共同线与（ wired-AND）**
2. **地址相同时继续仲裁数据位**——因此多主通信中使用唯一地址才能避免数据损坏
3. **仲裁失败的主设备必须释放总线，转为从模式**，且不能产生 STOP 条件干扰获胜方

### 多主冲突场景

```
主机 A 发送地址 0x50 (1010000)
主机 B 发送地址 0x70 (1110000)
                        ^
位 2：A 发 1（释放SDA），B 发 0（拉低SDA）
     → A 检测到 SDA=0，但自己发 1 → A 仲裁失败退出了！
     → 主机 B 继续持有总线完成交易
```

如果两个主机发送完全相同的地址和数据，它们会同时成功——这是 I²C 的独特特性，无需额外防冲突硬件。

## 二、时钟拉伸（Clock Stretching）的目的与副作用

### 什么情况需要时钟拉伸

时钟拉伸是从机将 SCL 线拉低以延长时钟低电平时间，暂时"冻住"总线，给自己时间处理数据。

**典型应用场景：**

- EEPROM 写入期间（如 AT24Cxx 页写入后需 5~10 ms 内部编程时间）
- ADC 转换未完成时
- 低速 MCU 从机来不及响应
- 传感器内部寄存器更新

```c
/* 时钟拉伸的时序 */
/* 主机发送完一个字节后释放 SCL，从机拉低 SCL 表示需要等待 */
/*
主机:  [SCL释放]──────────────────────────────────────[SCL拉高]
        ↑ 主机释放 SCL       ↑ 从机释放 SCL          ↑ 总线恢复
        (从机拉低SCL)        (处理完毕)
*/

/* 处理从机时钟拉伸的主机代码 */
int I2C_Master_Write_WithStretch(I2C_HandleTypeDef *hi2c, 
                                  uint8_t dev_addr, 
                                  uint8_t *data, 
                                  uint16_t len)
{
    int stretch_timeout = 100;  /* 最多等待 100 ms */
    
    /* 发送起始条件 + 设备地址 + 写位 */
    for (uint16_t i = 0; i < len; i++) {
        /* 发送一个字节 */
        for (int bit = 7; bit >= 0; bit--) {
            /* 设置 SDA */
            HAL_GPIO_WritePin(SDA_PORT, SDA_PIN, 
                (data[i] >> bit) & 0x01);
            
            delay_us(1);
            
            /* SCL 高电平 */
            HAL_GPIO_WritePin(SCL_PORT, SCL_PIN, GPIO_PIN_SET);
            
            /* ⚠️ 等待从机释放 SCL（处理时钟拉伸） */
            while (!HAL_GPIO_ReadPin(SCL_PORT, SCL_PIN)) {
                if (--stretch_timeout <= 0) {
                    return -1;  /* 超时：从机挂死 */
                }
                delay_us(10);
            }
            
            delay_us(4);  /* t_HIGH */
            HAL_GPIO_WritePin(SCL_PORT, SCL_PIN, GPIO_PIN_RESET);
        }
        
        /* 第九位：读取 ACK/NACK */
        HAL_GPIO_WritePin(SDA_PORT, SDA_PIN, GPIO_PIN_SET);  /* 释放 SDA */
        HAL_GPIO_WritePin(SCL_PORT, SCL_PIN, GPIO_PIN_SET);
        
        /* 再次处理时钟拉伸 */
        while (!HAL_GPIO_ReadPin(SCL_PORT, SCL_PIN)) {
            if (--stretch_timeout <= 0) return -2;
            delay_us(10);
        }
        
        uint8_t ack = !HAL_GPIO_ReadPin(SDA_PORT, SDA_PIN);
        HAL_GPIO_WritePin(SCL_PORT, SCL_PIN, GPIO_PIN_RESET);
        
        if (!ack) return -3;  /* NACK */
    }
    
    return 0;
}
```

### 时钟拉伸的副作用

| 副作用 | 影响 | 解决 |
|--------|------|------|
| 实时性降低 | SCL 被拉低，总线上所有操作暂停 | 限制从机拉伸时间，或使用 DMA 多路复用 |
| 主设备超时 | 主机未处理拉伸 → 误判为总线挂死 | 主设备必须实现可配置的 SCL 等待超时 |
| 兼容性问题 | 一些主设备（如早期 Raspberry Pi）不支持时钟拉伸 | 升级驱动或使用软件 I²C |
| 多主仲裁 | 拉伸期间另一主机可能误判仲裁 | 仲裁只发生在 SDA，不影响 SCL 拉伸 |

**⚠️ 常见陷阱：** Linux `i2c-gpio` 驱动默认支持时钟拉伸，但一些硬件 I²C 外设（如 STM32F1 的 I2C 外设 V1）在处理时钟拉伸时存在 bug，需要软件 workaround。

## 三、从机地址冲突的排查方法

### 地址种类

| 类型 | 地址范围 | 说明 |
|------|---------|------|
| 7 bit 地址 | 0x08~0x77 | 最常见，1 个字节的高 7 位 |
| 10 bit 地址 | 0x00~0x3FF | 较少见，首字节高 5 位 = 11110 |
| 保留地址 | 0x00~0x07, 0x78~0x7F | 特殊用途（如通用呼叫） |

### 地址冲突的排查步骤

```c
/* I²C 总线扫描工具：检测所有从机地址 */
void I2C_ScanBus(I2C_HandleTypeDef *hi2c, UART_HandleTypeDef *huart)
{
    uint8_t found[128] = {0};
    int count = 0;
    char buf[64];
    
    HAL_UART_Transmit(huart, (uint8_t *)"Scanning I2C bus...\r\n", 20, 100);
    
    /* 扫描 7 位地址 0x08~0x77（避开保留地址） */
    for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
        /* 发送起始条件 + 地址 + 读位，看是否收到 ACK */
        if (HAL_I2C_IsDeviceReady(hi2c, addr << 1, 1, 50) == HAL_OK) {
            found[count++] = addr;
            sprintf(buf, "  Found: 0x%02X\r\n", addr);
            HAL_UART_Transmit(huart, (uint8_t *)buf, strlen(buf), 100);
        }
    }
    
    /* 检测地址冲突：相同地址出现两个不同从机 */
    for (int i = 0; i < count; i++) {
        for (int j = i + 1; j < count; j++) {
            if (found[i] == found[j]) {
                sprintf(buf, "WARNING: Address conflict at 0x%02X!\r\n", found[i]);
                HAL_UART_Transmit(huart, (uint8_t *)buf, strlen(buf), 100);
            }
        }
    }
}
```

### 常见器件地址速查

| 器件型号 | 类型 | 基地址 | 可配置 | CS pin 复用 |
|---------|------|--------|--------|------------|
| AT24C02 | EEPROM | 0x50 | A0/A1/A2 引脚 | N/A |
| MPU6050 | IMU | 0x68 | AD0 引脚 | N/A |
| BMP280 | 气压计 | 0x76 | SDO 引脚 | N/A |
| SSD1306 | OLED | 0x3C | D/C 引脚 | N/A |
| ADS1115 | ADC | 0x48 | ADDR 引脚（4 选 1） | N/A |
| MCP23017 | GPIO 扩展 | 0x20 | A0/A1/A2 引脚 | N/A |

**经验技巧：** 如果扫描不到某个器件，先检查该器件的地址线是否连接正确。比如 AT24C02 的 A0/A1/A2 全部接地 = 0x50，全部接 VCC = 0x57。

## 四、SMBus 与 I²C 的差异

SMBus（System Management Bus）基于 I²C 但增加了严格的时间参数和协议规则：

| 参数 | I²C（标准模式） | SMBus | 影响 |
|------|----------------|-------|------|
| 最大频率 | 100 kHz | 100 kHz（强制） | SMBus 不允许 400 kHz 快速模式 |
| 最小 SCL 低电平时间 | 4.7 μs | 4.0 μs | 基本兼容 |
| SCL 低电平超时 | 无 | 35 ms（主机超时） | SMBus 有超时检测，I²C 没有 |
| 最小空闲时间 | 4.7 μs | 4.1 μs | 基本兼容 |
| 总线电容 | 400 pF | 无限制（但受时序限制） | SMBus 允许更长线缆 |
| 最小 SCL 频率 | 无（可 DC） | 10 kHz（最低） | SMBus 必须持续拉低超时前释放 |
| 协议层 | 自由定义 | 标准命令集（PEC、ARP 等） | SMBus 有 CRC 确认 |

```c
/* SMBus 超时检测——I²C 没有这个要求 */
#define SMBUS_TIMEOUT_US  35000  /* 35 ms */

int SMBus_WaitSCL(GPIO_TypeDef *port, uint16_t pin, int state)
{
    uint32_t timeout = SMBUS_TIMEOUT_US;
    
    while (HAL_GPIO_ReadPin(port, pin) != state) {
        if (--timeout == 0) {
            return -1;  /* 超时：从机挂死 */
        }
        delay_us(1);
    }
    return 0;
}

/* SMBus 分组错误校验（PEC） */
uint8_t SMBus_PEC(uint8_t *data, uint16_t len)
{
    uint8_t crc = 0;
    
    for (uint16_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; bit++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x07;  /* CRC-8 多项式 x^8 + x^2 + x + 1 */
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}
```

**工程选择：** 普通传感器/外设用 I²C 即可。锂电池电量计（如 BQ40Z50）、PMBus 电源管理、ATCA 刀片服务器管理，必须使用 SMBus。

## 五、设备树中 I²C 节点的编写

以 Linux 设备树为例，连接一个 AT24C02 EEPROM 和一个 MPU6050 IMU：

```dts
&i2c1 {
    status = "okay";
    clock-frequency = <100000>;       /* 100 kHz 标准模式 */
    pinctrl-0 = <&i2c1_pins>;
    pinctrl-names = "default";
    
    /* 兼容性：
     * 如果硬件支持时钟拉伸，添加此属性告诉内核
     * 某些 I2C 控制器（如 Designware I2C）有 clock-stretch bug
     */
    i2c-scl-rising-time-ns = <100>;
    i2c-scl-falling-time-ns = <10>;
    
    at24@50 {
        compatible = "atmel,24c02";
        reg = <0x50>;                  /* 7 位地址 0x50 */
        pagesize = <8>;               /* AT24C02 页大小 8 字节 */
        size = <256>;                 /* 256 字节（2 Kbit） */
        address-width = <8>;          /* 8 位地址寻址 */
        read-only = <0>;              /* 可读写 */
    };
    
    mpu6050@68 {
        compatible = "invensense,mpu6050";
        reg = <0x68>;                  /* 7 位地址 0x68 */
        interrupt-parent = <&gpio1>;
        interrupts = <13 IRQ_TYPE_EDGE_RISING>;
        orientation = [01 00 00        /* 安装方向矩阵 */
                       00 01 00
                       00 00 01];
    };
};

/* 多主场景：如果有两个 I2C 控制器共享总线 */
&i2c2 {
    status = "okay";
    clock-frequency = <400000>;
    multi-master;                      /* 声明此总线是多主配置 */
    
    /* 多主模式下禁用动态时钟门控，防止休眠期间丢失仲裁 */
    clocks = <&clk IMX6UL_CLK_I2C2>;
    clock-names = "ipg";
    
    i2c-mux@70 {
        compatible = "nxp,pca9548";
        reg = <0x70>;
        #address-cells = <1>;
        #size-cells = <0>;
        
        i2c@0 {                         /* 通道 0 */
            reg = <0>;
            #address-cells = <1>;
            #size-cells = <0>;
            
            tmp117@48 {
                compatible = "ti,tmp117";
                reg = <0x48>;
            };
        };
        
        i2c@1 {                         /* 通道 1 */
            reg = <1>;
            #address-cells = <1>;
            #size-cells = <0>;
            
            bme280@76 {
                compatible = "bosch,bme280";
                reg = <0x76>;
            };
        };
    };
};
```

**调试技巧：** 在 Linux 下使用 `i2cdetect -y <bus_num>` 扫描总线，`i2cget`/`i2cset` 读写寄存器。遇到 ACK 失败先检查地址是否左移了 1 位（Linux 使用 7 位地址，不需左移）。

> 🏷️ I²C 多主仲裁 时钟拉伸 SMBus 设备树 从机地址冲突
