---
title: "嵌入式知识体系 · #23 · Nordic nRF52 BLE 开发：SoftDevice 架构深入"
description: "BLE 开发里，nRF52 系列和 Nordic 的 SoftDevice 是绕不开的标杆。SoftDevice 不是普通的 SDK 库——它是一个编译好的固件二进制，烧录在 Flash 底部，和用户应用以\"双镜像\"的形式共存。这种架构既是 nRF52 系列的核心优势，也是很多初学者的困惑来源。"
pubDate: "2026-08-23"
series: "ee-system"
order: 23
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
BLE 开发里，nRF52 系列和 Nordic 的 SoftDevice 是绕不开的标杆。SoftDevice 不是普通的 SDK 库——它是一个**编译好的固件二进制**，烧录在 Flash 底部，和用户应用以"双镜像"的形式共存。这种架构既是 nRF52 系列的核心优势，也是很多初学者的困惑来源。

本文从 SoftDevice 的诞生背景、双中断模型、RAM 分区管理到 GAP/GATT 编程，完整拆解这套架构的每一个关键设计。

---

## 一、SoftDevice 是什么

### 1.1 一个"二进制的协议栈"

SoftDevice 是 Nordic 预编译的 BLE 协议栈二进制文件。它的特殊之处在于：

```
Flash 布局（nRF52832, 512KB Flash）：
0x00000 ┌────────────────┐
        │ SoftDevice      │ ← BLE 协议栈二进制（sd_xxx.hex）
        │ 占用 0~0x26000  │   约 152 KB
0x26000 ├────────────────┤
        │ Bootloader      │ ← DFU 适配层
0x27000 ├────────────────┤
        │ 用户应用        │ ← 你自己的 app
0x7FFFF └────────────────┘
```

用户以**链接时**的方式与 SoftDevice 互动：
- **不能查看 SoftDevice 源码**——它是闭源的 pre-linked blob
- **不能随意移动 SoftDevice 的位置**——Flash 起始地址固定
- **通过 SoftDevice API 调用 BLE 功能**——Nordic 提供头文件，函数在 SVC（Supervisor Call）中实现

### 1.2 为什么不开源

SoftDevice 是 Nordic 经过蓝牙 SIG 认证的协议栈。蓝牙协议栈需要跑过上千个合规测试用例。Nordic 的策略是提供**已经认证好**的二进制，让用户直接在上面开发应用，不需重复认证。

每次发布新的 SoftDevice 版本，Nordic 都会提供：
- `s132_nrf52_7.2.0_softdevice.hex` — S132 (Central + Peripheral) 的二进制
- `nrf52_sd.h` — SoftDevice API 头文件
- 对应的链接脚本模板

---

## 二、双中断模型：SDI 与 NDI

SoftDevice 架构的核心设计之一是**中断优先级隔离**。它引入了两类中断：

### 2.1 SDI vs NDI

| 中断类型 | 全称 | 优先级 | 作用 |
|---------|------|:------:|------|
| **SDI** | SoftDevice Interrupt | **最高（0/1）** | BLE 协议栈内部时序关键操作 |
| **NDI** | Non-SoftDevice Interrupt | **较低（2+）** | 用户外设中断 |

```
NVIC（Cortex-M4F）优先级分级：
─────────────────────────────────
优先级 0 (最高) : SDI - BLE 射频时序关键操作
优先级 1         : SDI - 链路层状态机
─────────────────────────────────
优先级 2         : NDI - 用户可用的最高优先级
优先级 3~5       : NDI - 普通外设中断
─────────────────────────────────
```

**关键规则：**
- 用户代码不得使用 SoftDevice 占用的优先级（0 和 1）
- 用户 ISR 中**不能调用** SoftDevice API（sd_xxx 函数）
- SoftDevice 的 ISR 可以打断用户 ISR，反之不行

### 2.2 为什么需要这个模型

BLE 的时序要求极其严格：

| BLE 事件 | 时序要求 |
|---------|---------|
| 连接间隔保持 | ±50 μs |
| 射频快照接收 | 约 4 μs |
| 广播间隔抖动 | < 20 μs |

如果用户的一个长时间 ISR 打断了 BLE 射频接收，就会丢包。SDI/NDI 的分级保证了 BLE 时序不被打断。

### 2.3 对用户代码的影响

```c
/* ❌ 错误：在 NDI 级别 ISR 中调用了 SoftDevice API */
void UART_IRQHandler(void) {        /* NDI（优先级 3）*/
    // ...
    sd_ble_gap_adv_stop(p_adv_handle);  /* 需要 SDI 上下文！*/
    // ...
}

/* ✅ 正确：在 NDI ISR 中设置标志，在主循环中调用 SoftDevice API */
volatile bool uart_adv_stop_requested = false;

void UART_IRQHandler(void) {        /* NDI（优先级 3）*/
    uart_adv_stop_requested = true;
}

int main(void) {
    while (1) {
        if (uart_adv_stop_requested) {
            uart_adv_stop_requested = false;
            /* 主循环上下文：可以安全调用 SoftDevice API */
            sd_ble_gap_adv_stop(p_adv_handle);
        }
        sd_app_evt_wait();  /* 进入低功耗睡眠 */
    }
}
```

---

## 三、RAM 分区管理

### 3.1 SoftDevice 占用 RAM

SoftDevice 不仅仅占用 Flash，还占用一部分 RAM：

```
nRF52832 RAM 布局（64KB SRAM）：
0x20000000 ┌─────────────────┐
           │ SoftDevice RAM   │ ← BLE 连接状态、GATT 数据库、
           │ 约 3~6 KB       │    链路层缓冲区、加密密钥
0x20000000 ├─────────────────┤
  + offset  │                 │
           │ 用户应用 RAM     │ ← 数据和 BSS
           │                  │
0x20010000 └─────────────────┘
```

RAM 偏移量由链接脚本控制。使用 SoftDevice 时，`__START_OF_RAM` 不再是 `0x20000000`，而是 `0x20000000 + SD_SIZE`。

### 3.2 链接脚本中的体现

```ld
/* nrf52832_xxaa_s132.ld — 使用 SoftDevice S132 的链接脚本 */

/* SoftDevice 占用 RAM 空间 */
__app_ram_start__ = 0x20002000;   /* 从 0x2000 开始给 App */
__app_ram_end__   = 0x20010000;   /* 到 64KB 结束 */
```

这意味着：
- 用户应用可用的 RAM 从 `0x20002000` 开始，共 **56 KB**（而非 64 KB）
- 可用 RAM 范围取决于 SoftDevice 版本和配置的 BLE 连接数

### 3.3 配置 RAM 分配

通过 `sd_ble_cfg_set()` 在初始化时配置 SoftDevice 的 RAM 使用量：

```c
#include "nrf_sdm.h"

uint32_t ram_start = 0;
uint32_t sd_ram_size;

/* 1. 获取 SoftDevice 需要的 RAM 起始地址 */
sd_ble_cfg_t ble_cfg;

/* 配置 BLE 连接数 */
memset(&ble_cfg, 0, sizeof(ble_cfg));
ble_cfg.gap_cfg.role_count_cfg.periph_role_count = 1;
ble_cfg.gap_cfg.role_count_cfg.central_role_count = 0;
sd_ble_cfg_set(BLE_GAP_CFG_ROLE_COUNT, &ble_cfg, ram_start);

/* 配置 GATT 属性表大小 */
ble_cfg.gatts_cfg.attr_tab_size.attr_tab_size = 2048;
sd_ble_cfg_set(BLE_GATTS_CFG_ATTR_TAB_SIZE, &ble_cfg, ram_start);

/* 2. 使能 SoftDevice */
sd_ble_enable(&ram_start);

/* 3. 根据返回值调整 App RAM 起始地址（非常重要！）*/
/* ram_start 现在被 sd_ble_enable 更新为 App 可用 RAM 起始地址 */
```

> **注意：** `sd_ble_enable()` 会修改 `ram_start` 参数，返回 SoftDevice 实际占用的 RAM 末端地址。必须在链接脚本中根据这个值调整 App RAM 起始地址。

---

## 四、BLE 事件模型：从射频到应用层

SoftDevice 的 BLE 事件模型和传统外设中断完全不同。BLE 事件不是通过中断脚本来处理的，而是通过**事件排队+主动拉取**：

### 4.1 事件处理循环

```c
int main(void) {
    uint32_t err_code;
    uint16_t evt_len = sizeof(ble_evt_t) + BLE_EVT_BUFFER_SIZE;
    uint8_t  evt_buf[evt_len];
    ble_evt_t *p_evt = (ble_evt_t *)evt_buf;

    /* 初始化 BLE 协议栈 */
    ble_stack_init();

    while (1) {
        /* 拉取 BLE 事件 */
        while (sd_ble_evt_get(p_evt, &evt_len) != NRF_ERROR_NOT_FOUND) {
            ble_evt_dispatch(p_evt);   /* 分发到各模块 */
            evt_len = sizeof(ble_evt_t) + BLE_EVT_BUFFER_SIZE;
        }
        
        /* 处理用户任务 */
        idle_task();
        
        /* 进入睡眠，等待事件唤醒 */
        sd_app_evt_wait();
    }
}
```

事件流：

```
BLE Controller（硬件）
  │ BLE 数据包接收到 → SDI 中断
  │ SoftDevice 解析并放入事件队列
  │
  ▼
sd_ble_evt_get() ← 用户主循环拉取
  │
  ▼
ble_evt_dispatch() ← 分发到 GAP/GATT/SMP 模块
  │
  ▼
用户回调 ← 应用逻辑
```

### 4.2 事件类型

| 事件 ID | 说明 | 处理场景 |
|---------|------|---------|
| `BLE_GAP_EVT_CONNECTED` | 对端设备连接 | 记录连接句柄、启动服务发现 |
| `BLE_GAP_EVT_DISCONNECTED` | 连接断开 | 清理资源、重启广播 |
| `BLE_GAP_EVT_SEC_PARAMS_REQUEST` | 对方请求配对 | 返回配对参数或拒绝 |
| `BLE_GATTS_EVT_WRITE` | 对端写了属性（特征值） | 读取数据并响应 |
| `BLE_GATTS_EVT_READ` | 对端请求读属性 | 准备数据后自动回复 |
| `BLE_GATTS_EVT_HVN_TX_COMPLETE` | Notification 发送完成 | 释放缓冲区、准备下一包 |

---

## 五、GAP/GATT 编程实战

### 5.1 GAP：广播与连接

```c
/* 广播初始化 */
#define APP_ADV_INTERVAL      160  /* 100ms（单位 0.625ms）*/
#define APP_ADV_DURATION      0    /* 持续广播 */

static void advertising_start(void) {
    uint32_t err_code;
    
    /* 1. 配置广播参数 */
    ble_gap_adv_params_t adv_params = {
        .type        = BLE_GAP_ADV_TYPE_CONNECTABLE_SCANNABLE_UNDIRECTED,
        .p_peer_addr = NULL,                          /* 未指定对端地址 */
        .fp          = BLE_GAP_ADV_FP_ANY,            /* 接受所有扫描请求 */
        .interval    = APP_ADV_INTERVAL,
        .timeout     = APP_ADV_DURATION,
    };

    /* 2. 取 UUID 广播包 */
    ble_advdata_t advdata = {
        .name_type          = BLE_ADVDATA_FULL_NAME,
        .include_appearance = true,
        .flags              = BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE,
    };

    /* 3. 启动广播 */
    err_code = sd_ble_gap_adv_set_configure(&m_adv_handle,
                                            &advdata, NULL,
                                            &adv_params);
    APP_ERROR_CHECK(err_code);
    
    err_code = sd_ble_gap_adv_start(m_adv_handle, APP_BLE_CONN_CFG_TAG);
    APP_ERROR_CHECK(err_code);
}
```

### 5.2 GATT：服务与特征值定义

```c
/* 自定义服务 UUID（16-bit）*/
#define BLE_UART_SERVICE_UUID       0x1801
#define BLE_UART_TX_CHAR_UUID       0x2A01
#define BLE_UART_RX_CHAR_UUID       0x2A02

static void uart_service_init(void) {
    uint32_t err_code;
    ble_uuid_t ble_uuid;
    ble_gatts_char_md_t char_md;
    ble_gatts_attr_md_t attr_md;
    ble_gatts_attr_t    attr_char_value;

    /* 1. 添加自定义服务 */
    ble_uuid.type = BLE_UUID_TYPE_VENDOR_BEGIN;
    ble_uuid.uuid = BLE_UART_SERVICE_UUID;
    err_code = sd_ble_gatts_service_add(BLE_GATTS_SRVC_TYPE_PRIMARY,
                                        &ble_uuid, &m_conn_handle);
    
    /* 2. TX 特性（通知属性）*/
    memset(&char_md, 0, sizeof(char_md));
    char_md.char_props.notify = 1;
    
    /* 设置属性访问权限 */
    memset(&attr_md, 0, sizeof(attr_md));
    attr_md.vloc    = BLE_GATTS_VLOC_STACK;  /* 数据放在协议栈中 */
    attr_md.rd_auth = 0;                      /* 不需要读鉴权 */
    attr_md.vlen    = 0;                      /* 固定长度 */
    
    /* 配置特征值属性 */
    memset(&attr_char_value, 0, sizeof(attr_char_value));
    attr_char_value.p_uuid    = &(ble_uuid_t){.uuid = BLE_UART_TX_CHAR_UUID,
                                              .type = BLE_UUID_TYPE_VENDOR_BEGIN};
    attr_char_value.p_attr_md = &attr_md;
    attr_char_value.max_len   = 20;  /* BLE 单包最大 20 字节 */
    attr_char_value.init_len  = 0;
    
    err_code = sd_ble_gatts_characteristic_add(m_conn_handle,
                                               &char_md,
                                               &attr_char_value,
                                               &m_tx_handles);
    /* ... 类似地添加 RX 特性（可写）*/
}
```

### 5.3 发送通知（Notification）

```c
uint32_t ble_send_data(uint8_t *data, uint16_t len) {
    ble_gatts_hvx_params_t hvx_params;
    uint16_t hvx_len = len;

    hvx_params.type   = BLE_GATT_HVX_NOTIFICATION;
    hvx_params.handle = m_tx_handles.value_handle;
    hvx_params.offset = 0;
    hvx_params.p_data = data;
    hvx_params.p_len  = &hvx_len;

    return sd_ble_gatts_hvx(m_conn_handle, &hvx_params);
}
```

---

## 六、nRF5 SDK 工程结构

Nordic 的 nRF5 SDK 将 SoftDevice 和 Application 作为两个独立的 Flashing Target：

```
SDK 目录结构：
nRF5_SDK_17.1.0/
├── components/         ← SDK 组件（驱动、库）
├── examples/          ← 例程
│   └── ble_peripheral/ble_app_uart/
│       ├── main.c
│       ├── sdk_config.h    ← 组件级别的配置头文件
│       └── pca10040/s132/
│           ├── armgcc/
│           │   ├── Makefile
│           │   └── nrf52832_xxaa_s132.ld
│           └── s132_nrf52_7.2.0_softdevice.hex
└── external/softdevice/
    └── s132_nrf52_7.2.0/
        ├── s132_nrf52_7.2.0_softdevice.hex
        └── nrf52_sd.h
```

烧录分两步：

```bash
# Step 1: 烧录 SoftDevice（只需一次，版本更新时才重烧）
nrfjprog --family NRF52 --program s132_nrf52_7.2.0_softdevice.hex --sectorerase

# Step 2: 烧录用户应用（每次代码更新）
nrfjprog --family NRF52 --program build/ble_app_uart.hex --sectorerase

# 或者一步合并烧录
mergehex --merge s132_nrf52_7.2.0_softdevice.hex \
               build/ble_app_uart.hex \
               --output combined.hex
nrfjprog --family NRF52 --program combined.hex --chiperase
```

---

## 七、与 Zephyr BLE 的对比

| 维度 | nRF5 SDK + SoftDevice | Zephyr BLE (Nordic) |
|------|----------------------|-------------------|
| 协议栈 | 闭源二进制 blob | 开源（Zephyr BT stack 或 NimBLE） |
| API 风格 | 直接调用 sd_xxx | Kconfig 配置 + 回调注册 |
| 中断模型 | SDI/NDI 双中断隔离 | 标准 RTOS 中断管理 |
| Flash 占用 | ~152 KB（S132） | ~80-120 KB（可裁剪） |
| 开发复杂度 | 需了解 SoftDevice 架构 | 更接近 Linux 驱动的体验 |
| 蓝牙认证 | 使用 SoftDevice 免认证 | 需自行跑 BQB 认证 |
| 多任务 | 裸机主循环（+可选 RTOS） | 原生 Zephyr RTOS |

**Zephyr 的优势**在于开源透明、可裁剪性强、RTOS 天然整合。**SoftDevice 的优势**在于认证省心、极低的 BLE 延迟、芯片配套成熟度。

对于量产产品，如果团队 BLE 经验有限，SoftDevice 的"开箱认证"是一大优势；如果追求灵活性和代码掌控力，Zephyr BLE 的潜力更大。

---

> 理解 SoftDevice 架构，本质上是理解"如何在一个没有 MMU 的 MCU 上，让闭源的实时协议栈和用户的裸机应用安全共存"。SDI/NDI 分级、RAM 分区、事件队列——每一个设计都对应一个 BLE 的核心痛点。

> 🏷️ nRF52 BLE SoftDevice SDI NDI SVC GAP GATT 广播 通知 nRF5 SDK 蓝牙协议栈 Zephyr Nordic 嵌入式
