---
title: "嵌入式知识体系 · Linux 驱动开发实战 #08 · 设备树 LED 实验、Overlay 与动态设备树"
description: "用设备树描述 LED 的 GPIO 和有效电平，在 platform 驱动中取得资源，并理解 Overlay 的用途与限制。"
pubDate: "2026-08-29"
series: linux-driver
order: 8
tags: ["Linux Driver", "Device Tree", "Overlay", "LED"]
draft: false
---

第 4 篇通过模块参数告诉驱动 GPIO 编号，第 7 篇说明设备树可以描述板级资源。本章把两条线合在一起：DTS 负责说明 LED 接在哪里、什么电平有效，驱动只负责使用这个资源。

## 1. 用 GPIO 属性描述 LED

板级节点可以写成：

```dts
learning_led: learning-led {
    compatible = "longway,learning-led";
    led-gpios = <&gpio2 RK_PB3 GPIO_ACTIVE_LOW>;
    status = "okay";
};
```

`led-gpios` 的参数由 GPIO provider 的 `#gpio-cells` 定义。`GPIO_ACTIVE_LOW` 已经表达有效电平，驱动不再保存单独的 `active_low` 参数。`gpio2`、bank/pin 和宏只作结构说明，实际节点必须根据原理图与 RV1126 SDK 核对。

## 2. platform 驱动从 device 中取得 descriptor

compatible 匹配后，probe 使用 consumer API：

```c
static int learning_led_probe(struct platform_device *pdev)
{
    struct learning_led *led;

    led = devm_kzalloc(&pdev->dev, sizeof(*led), GFP_KERNEL);
    if (!led)
        return -ENOMEM;

    led->gpiod = devm_gpiod_get(&pdev->dev, "led", GPIOD_OUT_LOW);
    if (IS_ERR(led->gpiod))
        return dev_err_probe(&pdev->dev, PTR_ERR(led->gpiod),
                             "failed to get LED GPIO\n");

    platform_set_drvdata(pdev, led);
    return learning_led_register_chrdev(led);
}
```

consumer 名称 `"led"` 对应属性前缀 `led-gpios`。descriptor 会自动处理 active-low 语义，`gpiod_set_value_cansleep(led->gpiod, 1)` 表示逻辑点亮，不需要驱动再翻转电平。字符设备注册可以复用第 4 篇，区别只在资源来源。

## 3. 编译、部署并证明新 DTB 生效

先编译目标 DTB 和模块，再通过当前 SDK 的打包/烧录方式更新。重启后依次确认：

```sh
tr '\0' '\n' < /sys/firmware/devicetree/base/learning-led/compatible
dmesg | grep -i learning
readlink -f /sys/bus/platform/devices/*learning*
ls -l /dev/learning_led
```

live tree 证明 Bootloader 交给内核的 DTB 包含节点，platform device 路径证明节点被枚举，probe 日志和设备节点证明驱动绑定成功。只有四层证据都成立，LED 实验才真正完成。

## 4. Overlay 修改的是设备树对象

Overlay 是一段可叠加到 base tree 的 DTBO，常用于可插拔扩展板或开发期配置。典型片段引用目标节点并修改属性：

```dts
/dts-v1/;
/plugin/;

&{/} {
    overlay-led {
        compatible = "longway,learning-led";
        led-gpios = <&gpio2 RK_PB3 GPIO_ACTIVE_LOW>;
        status = "okay";
    };
};
```

内核 configfs overlay 需要对应配置和平台支持；很多 RV1126 厂商系统并未开放运行时加载。若系统没有 `/sys/kernel/config/device-tree/overlays`，不要照抄加载命令，应把 DTBO 交给 Bootloader 或继续使用完整 DTB。

移除 Overlay 还要求相关设备能够安全 unbind。驱动若有打开文件、正在运行的工作或硬件 DMA，不能把删除目录当成完整生命周期设计。这里先理解对象变化，热移除将在工程章节处理。

## 5. 从“编号”过渡到“连接关系”

整数 GPIO 让驱动依赖全局编号；设备树加 descriptor 则表达“这个设备的 led 信号连接到哪个 provider”。换板时修改 DTS，驱动仍使用 `devm_gpiod_get()`。这就是设备描述与驱动实现分离带来的直接收益。

下一篇进入并发：一旦用户进程、定时器和中断都可能访问同一个 LED 状态，正确取得资源还不够，还要保证共享数据不会互相破坏。

## 6. 参考资料

- [Devicetree Overlay Notes](https://docs.kernel.org/devicetree/overlay-notes.html)
- [GPIO Mappings](https://docs.kernel.org/driver-api/gpio/board.html)
- [野火：设备树 LED 实验](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_device_tree_rgb_led.html)
- [野火：设备树插件](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_dynamic_device_tree.html)
