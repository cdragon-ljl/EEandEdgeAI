---
title: "Zephyr 实战 #11：UART、SPI、I2C 与传感器接入"
description: "比较三类常用串行总线，并在 nRF52832 DK 上通过 I2C 和 Devicetree 接入 BME280 环境传感器。"
pubDate: 2026-08-23
series: zephyr
order: 11
tags: ["Zephyr", "I2C", "SPI", "UART", "BME280", "传感器"]
draft: false
---

UART、SPI 和 I2C 的驱动入口看起来不同，Zephyr 的工程思路却一致：**总线控制器、地址、片选和引脚属于设备树；应用先获得设备，再调用子系统 API。**

UART 更像字节流，适合日志和命令行；SPI 速度高、全双工，适合高速 ADC、显示屏和 Flash；I2C 用地址共享两根线，适合环境传感器。本文以 BME280 为例，基于 Zephyr 4.4.x 的 sensor API。

## 一、先按物理约束选总线

UART 是无帧边界字节流，callback buffer 所有权需明确；SPI 是带 CS/mode 的全双工 transaction，tx/rx buffer 必须覆盖调用期；I2C 是寻址事务，NACK、仲裁和被拉低 SDA 都是可恢复失败。sensor API 将总线读取与值读取分开：fetch 刷新驱动 data，channel_get 读取最近样本；不同线程不可无锁交叉两者。

| 总线 | 线数与寻址 | 优点 | 典型限制 |
| --- | --- | --- | --- |
| UART | TX/RX 点对点 | 简单、调试友好 | 无多从机寻址，吞吐有限 |
| I2C | SDA/SCL 加地址 | 两线多设备 | 上拉、电容和速率敏感 |
| SPI | SCK/MOSI/MISO/CS | 高速、全双工 | 每个从机通常要独立 CS |

FreeRTOS 中常把 HAL_I2C_Mem_Read 包在传感器函数里；Zephyr 把总线节点和传感器节点独立描述，BME280 驱动由 compatible 自动匹配，应用只使用 sensor_sample_fetch 和 sensor_channel_get。

```mermaid
flowchart TD
    A[应用 sensor API] --> B[BME280 驱动]
    B --> C[I2C API]
    C --> D[i2c0 控制器]
    D --> E[SDA 与 SCL]
    E --> F[BME280 地址 0x76]
    G[Devicetree overlay] --> B
    G --> C
```

【图1：传感器驱动通过 I2C 控制器连接到硬件】

## 二、nRF52 DK 与 BME280 接线

BME280 模块必须使用 3.3 V 供电。示例采用 I2C 地址 0x76；部分模块将 SDO 拉高后会变为 0x77，应以模块原理图或地址扫描结果为准。

| BME280 引脚 | nRF52 DK | 说明 |
| --- | --- | --- |
| VCC | 3.3 V | 不要向 nRF52832 GPIO 输入 5 V |
| GND | GND | 必须共地 |
| SCL | P0.27 | 示例使用 i2c0 SCL |
| SDA | P0.26 | 示例使用 i2c0 SDA |
| CSB | 3.3 V | 选择 I2C 模式 |
| SDO | GND | 选择地址 0x76 |

若开发板或模块已带上拉电阻，不要重复并联太小电阻。I2C 读不到设备时，首先确认实际引脚、地址和上拉，而不是先修改应用代码。

## 三、贯穿实验：BME280 采样链路

本节把前文变成可复制工程，目标固定为 **Zephyr 4.4.x** 与 `nrf52dk/nrf52832`。BME280 以 3.3 V 供电并共地，SDA/P0.26、SCL/P0.27、CSB 拉高、SDO 接 GND（`0x76`）。地址为 `0x77` 的模块只改 overlay，不能改 C 的设备地址。BME280 官方样例与 binding 是 [BME280 sample](https://docs.zephyrproject.org/4.4.0/samples/sensor/bme280/README.html) 的权威补充。

```text
app/
├── CMakeLists.txt
├── prj.conf
├── app.overlay
└── src/
    └── main.c
```

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(bme280_i2c)
target_sources(app PRIVATE src/main.c)
```

```ini
# prj.conf
CONFIG_I2C=y
CONFIG_SENSOR=y
CONFIG_BME280=y
CONFIG_LOG=y
CONFIG_LOG_DEFAULT_LEVEL=3
CONFIG_MAIN_STACK_SIZE=1024
```

```dts
/* app.overlay */
#include <zephyr/dt-bindings/pinctrl/nrf-pinctrl.h>
&pinctrl {
    i2c0_default: i2c0_default { group1 {
        psels = <NRF_PSEL(TWIM_SDA, 0, 26)>, <NRF_PSEL(TWIM_SCL, 0, 27)>;
    }; };
    i2c0_sleep: i2c0_sleep { group1 {
        psels = <NRF_PSEL(TWIM_SDA, 0, 26)>, <NRF_PSEL(TWIM_SCL, 0, 27)>;
        low-power-enable;
    }; };
};
&i2c0 {
    status = "okay";
    pinctrl-0 = <&i2c0_default>; pinctrl-1 = <&i2c0_sleep>;
    pinctrl-names = "default", "sleep";
    bme280: bme280@76 { compatible = "bosch,bme280"; reg = <0x76>; status = "okay"; };
};
```

`DEVICE_DT_GET(DT_NODELABEL(bme280))` 是编译期宏，取 driver 实例引用；`device_is_ready()` 必须在 API 前检查。`sensor_sample_fetch(const struct device *dev)` 是阻塞线程 API，把最新样本存入驱动私有 data，返回 `0` 或负 errno。`sensor_channel_get(const struct device *dev, enum sensor_channel chan, struct sensor_value *val)` 从最近 fetch 的 data 取得一个 channel；同一 device 的 fetch/get 不能无锁地在多个线程交叉调用。`sensor_value` 由 `val1` 整数部分和 `val2` 百万分之一部分组成。

```c
/* src/main.c */
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(bme280_i2c, LOG_LEVEL_INF);
#define BME280_NODE DT_NODELABEL(bme280)
static const struct device *const bme280 = DEVICE_DT_GET(BME280_NODE);

/**
 * @brief 获取并输出一次温度、气压和湿度样本。
 * @return 0 表示三个 channel 均成功；负 errno 表示 fetch 或 get 失败。
 */
static int bme280_log_sample(void)
{
    struct sensor_value temperature;
    struct sensor_value pressure;
    struct sensor_value humidity;
    int err;

    err = sensor_sample_fetch(bme280);
    if (err != 0) { LOG_ERR("sample fetch failed: %d", err); return err; }
    err = sensor_channel_get(bme280, SENSOR_CHAN_AMBIENT_TEMP, &temperature);
    if (err != 0) { LOG_ERR("temperature get failed: %d", err); return err; }
    err = sensor_channel_get(bme280, SENSOR_CHAN_PRESS, &pressure);
    if (err != 0) { LOG_ERR("pressure get failed: %d", err); return err; }
    err = sensor_channel_get(bme280, SENSOR_CHAN_HUMIDITY, &humidity);
    if (err != 0) { LOG_ERR("humidity get failed: %d", err); return err; }
    LOG_INF("T %d.%06d C P %d.%06d kPa H %d.%06d %%",
            temperature.val1, temperature.val2, pressure.val1, pressure.val2,
            humidity.val1, humidity.val2);
    return 0;
}

int main(void)
{
    if (!device_is_ready(bme280)) { LOG_ERR("BME280 not ready"); return -ENODEV; }
    while (true) {
        (void)bme280_log_sample();
        k_sleep(K_SECONDS(1));
    }
}
```

```powershell
west build -p always -b nrf52dk/nrf52832 app
west flash
Select-String build/zephyr/zephyr.dts -Pattern "bme280@76"
Select-String build/zephyr/.config -Pattern "CONFIG_(I2C|SENSOR|BME280)"
```

预期输出形式为 `T 23.000000 C P 100.000000 kPa H 45.000000 %`，数值取决于环境；NACK、无 ready 或 get 错误都应作为可观察的失败路径处理，而非无限重试。

### 3.1 UART 和 SPI 的相同边界

UART 是点对点字节流；异步 `uart_callback_set(const struct device *dev, uart_callback_t cb, void *user_data)` 注册 callback，buffer 的所有权和释放时刻必须由应用约定，不能把即将复用的 RX buffer 交给延后线程。SPI 用 `SPI_DT_SPEC_GET(node_id, operation, delay)` 宏获得 `struct spi_dt_spec`（控制器、频率、模式、CS），再在**线程上下文**调用 `spi_transceive_dt(spec, tx, rx)`；tx/rx buffer set 在返回前需有效。二者都要先检查关联 device ready，并为超时、线序、CS 极性与协议帧错误分别记录诊断。

| 症状 | 根因 | 检查 |
| --- | --- | --- |
| BME280 未 ready | node disabled、Kconfig 或 init 失败 | `zephyr.dts`、`.config`、日志 |
| I2C NACK | 地址、上拉、供电或线序错误 | 0x76/0x77、共地、分析仪 |
| 数值异常 | fetch 后忽略 get 错误或 channel 不支持 | 检查每个返回码和 binding |
| UART 数据破损 | callback 后过早复用 buffer | 写明 buffer 所有权 |
| SPI 不响应 | CS、mode、频率或 MISO/MOSI 错 | 查 `spi_dt_spec` 与接线 |

## 四、从实验拆解 overlay 与实例

```dts
&i2c0 {
    status = "okay";
    pinctrl-0 = <&i2c0_default>;
    pinctrl-names = "default";

    bme280: bme280@76 {
        compatible = "bosch,bme280";
        reg = <0x76>;
    };
};
```

最低配置：

```ini
CONFIG_I2C=y
CONFIG_SENSOR=y
CONFIG_BME280=y
CONFIG_LOG=y
```

构建后在 build/zephyr/zephyr.dts 搜索 bme280@76，确认 overlay 真正合并。再在 build/zephyr/.config 搜索 CONFIG_BME280，确认驱动被选中。

## 五、从实验拆解 fetch 与 channel

```c
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(bme280_demo, LOG_LEVEL_INF);

#define BME280_NODE DT_NODELABEL(bme280)
static const struct device *const bme280 = DEVICE_DT_GET(BME280_NODE);

int main(void)
{
    struct sensor_value temperature;
    struct sensor_value pressure;
    int err;

    if (!device_is_ready(bme280)) {
        LOG_ERR("BME280 is not ready");
        return 0;
    }

    while (true) {
        err = sensor_sample_fetch(bme280);
        if (err == 0) {
            sensor_channel_get(bme280, SENSOR_CHAN_AMBIENT_TEMP,
                               &temperature);
            sensor_channel_get(bme280, SENSOR_CHAN_PRESS,
                               &pressure);
            LOG_INF("temp %d.%06d C, pressure %d.%06d kPa",
                    temperature.val1, temperature.val2,
                    pressure.val1, pressure.val2);
        } else {
            LOG_ERR("sample fetch failed: %d", err);
        }

        k_sleep(K_SECONDS(1));
    }
}
```

sensor_value 使用整数部分 val1 与百万分之一部分 val2，避免在小 MCU 上强制引入浮点格式化。不同传感器可用的 channel 不同；调用前应查该驱动的 binding、样例或 API 文档。

```mermaid
sequenceDiagram
    participant A as 应用线程
    participant S as BME280 驱动
    participant I as I2C 控制器
    participant H as 传感器
    A->>S: sensor_sample_fetch
    S->>I: I2C 读原始寄存器
    I->>H: 地址 0x76 传输
    H-->>I: 原始测量值
    I-->>S: 数据
    A->>S: sensor_channel_get
    S-->>A: 换算后的 sensor_value
```

【图2：统一 sensor API 隐藏寄存器读取与校准过程】

## 六、UART、SPI 与 I2C 的事务差异

UART 常用于日志，也可用 uart_callback_set 进入异步收发模式；SPI 常用 spi_dt_spec 将控制器、频率、片选和 mode 放进设备树。它们与 I2C 的共同流程仍是：

1. 在设备树启用控制器，设置 pinctrl。
2. 在子节点描述从设备、地址或片选。
3. 通过 DT 宏得到设备或 dt_spec。
4. 用子系统 API 收发。
5. 在线程或工作队列处理长时间协议解析。

不要把 UART 回调里收到的 buffer 直接交给会延迟使用的线程，除非已经规定所有权；不要在 SPI/I2C 错误时无限重试，先区分接线错误、从机未上电和总线忙。

## 七、常见问题

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| BME280 未 ready | 节点 disabled、驱动未启用或 compatible 错 | 查 zephyr.dts、.config 与日志 |
| I2C NACK | 地址、接线或供电错误 | 核对 0x76/0x77、SDA/SCL、上拉和共地 |
| 数值不合理 | 读错 channel 或未调用 sample_fetch | 先 fetch，再按驱动支持的 channel get |
| I2C 总线一直忙 | SDA 被拉低或时序异常 | 用示波器检查并执行总线恢复策略 |
| 日志影响采样 | 串口输出太频繁 | 降低日志频率或在缓存中聚合 |

## 八、动手练习

1. 将地址改成 0x77 并观察 NACK，再恢复为模块实际地址。
2. 打印温度、气压和湿度，分别验证传感器支持的 channel。
3. 用逻辑分析仪观察一次 I2C 读事务，核对起始、地址和 ACK。
4. 将采样移入 delayable work，再把结果发到消息队列。

## 九、里程碑自检

- [ ] 能根据速率、线数和拓扑选择 UART、SPI 或 I2C
- [ ] 会为 BME280 写 I2C overlay 与 Kconfig
- [ ] 会用 DEVICE_DT_GET 和 sensor API 采样
- [ ] 能从 zephyr.dts 与 .config 验证总线和驱动
- [ ] 知道 I2C 失败要先检查地址、上拉、供电和引脚

## 小结

外设接入的可移植性来自描述与访问分离：设备树记录电气连接，子系统 API 表达业务意图，驱动负责协议细节。掌握这一模式后，换传感器或换 MCU 时不再需要从寄存器初始化重新开始。

> 🏷️ 标签：Zephyr · I2C · SPI · UART · BME280 · sensor API · Devicetree · nRF52832
