---
title: "嵌入式知识体系 · #40 · EtherCAT 从站控制器：工业以太网的飞读飞写"
description: "## 一、ESC（EtherCAT Slave Controller）工作原理"
pubDate: "2026-08-23"
series: "ee-system"
order: 40
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
## 一、ESC（EtherCAT Slave Controller）工作原理

### 传统以太网 vs EtherCAT

传统以太网帧在每个节点处被完整接收→处理→转发，延迟逐级累加。EtherCAT 引入"飞读飞写"（Processing on the fly）机制：以太网帧经过每个从站时，从站硬件在帧经过的瞬间读/写其数据，仅引入几十纳秒的延迟。

```
传统以太网：  [帧]──→[节点1]──→[节点2]──→[节点3]
             接收完成 ！ 处理 ！ 转发  累计延迟 > 100 μs/节点

EtherCAT：    [帧]──→[节点1]──→[节点2]──→[节点3]
                    ↓ 处理     ↓ 处理     ↓ 处理
                    100ns      100ns      100ns  → 总延迟 ≈ 1 μs
```

### ESC 硬件架构

EtherCAT 从站必须使用专用 ESC 芯片或 FPGA IP Core。典型的 ESC 内部结构：

```
                    ┌─────────────────────────────────────┐
 Ethernet PHY ──→   │  ESC 芯片（如 Beckhoff ET1100）    │
                    │  ┌─────────┐  ┌───────────────┐    │
                    │  │ 数据开关 │  │ 过程数据接口   │    │──→ 应用层 CPU
                    │  │(On-fly   │  │ (PDI: SPI/16bit│    │     (SPI 或并行)
 Ethernet PHY ──→   │  │处理)    │  │  并行/Digital) │    │
                    │  └─────────┘  └───────────────┘    │
                    │  ┌─────────┐  ┌───────────────┐    │
                    │  │ 寄存器  │  │ 同步管理器     │    │
                    │  │ (256B)  │  │ (SyncManagers) │    │
                    │  └─────────┘  └───────────────┘    │
                    │  ┌─────────┐  ┌───────────────┐    │
                    │  │ 分布式  │  │ FMMU (现场总线 │    │
                    │  │ 时钟(DC)│  │  内存管理单元) │    │
                    │  └─────────┘  └───────────────┘    │
                    └─────────────────────────────────────┘
```

### 主流 ESC 芯片对比

| 芯片 | 接口 | 最大 FMMU | 最大 SM | DC 支持 | 价格参考 |
|------|------|-----------|---------|---------|---------|
| Beckhoff ET1100 | 32-bit 并行 / SPI | 8 | 8 | ✅ | ~$8 |
| Beckhoff ET1200 | SPI / 8-bit 并行 | 3 | 4 | ✅ | ~$4 |
| TI AM335x (PRU-ICSS) | 内部总线 | 可配置 | 可配置 | ✅ | 含于 SoC |
| Infineon XMC4800 | 内部总线 | 可配置 | 可配置 | ✅ | ~$12 |
| AX58100 (ASIX) | SPI / 并行 | 8 | 8 | ✅ | ~$5 |
| LAN9252 (Microchip) | SPI / HBI | 3 | 4 | ✅ | ~$6 |
| LAN9255 | SPI / HBI | 3 | 4 | ✅ 改进型 | ~$7 |

```c
/* ESC 初始化伪代码（基于 LAN9252 + SPI 接口） */
#define LAN9252_SPI_CMD_READ  0x03
#define LAN9252_SPI_CMD_WRITE 0x02
#define HW_CFG        0x0074
#define HW_CFG_SPI    0x00000020  /* SPI 模式 */
#define RESET_CTL     0x0058
#define RESET_CTL_HW  0x00000001

typedef struct {
    uint32_t esc_ver;       /* 芯片版本 */
    uint32_t station_addr;   /* 站点地址 */
    uint32_t sm_config[4];   /* 同步管理器配置 */
} ESC_Context;

/* 通过 SPI 读写 ESC 寄存器 */
uint32_t ESC_ReadReg(uint16_t reg_addr)
{
    uint8_t spi_tx[5] = {
        LAN9252_SPI_CMD_READ,
        (reg_addr >> 8) & 0xFF,    /* 地址高字节 */
        reg_addr & 0xFF,           /* 地址低字节 */
        0x00,                      /* dummy */
        0x00                       /* dummy */
    };
    uint8_t spi_rx[5] = {0};
    
    SPI_CS_LOW();
    HAL_SPI_TransmitReceive(&hspi_esc, spi_tx, spi_rx, 5, 100);
    SPI_CS_HIGH();
    
    return (spi_rx[3] << 8) | spi_rx[4];
}

void ESC_Init(ESC_Context *ctx)
{
    /* 1. 硬件复位 */
    ESC_WriteReg(RESET_CTL, RESET_CTL_HW);
    delay_ms(10);
    
    /* 2. 配置硬件模式 */
    ESC_WriteReg(HW_CFG, HW_CFG_SPI);
    
    /* 3. 读取 ESC 版本 */
    ctx->esc_ver = ESC_ReadReg(0x0000);
    
    /* 4. 设置站点地址（由主站通过 EEPROM 或寄存器配置） */
    ctx->station_addr = ESC_ReadReg(0x0010);  /* 站地址寄存器 */
    
    /* 5. 配置同步管理器 */
    ESC_SetupSyncManagers();
    
    /* 6. 配置 FMMU */
    ESC_SetupFMMU();
    
    printf("ESC Init OK. Version=0x%04X, Addr=0x%04X\n",
           ctx->esc_ver, ctx->station_addr);
}
```

## 二、On-the-fly 数据处理机制

### 帧在 ESC 中的路径

EtherCAT 数据帧进入从站后，ESC 硬件自动完成以下操作：

1. **帧检测：** 识别 EtherCAT 帧头和寻址信息
2. **数据提取/插入：** 根据 FMMU 配置，在该帧的对应偏移位置读取或写入数据
3. **工作计数（WKC）更新：** 如果该从站参与了数据传输，递增逻辑帧头中的工作计数
4. **转发：** 帧立即从第二个端口发出，继续前往下一个从站

```c
/* On-the-fly 处理的底层原理（FPGA 风格的 RTL 描述） */
/*
 * 在 Verilog 中，这是一个纯粹的组合逻辑路径：
 * 
 * always @(posedge clk) begin
 *     if (frame_valid && fmmu_matched) begin
 *         // 在帧经过的同一个时钟周期内完成数据替换
 *         ethernet_frame[data_offset +: data_len] <= esc_output_data;
 *         // 同时递增工作计数
 *         wkc_counter <= wkc_counter + 1;
 *     end
 * end
 *
 * 关键：这里不需要存储整个帧，只需缓存当前处理的那几个字节。
 * 缓存深度通常只有 8~16 字节，故延迟仅为几时钟周期。
 */
```

### FMMU（现场总线内存管理单元）

FMMU 将从站本地数据映射到 EtherCAT 帧中的特定位置。每个从站最多 8 个 FMMU 通道。

```c
/* FMMU 配置数据结构 */
typedef struct __attribute__((packed)) {
    uint16_t logical_start;     /* 逻辑起始地址（主站端全局地址空间） */
    uint16_t logical_length;    /* 映射长度（字节） */
    uint8_t  logical_startbit;  /* 起始位偏移（0~7） */
    uint8_t  logical_endbit;    /* 结束位偏移（0~7） */
    uint16_t physical_start;    /* 从站物理内存起始地址 */
    uint8_t  physical_startbit; /* 从站物理起始位 */
    uint8_t  type;              /* 类型：读/写/读写 */
    uint8_t  activate;          /* 激活标志 */
} FMMU_Entry;

/* 配置 FMMU：将主站逻辑地址 0x1000~0x1003 映射到从站本地偏移 0x2000 */
void ESC_ConfigureFMMU(void)
{
    FMMU_Entry fmmu = {
        .logical_start     = 0x1000,
        .logical_length    = 4,
        .logical_startbit  = 0,
        .logical_endbit    = 7,
        .physical_start    = 0x2000,
        .physical_startbit = 0,
        .type              = 3,      /* 读+写 */
        .activate          = 1
    };
    
    /* 写入 FMMU 寄存器（ESC 的 FMMU 寄存器起始地址为 0x0600） */
    ESC_WriteRegBlock(0x0600, (uint8_t *)&fmmu, sizeof(fmmu));
}

/* 读取过程中数据（主站通过 FMMU 读取时，ESC 自动返回此缓冲区的数据） */
static uint32_t process_data_output = 0;

void ESC_UpdateProcessData(void)
{
    /* 应用层定期更新输出数据 */
    process_data_output = read_sensor_value();
    ESC_WriteReg(0x2000, process_data_output);  /* 写入 FMMU 映射区域 */
}
```

## 三、分布式时钟（DC）的同步原理

### 同步需求

在运动控制中，多个伺服驱动器的 PWM 输出必须在同一时刻更新。100 Mbps 以太网中，1 μs 的时钟偏差 = 100 bit 的传输距离差，对于 10 μm 精度的运动控制不可接受。

### DC 的工作机制

1. **参考时钟：** 第一个支持 DC 的从站（通常靠近主站）作为系统参考时钟
2. **传播延迟测量：** 系统启动时主站测量到每个从站的以太网帧传播延迟
3. **本地时钟补偿：** 每个从站计算并补偿自己的时钟偏移和传播延迟
4. **SYNC 信号：** 从站在指定时间产生硬件 SYNC 脉冲，精确同步应用层操作

```
时间轴：
主站 ──[发送帧]────────────[SYNC event]────────────[下一个 SYNC]──→
       ↓ 延迟         ↓ 同步时间                   ↓
从站1  ──[接收]──[补偿]──[SYNC 中断]──[执行操作]──→
       ↓ 延迟+偏移   ↓
从站2  ──[接收]──[补偿]──[SYNC 中断]──[执行操作]──→
                           ↑ 所有从站在同一时刻执行操作
```

```c
/* 分布式时钟同步代码 */
#define DC_SYSTEM_TIME       0x0910   /* 64-bit 系统时间寄存器 */
#define DC_SYNC_PULSE        0x0980   /* SYNC 脉冲时间寄存器 */
#define DC_ACTIVATE          0x0990   /* 激活 DC 控制寄存器 */

static uint64_t local_system_time_ns;
static uint32_t sync_pulse_interval_us = 1000;  /* 1 kHz SYNC */

/* 从站 DC 初始化 */
void DC_InitSync(void)
{
    /* 读取当前系统时间 */
    local_system_time_ns = ESC_ReadReg64(DC_SYSTEM_TIME);
    
    /* 设置第一个 SYNC 脉冲在 500 μs 后 */
    uint64_t first_sync = local_system_time_ns + 500000;
    ESC_WriteReg64(DC_SYNC_PULSE, first_sync);
    
    /* 配置 SYNC 脉冲间隔（每个 DC 循环 1 ms） */
    ESC_WriteReg32(DC_ACTIVATE, sync_pulse_interval_us * 1000);
}

/* SYNC 中断处理函数（硬件触发，要求极低延迟） */
void DC_SYNC_IRQHandler(void)
{
    /* 读取当前精确时间 */
    uint64_t now = ESC_ReadReg64(DC_SYSTEM_TIME);
    
    /* 在此执行同步操作：更新 PWM 占空比、采样 ADC 等 */
    Motor_UpdatePWMDuty(motor_current_ref);
    Sensor_SampleSynchronized();
    
    /* 更新下一个 SYNC 时间（ESC 会自动计算，也可手动设置） */
    /* DC 硬件会在 SYNC_PULSE_TIME + CYCLE_TIME 时再次触发 */
    
    /* 清除 SYNC 中断标志 */
    ESC_WriteReg(DC_STATUS, 0);
}
```

DC 同步精度可达 **< 100 ns**（取决于 PHY 延迟抖动和 ESC 芯片），远优于传统以太网 IEEE 1588 PTP（通常 1~10 μs）。

## 四、应用层协议：CoE / SoE / EoE / FoE

EtherCAT 传输层之上，有多种应用层协议适配不同的行业需求：

| 协议 | 全称 | 基于 | 典型应用 | 特点 |
|------|------|------|---------|------|
| **CoE** | CANopen over EtherCAT | CANopen (CiA 301/402) | 伺服驱动、I/O 模块 | 即插即用、SDO/PDO、最广泛 |
| **SoE** | Servo Drive over EtherCAT | SERCOS 参数模型 | 高端伺服驱动 | 位置环、速度环参数 |
| **EoE** | Ethernet over EtherCAT | TCP/IP 隧道 | 非实时以太网设备 | 传输 TCP/IP 帧 |
| **FoE** | File over EtherCAT | TFTP 简化版 | 固件升级、配置下载 | 类似 FTP |

```c
/* CoE SDO（服务数据对象）读写——类似于 CANopen 的 SDO 服务 */
typedef struct {
    uint16_t index;          /* 对象字典索引 */
    uint8_t  subindex;       /* 子索引 */
    uint32_t data;           /* 数据 */
    uint8_t  data_size;      /* 数据字节数：1/2/4 */
} CoE_SDO_Request;

/* 通过 CoE 读取伺服驱动器的状态字（对象 0x6041） */
uint16_t CoE_ReadStatusWord(uint16_t slave_addr)
{
    CoE_SDO_Request req = {
        .index = 0x6041,       /* 状态字 */
        .subindex = 0x00,
        .data = 0,
        .data_size = 2
    };
    
    /* 通过邮箱通道发送 SDO 请求 */
    ESC_MailboxSend(slave_addr, MBX_COE, COE_SDO_UPLOAD_REQ,
                    (uint8_t *)&req, sizeof(req));
    
    /* 等待响应（最多 100 ms） */
    CoE_SDO_Response resp;
    ESC_MailboxReceive(slave_addr, MBX_COE, &resp, 100);
    
    return (uint16_t)resp.data;
}

/* CoE PDO（过程数据对象）——周期数据交换 */
typedef struct __attribute__((packed)) {
    uint16_t control_word;   /* 0x6040: 控制字 */
    int32_t  target_pos;     /* 0x607A: 目标位置 */
    uint16_t profile_speed;  /* 0x6081: 轮廓速度 */
} TxPDO_ServoDrive;          /* 主->从 PDO 映射 */

typedef struct __attribute__((packed)) {
    uint16_t status_word;    /* 0x6041: 状态字 */
    int32_t  actual_pos;     /* 0x6064: 实际位置 */
    uint16_t error_code;     /* 0x603F: 错误码 */
} RxPDO_ServoDrive;          /* 从->主 PDO 映射 */

TxPDO_ServoDrive servo_output;
RxPDO_ServoDrive servo_input;

/* 在每个 EtherCAT 周期（通常 1 ms）中更新 PDO 数据 */
void EtherCAT_PDOHandler(void)
{
    /* 更新输出 PDO（写入 ESC 的 SM3 输出缓冲区） */
    servo_output.control_word = 0x001F;   /* 使能操作 */
    servo_output.target_pos = position_ramp_target;
    servo_output.profile_speed = speed_setpoint;
    
    ESC_WriteSyncManager(3, (uint8_t *)&servo_output, sizeof(servo_output));
    
    /* 读取输入 PDO（从 ESC 的 SM2 输入缓冲区读取） */
    ESC_ReadSyncManager(2, (uint8_t *)&servo_input, sizeof(servo_input));
    
    actual_position = servo_input.actual_pos;
    drive_status = servo_input.status_word;
}
```

## 五、SSC 工具配置从站信息

SSC（Slave Stack Code）是 Beckhoff 提供的 EtherCAT 从站协议栈配置工具，用于生成从站代码和 XML 设备描述文件。

### SSC 配置的典型流程

```
SSC Tool (Beckhoff)
    │
    ├── 选择硬件平台 (ET1100/ET1200/LAN9252/etc.)
    ├── 配置同步管理器数量与方向
    │   ├── SM0: 邮箱输入（主站->从站）
    │   ├── SM1: 邮箱输出（从站->主站）
    │   ├── SM2: 过程数据输入（从站->主站）
    │   └── SM3: 过程数据输出（主站->从站）
    ├── 配置 FMMU 映射规则
    ├── 配置分布式时钟参数
    │   └── SYNC0/SYNC1 周期与偏移
    ├── 生成 XML 设备描述文件（ESI）
    └── 生成 C 代码工程（MDK/IAR/CMake）
```

### 关键配置项代码

```c
/* SSC 生成的从站初始化代码（基于 ET1100） */
void ECAT_Init(void)
{
    /* 硬件初始化 */
    HW_Init();
    
    /* 设置默认站地址 */
    ESC_WriteReg16(REG_STATION_ALIAS, 0x0000);
    ESC_WriteReg16(REG_STATION_ADDR_L, 0x0001);  /* 默认地址 1 */
    ESC_WriteReg16(REG_STATION_ADDR_H, 0x0000);
    
    /* 配置同步管理器 */
    /* SM0: 邮箱写（主站→从站），256 字节 */
    SM_Config(0, 0x1000, 256, SM_MAILBOX_WRITE);
    /* SM1: 邮箱读（从站→主站），256 字节 */
    SM_Config(1, 0x1100, 256, SM_MAILBOX_READ);
    /* SM2: 过程数据输入（从站→主站），64 字节 */
    SM_Config(2, 0x1200, 64, SM_OUTPUT);  /* 从 ESC 角度是输出 */
    /* SM3: 过程数据输出（主站→从站），64 字节 */
    SM_Config(3, 0x1300, 64, SM_INPUT);   /* 从 ESC 角度是输入 */
    
    /* 配置 FMMU */
    FMMU_Config(0, 0x00000000, 0x0000, 0x1200, 64, FMMU_READ);
    FMMU_Config(1, 0x00000040, 0x0000, 0x1300, 64, FMMU_WRITE);
    
    /* 启用分布式时钟 */
    DC_Config(DC_SYNC0_PERIOD_1MS, DC_SYNC0_OFFSET_0);
    
    /* 启用 EtherCAT 中断 */
    ESC_EnableInterrupt(INT_DL | INT_SM2 | INT_SM3 | INT_DC_SYNC);
}

/* 应用层主循环 */
void ECAT_MainLoop(void)
{
    while (1) {
        /* 检查 EtherCAT 状态机 */
        ECAT_State state = ESC_GetState();
        
        switch (state) {
        case ECAT_STATE_INIT:
            ECAT_InitSMChannels();
            ESC_SetState(ECAT_STATE_PREOP);
            break;
            
        case ECAT_STATE_PREOP:
            /* 可通过邮箱配置参数 */
            ECAT_MailboxProcess();
            break;
            
        case ECAT_STATE_SAFEOP:
            /* 输入数据有效，输出仍为默认值 */
            ECAT_ReadInputs();
            ESC_SetState(ECAT_STATE_OP);
            break;
            
        case ECAT_STATE_OP:
            /* 正常运行：过程数据交换 */
            ECAT_ReadInputs();    /* 从 ESC 读 */
            Application_Process(); /* 用户应用逻辑 */
            ECAT_WriteOutputs();  /* 写入 ESC */
            break;
        }
    }
}
```

### XML 设备描述文件（ESI）片段

```xml
<?xml version="1.0" encoding="utf-8"?>
<EtherCATInfo Version="1.6">
  <Vendor>
    <Id>#x00000042</Id>
    <Name>Example Embedded Systems</Name>
  </Vendor>
  <Descriptions>
    <Devices>
      <Device SlaveType="0x00000001">
        <Type>#x12345678</Type>    <!-- 产品代码 -->
        <Name>PicoClaw Servo Drive</Name>
        <Group>Drives</Group>
        <Profile>
          <Dictionary>
            <Sdo Index="#x6040">   <!-- 控制字 -->
              <Name>Controlword</Name>
              <Type>UNSIGNED16</Type>
              <DefaultValue>#x0000</DefaultValue>
            </Sdo>
          </Dictionary>
        </Profile>
        <SyncManager>
          <SM StartAddr="#x1000" Length="#x0100" ControlByte="#x26"
              DefaultSize="#x0100" Mailbox="1"/>
          <SM StartAddr="#x1100" Length="#x0100" ControlByte="#x22"
              DefaultSize="#x0100" Mailbox="1"/>
          <SM StartAddr="#x1200" Length="#x0040" ControlByte="#x10"
              DefaultSize="#x0040"/>
          <SM StartAddr="#x1300" Length="#x0040" ControlByte="#x20"
              DefaultSize="#x0040"/>
        </SyncManager>
      </Device>
    </Devices>
  </Descriptions>
</EtherCATInfo>
```

**工程实践提示：** 开发 EtherCAT 从站的入门门槛较高。建议从 LAN9252 评估板 + TI AM243x 或 STM32MP1 入手，先跑通 SSC 生成的示例代码（I/O 循环点亮 LED），再逐步添加伺服控制、传感器数据等功能。使用 TwinCAT（Beckhoff 的免费开发环境）作为主站进行调试。

> 🏷️ EtherCAT ESC 分布式时钟 CoE 飞读飞写 FMMU SSC 工业以太网
