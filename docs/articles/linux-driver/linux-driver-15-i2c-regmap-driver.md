---
title: "嵌入式知识体系 · Linux 驱动开发实战 #15 · I2C 子系统、设备驱动与 Regmap"
description: "从 I2C controller、adapter、client 与 driver 的关系出发，完成寄存器设备访问，并理解 Regmap 的抽象。"
pubDate: "2026-08-29"
series: linux-driver
order: 15
tags: ["Linux Driver", "I2C", "Regmap", "Sensor"]
draft: false
---

I2C 设备通过地址和寄存器通信。裸机程序直接调用控制器函数，Linux 则把控制器、总线实例、设备和驱动分开：controller driver 注册 adapter，设备树创建 client，i2c_driver 与 client 匹配后 probe。

## 1. adapter 和 client 分别代表什么

`struct i2c_adapter` 表示一条可传输 I2C message 的总线，背后是某个 controller。`struct i2c_client` 表示该总线上的一个设备地址，并嵌入 `struct device`。同一个 adapter 可以挂多个 client，同一个 driver 可以匹配多个 compatible。

```dts
&i2c2 {
    status = "okay";

    demo@48 {
        compatible = "longway,demo-sensor";
        reg = <0x48>;
    };
};
```

地址要用 7 位形式，不能把数据手册中的读写方向位一起写入 `reg`。

## 2. i2c_msg 表达一次总线事务

寄存器读取常由“写寄存器地址、重复起始、读数据”组成：

```c
u8 reg = REG_CHIP_ID;
u8 value;
struct i2c_msg msgs[] = {
    { .addr = client->addr, .len = 1, .buf = &reg },
    { .addr = client->addr, .flags = I2C_M_RD,
      .len = 1, .buf = &value },
};

ret = i2c_transfer(client->adapter, msgs, ARRAY_SIZE(msgs));
if (ret != ARRAY_SIZE(msgs))
    return ret < 0 ? ret : -EIO;
```

返回值是完成的 message 数，不是字节数。设备是否允许 repeated start、寄存器宽度和字节序都要依据数据手册。

## 3. i2c_driver 把匹配和设备访问组织起来

```c
static const struct of_device_id demo_of_match[] = {
    { .compatible = "longway,demo-sensor" },
    { }
};
MODULE_DEVICE_TABLE(of, demo_of_match);

static struct i2c_driver demo_driver = {
    .probe = demo_probe,
    .remove = demo_remove,
    .driver = {
        .name = "demo-sensor",
        .of_match_table = demo_of_match,
    },
};
module_i2c_driver(demo_driver);
```

不同内核版本的 probe 原型可能变化，应以当前 `struct i2c_driver` 定义和现有驱动为准。probe 先读 chip ID，只有硬件身份符合预期才注册上层接口。

## 4. Regmap 抽象重复的寄存器操作

```c
static const struct regmap_config demo_regmap_config = {
    .reg_bits = 8,
    .val_bits = 8,
    .max_register = 0x7f,
};

regmap = devm_regmap_init_i2c(client, &demo_regmap_config);
ret = regmap_read(regmap, REG_CHIP_ID, &chip_id);
```

Regmap 统一读写、update_bits、bulk access、cache 和 debugfs。volatile 状态寄存器不能从旧 cache 返回；只读/可写范围可以用回调约束。cache 也不等于硬件掉电后自动恢复，runtime PM 仍要协调 cache-only、dirty 和 sync。

## 5. 从总线证据定位失败

```sh
i2cdetect -l
i2cdetect -y <bus>
dmesg | grep -i -E 'i2c|demo-sensor'
readlink -f /sys/bus/i2c/devices/<bus>-0048/driver
```

扫描命令可能影响某些设备，量产硬件要先确认安全。无 ACK 优先检查供电、地址、Pinctrl、上拉和波形；能读 ID 但 probe 失败，再检查寄存器协议和驱动条件。

下一篇学习 SPI。它没有地址和 ACK，而是用 chip select、时钟模式和 transfer 组织通信。

## 6. 参考资料

- [Linux I2C subsystem](https://docs.kernel.org/i2c/index.html)
- [Regmap API](https://docs.kernel.org/driver-api/regmap.html)
- [野火：I2C 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_i2c_subsystem.html)
- [野火：Regmap API](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_regmap_api.html)
