---
title: "嵌入式知识体系 · #21 · OTA 与分区表设计：嵌入式设备的生命线"
description: "设备出厂不是终点，是生命周期的起点。当固件需要修复漏洞、增加功能、适配新协议时，OTA（Over-The-Air）更新就是给嵌入式设备\"换血\"的能力。没有 OTA 的设计，意味着每次升级都要拆机、接烧录器——这在物联网时代是不可接受的。"
pubDate: "2026-08-23"
series: "ee-system"
order: 21
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
设备出厂不是终点，是生命周期的起点。当固件需要修复漏洞、增加功能、适配新协议时，OTA（Over-The-Air）更新就是给嵌入式设备"换血"的能力。没有 OTA 的设计，意味着每次升级都要拆机、接烧录器——这在物联网时代是不可接受的。

本文从分区表设计出发，深入拆解 OTA 的两大主流架构（A/B OTA 和 XIP OTA），并给出 ESP32 和 STM32 两个平台的完整实战方案。

---

## 一、分区表：固件更新的地基

### 1.1 为什么需要分区表

单片机 Flash 是连续存储空间，但固件的不同功能段需要分开放置——就像房子需要分卧室、厨房、客厅。没有合理的分区划分，OTA 根本无从下手。

一个典型的 OTA 分区表布局：

```
Flash 地址       分区
0x08000000 ┌──────────────┐
           │  Bootloader  │   ← 最稳定的部分，几乎不改
0x08010000 ├──────────────┤
           │  App_A (slot)│   ← 当前运行版本
0x08100000 ├──────────────┤
           │  App_B (slot)│   ← OTA 更新目标（A/B 模式）
0x081F0000 ├──────────────┤
           │  Factory     │   ← 出厂固件，救砖用
0x08200000 ├──────────────┤
           │  Data (NV)   │   ← 校准参数、用户配置
0x08201000 ├──────────────┤
           │  OTA_Data    │   ← 当前槽位标记、版本号
0x08202000 └──────────────┘
```

### 1.2 分区表的三个关键段

**Bootloader 分区**

Bootloader 是 OTA 的入口裁判。上电后它读取 `otadata` 分区的标记，决定从 App_A 还是 App_B 启动。Bootloader 本身不做 OTA 更新——它的代码空间需要保持极简稳定，通常只有几 KB。

**App 分区（A/B Slot）**

A/B 双槽是 OTA 可靠性的基石。App_A 跑当前固件，App_B 接收更新。更新成功则下次启动切到 App_B，失败则回退到 App_A。

**otadata 分区**

一个很小的分区（通常 8~16 KB），存储：
- 当前活跃槽位（0 → A，1 → B）
- 更新尝试次数（用于回滚）
- 固件版本号和 CRC 校验值
- 启动标志（OK / PENDING_VERIFY / FAILED）

---

## 二、两种 OTA 架构的对比

### 2.1 A/B OTA（双区冗余）

```
当前运行：App_A
下载更新：→ 写入 App_B
       ↓ 更新下载完成，标记 otadata → B
       ↓ 重启
Bootloader 读取 otadata → 从 App_B 启动
       ↓ App_B 运行正常，标记 confirmed
       ↓ 下次 OTA：写入 App_A，循环
```

**优点：**
- 更新失败不影响运行——App_A 始终可用
- 没有冒风险：下载被打断、重启后仍从旧版启动
- 无需从 Flash 搬运代码，启动快

**缺点：**
- Flash 占用翻倍——App 分区需要预留两倍空间
- 小型 MCU（Flash < 256 KB）很难承受

### 2.2 XIP OTA（原地执行下载）

```
当前运行：App（在 Slot_A）
下载更新：→ 写入 Slot_A 以外的临时区域
       ↓ 下载完成后，擦除 Slot_A
       ↓ 将新固件从临时区复制到 Slot_A
       ↓ 重启，Bootloader 检查固件完整性 → 启动新版本
```

**优点：**
- 只需一个 App 分区空间 + 临时缓冲区
- 适合 Flash 有限的低成本 MCU

**缺点：**
- 更新过程中擦除 → 写入的阶段是"裸机"——断电就变砖
- 需要额外的临时存储区（外部 Flash 或内部空闲块）
- 复制过程耗时，而且需要 XIP（原地执行）支持

### 2.3 如何选择

| 场景 | 推荐架构 | 原因 |
|------|---------|------|
| Flash ≥ 1 MB | A/B OTA | 可靠性优先，双区互备 |
| Flash 256~512 KB | XIP OTA | 空间有限但可以腾出缓冲区 |
| 电池供电设备 | A/B OTA | 更新中断风险高，必须回滚 |
| 量产调试阶段 | XIP OTA | Flash 成本敏感时可接受一定风险 |

---

## 三、ESP32 OTA 实战

ESP32 的 OTA 是 A/B 模式最成熟的参考实现之一。

### 3.1 分区表配置（partitions.csv）

```csv
# Name,   Type, SubType,  Offset,   Size,     Flags
nvs,      data, nvs,      0x9000,   0x5000,
otadata,  data, ota,      0xE000,   0x2000,
phy_init, data, phy,      0xF000,   0x1000,
factory,  app,  factory,  0x10000,  1M,
ota_0,    app,  ota_0,    0x110000, 1M,
ota_1,    app,  ota_1,    0x210000, 1M,
```

- 默认分区表：`ota_0` 和 `ota_1` 各 1 MB，factory 1 MB
- 选择 `ota_0` 开头的启动模式，则 `ota_1` 为目标槽位

### 3.2 OTA 主流程代码

```c
#include "esp_ota_ops.h"
#include "esp_https_ota.h"

static const char *TAG = "ota";
static esp_ota_handle_t ota_handle;

void ota_update_task(void *pvParameter) {
    esp_err_t ret;
    esp_ota_handle_t handle;
    const esp_partition_t *update_partition;
    esp_http_client_config_t config = {
        .url = "https://example.com/firmware.bin",
        .timeout_ms = 10000,
    };

    // 1. 擦除目标分区
    update_partition = esp_ota_get_next_update_partition(NULL);
    ESP_LOGI(TAG, "Writing to partition: %s", update_partition->label);
    esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &handle);

    // 2. 使用 esp_http_client + esp_ota_write 逐块写入
    ret = esp_https_ota(&config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Firmware upgrade failed: %s", esp_err_to_name(ret));
        esp_ota_abort(handle);
        return;
    }

    // 3. 标记固件有效并设置下次启动分区
    esp_ota_set_boot_partition(update_partition);
    ESP_LOGI(TAG, "Update successful! Restarting...");
    esp_restart();
}
```

核心 API 三件套：

| API | 作用 | 注意事项 |
|-----|------|---------|
| `esp_ota_begin()` | 擦除目标分区，获取写入句柄 | `OTA_SIZE_UNKNOWN` 表示全分区写入 |
| `esp_ota_write()` | 逐块写入固件数据 | 建议 4KB 对齐写入 |
| `esp_ota_end()` | 结束写入，计算校验值 | 必须有此步才会更新 otadata |
| `esp_ota_set_boot_partition()` | 标记下次启动分区 | 重启后 Bootloader 根据此标记引导 |

### 3.3 版本号管理

始终在固件中嵌入版本信息，otadata 中只存整数版本用于 Bootloader 判断：

```c
// 在固件中定义版本信息（编译时嵌入）
#define FIRMWARE_VERSION_MAJOR 2
#define FIRMWARE_VERSION_MINOR 1
#define FIRMWARE_VERSION_PATCH 0

// 编译时生成字符串
const char *fw_version_str = "v2.1.0";

void app_main(void) {
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_app_desc_t app_desc;

    // 读取当前固件的应用描述（编译时嵌入）
    if (esp_ota_get_partition_description(running, &app_desc) == ESP_OK) {
        ESP_LOGI(TAG, "Current firmware: %s v%s",
                 app_desc.project_name, app_desc.version);
    }
}
```

---

## 四、STM32 OTA：外部 Flash + Bootloader 跳转

STM32 不像 ESP32 有完整的 OTA SDK，需要自己设计 Bootloader。

### 4.1 硬件架构

```
STM32F4
┌─────────────────────┐
│ 内部 Flash (1 MB)    │
│ 0x08000000 Bootloader│  ← 32 KB
│ 0x08008000 App       │  ← 480 KB
│                      │
│ 外部 QSPI (W25Q256)   │
│ 0x90000000 OTA_Store  │  ← 从服务器下载到此区域
└─────────────────────┘
```

### 4.2 Bootloader 核心逻辑

```c
/* Bootloader 主流程（简化） */
#define APP_ADDRESS       0x08008000
#define OTA_BUFFER_ADDR   0x90000000
#define OTA_MAGIC_NUM     0x4F544131  /* "OTA1" */

void bootloader_main(void) {
    uint32_t magic = *(uint32_t *)OTA_BUFFER_ADDR;

    if (magic == OTA_MAGIC_NUM) {
        /* 验证固件完整性（SHA256 + 签名） */
        if (verify_firmware((uint8_t *)OTA_BUFFER_ADDR, FIRMWARE_MAX_SIZE)) {
            /* 擦除内部 App 分区 */
            erase_app_sector();
            
            /* 从外部 Flash 复制到内部 Flash */
            flash_write(APP_ADDRESS, (uint8_t *)OTA_BUFFER_ADDR, FIRMWARE_SIZE);
            
            /* 清除外部 Flash 标记 */
            *(uint32_t *)OTA_BUFFER_ADDR = 0;
        }
    }

    /* 跳转到 App */
    jump_to_app(APP_ADDRESS);
}

void jump_to_app(uint32_t app_addr) {
    /* 设置主堆栈指针为 App 的中断向量表 */
    __set_MSP(*(uint32_t *)app_addr);
    
    /* 获取 Reset_Handler 地址并跳转 */
    uint32_t reset_addr = *(uint32_t *)(app_addr + 4);
    void (*app_reset)(void) = (void (*)(void))reset_addr;
    
    /* 关闭全局中断 */
    __disable_irq();
    
    /* 切换中断向量表偏移 */
    SCB->VTOR = app_addr;
    __DSB();
    __ISB();
    
    app_reset();
}
```

> **关键注意点：** 跳转前必须关闭所有外设中断和 DMA，否则 App 初始化时可能收到来自 Bootloader 配置的残存中断请求。

### 4.3 回滚机制

STM32 实现回滚的思路：

```c
/* App 中标记运行状态 */
#define STATUS_NORMAL    0xA5A5A5A5
#define STATUS_PENDING   0x5A5A5A5A  /* 刚完成 OTA，需要确认 */

uint32_t g_ota_status __attribute__((section(".noinit"))) = STATUS_NORMAL;

void app_main(void) {
    /* 如果是 OTA 后首次运行 */
    if (g_ota_status == STATUS_PENDING) {
        /* 运行自检：检查关键外设是否正常 */
        if (selftest_pass()) {
            g_ota_status = STATUS_NORMAL;
        } else {
            /* 自检失败，强制回滚 */
            *(uint32_t *)OTA_BUFFER_ADDR = 0;  /* 清除新固件标记 */
            NVIC_SystemReset();  /* 重启进入 Bootloader 重新跳转 */
        }
    }
    
    /* 正常主循环 */
    while (1) {
        /* ... */
    }
}
```

### 4.4 固件签名与安全

生产环境决不能裸传 bin 文件。至少需要：

```c
/* Bootloader 中校验固件签名 */
#define RSA_SIGNATURE_SIZE 256

typedef struct {
    uint32_t header_magic;           /* 固定为 FIRMWARE_HEADER_MAGIC */
    uint32_t firmware_version;       /* 版本号 */
    uint32_t firmware_size;          /* 固件大小 */
    uint32_t crc32;                  /* CRC32 校验 */
    uint8_t padding[240];            /* 对齐到 256 字节 */
    uint8_t signature[RSA_SIGNATURE_SIZE];  /* RSA-2048 签名 */
    uint8_t firmware_data[];         /* 实际固件数据 */
} firmware_header_t;

bool verify_firmware(uint8_t *buf, uint32_t size) {
    firmware_header_t *hdr = (firmware_header_t *)buf;
    
    /* 1. 校验 magic */
    if (hdr->header_magic != FIRMWARE_HEADER_MAGIC) return false;
    
    /* 2. CRC32 校验内容完整性 */
    uint32_t calc_crc = calculate_crc32(hdr->firmware_data, hdr->firmware_size);
    if (calc_crc != hdr->crc32) return false;
    
    /* 3. RSA 签名验证 */
    if (!rsa_verify(buf, sizeof(firmware_header_t) - RSA_SIGNATURE_SIZE,
                    hdr->signature, public_key)) return false;
    
    return true;
}
```

---

## 五、版本号管理规范

固件版本号不仅是给人看的，更是给 OTA 决策用的：

```
major.minor.patch[.compatibility]
    ↑       ↑      ↑        ↑
   大版本   小版本   补丁    兼容性版本（可选）
```

嵌入式环境建议额外增加一个 `compatibility` 字段（兼容性指纹）：

```c
typedef struct {
    uint8_t  major;           /* 大版本：架构性变化时递增 */
    uint8_t  minor;           /* 小版本：功能新增 */
    uint8_t  patch;           /* 补丁：Bug 修复 */
    uint8_t  compatibility;   /* 兼容性：分区表布局、外设配置的 hash */
} fw_version_t;
```

**兼容性字段的作用：** 当 Bootloader 判断 OTA 版本时，除了比较大小，还应检查 `compatibility`。如果新固件改了分区表布局，旧 Bootloader 可能无法正确加载——这时应该要求先升级 Bootloader 再升级 App。

---

## 总结

OTA 不是"把新固件写到 Flash 里重启就行"那么简单。分区表布局决定了 OTA 的可靠性上限，Bootloader 是 OTA 的守门员，而回滚机制是最后一道防线。

选型口诀：

> **Flash 大用 A/B，双区互保永不慌；**
> **Flash 小用 XIP，时间换空间要心细；**
> **Bootloader 只做裁判，签名校验不能省；**
> **版本管理要规范，回滚机制兜住底。**

从 ESP32 的内置 OTA SDK 到 STM32 的自建 Bootloader，核心思路是一致的：分区合理、校验严格、回滚可靠。无论你用哪个平台，这些原则都不会变。

> 🏷️ OTA 分区表 A/B OTA XIP OTA Bootloader 固件升级 ESP32 STM32 W25Qxx 回滚机制 固件签名 版本管理 物联网
