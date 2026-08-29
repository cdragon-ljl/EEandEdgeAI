---
title: "嵌入式知识体系 · Linux 驱动开发实战 #16 · SPI 子系统、消息、传输与设备驱动实验"
description: "理解 spi_controller、spi_device、spi_message 和 spi_transfer，并通过可观测波形完成一次 SPI 设备传输。"
pubDate: "2026-08-29"
series: linux-driver
order: 16
tags: ["Linux Driver", "SPI", "spi_message", "Timing"]
draft: true
---

I2C 用地址和 ACK 管理多设备，SPI 则由 controller 选择 chip select，并按约定时钟模式同步移位。Linux 把一条业务事务组织为 message，把 message 中连续的片段组织为 transfer。

## 1. controller、device、message 和 transfer

`spi_controller` 表示 SoC 控制器；`spi_device` 表示某个 CS 上的从设备，保存 mode、最大频率和字宽；`spi_message` 表示一次不可被其他设备插入的事务；`spi_transfer` 描述其中一段 TX/RX buffer、长度、速率和 CS 行为。

一个寄存器读取可能先发送命令，再接收数据：

```c
struct spi_transfer xfers[] = {
    { .tx_buf = &command, .len = 1 },
    { .rx_buf = data, .len = sizeof(data) },
};

spi_message_init(&message);
spi_message_add_tail(&xfers[0], &message);
spi_message_add_tail(&xfers[1], &message);
ret = spi_sync(spi, &message);
```

## 2. mode 和时序必须来自数据手册

CPOL 决定空闲电平，CPHA 决定采样边沿，组合成 mode 0-3。设置错误时仍可能看到时钟和数据，却在从设备一侧采到错误 bit。CS 建立时间、保持时间、最高频率和位序同样属于协议。

```dts
demo@0 {
    compatible = "longway,demo-spi";
    reg = <0>;
    spi-max-frequency = <1000000>;
};
```

`reg` 是 chip select 编号，不是总线地址。若器件需要 CPOL/CPHA 属性，按 binding 添加，不能在驱动里无条件覆盖板级配置。

## 3. probe 中确认设备身份

```c
static int demo_probe(struct spi_device *spi)
{
    u8 id;
    int ret;

    ret = demo_read_reg(spi, REG_CHIP_ID, &id);
    if (ret)
        return dev_err_probe(&spi->dev, ret, "ID read failed\n");
    if (id != EXPECTED_ID)
        return dev_err_probe(&spi->dev, -ENODEV,
                             "unexpected ID 0x%02x\n", id);
    return 0;
}
```

同步传输可睡眠，不能直接放在硬中断。高吞吐设备可使用异步接口，由 completion callback 接收结果，但 buffer 生命周期必须覆盖传输。

## 4. 用逻辑分析仪解释一次传输

先降低到可靠频率，记录 CS、SCLK、MOSI、MISO。核对 CS 是否覆盖整条 message、命令位序、采样边沿和返回 ID。软件日志只说明 API 返回，波形才说明总线发生了什么。

```sh
ls /sys/bus/spi/devices
dmesg | grep -i spi
readlink -f /sys/bus/spi/devices/spiB.C/driver
```

下一篇学习 PWM：它同样输出周期波形，但不是逐字节总线，而是通过 period 和 duty cycle 描述连续信号。

## 5. 从 probe 到 remove 完成最小 SPI 驱动

SPI driver 的生命周期仍由设备模型管理。probe 先检查 controller 是否支持设备需要的 mode、字宽和 transfer 大小，再读取 chip ID。若设备提供 reset GPIO、regulator 或 IRQ，应按硬件时序取得资源，不能把一次 `spi_sync()` 成功等同于完整初始化。

```c
static const struct of_device_id demo_spi_of_match[] = {
    { .compatible = "longway,demo-spi" },
    { }
};
MODULE_DEVICE_TABLE(of, demo_spi_of_match);

static struct spi_driver demo_spi_driver = {
    .probe = demo_spi_probe,
    .remove = demo_spi_remove,
    .driver = {
        .name = "demo-spi",
        .of_match_table = demo_spi_of_match,
    },
};
module_spi_driver(demo_spi_driver);
```

若使用 `spi_async()`，message、transfer 和 buffer 在 callback 前都必须有效；remove 先停止新请求，再等待在途 message 完成。同步接口简化了第一个实验，但不能直接用于硬中断或持有 spinlock 的路径。

完成实验时保存一组“软件配置 + 实测波形”：DTS mode/频率、`spi->mode`、`spi->max_speed_hz`、逻辑分析仪采样结果和读取的 chip ID。只有这些信息一致，才能说明 controller、Pinctrl、CS 和从设备协议真正对齐。

## 6. 参考资料

- [Linux SPI API](https://docs.kernel.org/driver-api/spi.html)
- [野火：SPI 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_spi_subsystem.html)
