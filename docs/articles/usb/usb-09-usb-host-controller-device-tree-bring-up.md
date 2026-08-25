---
title: "嵌入式知识体系 · USB 驱动开发实战 #09 · USB Host 控制器与设备树 Bring-up"
description: "USB 外设驱动真正落到嵌入式板卡上，第一道门槛通常不是 `usb_driver`，而是 **Host 控制器能否正常工作**。如果控制器没有启动、PHY 没有上电、VBus 没有输出，后面的 `lsusb`、类驱动和 `probe()` 都不会出现。"
pubDate: "2026-08-18"
series: usb
order: 9
tags: ["USB", "Linux Driver"]
draft: false
---
Linux USB interface driver 建立在 Host 控制器已经正常工作的前提上。对嵌入式 SoC 而言，真正的第一步是让 HCD 获得寄存器、IRQ、clock/reset、PHY 和 VBUS，并向 usbcore 注册 root hub。设备树只是在描述这些依赖，缺少任何一项都可能让 `lsusb` 完全看不到端口。

本篇以通用 HCD bring-up 为主，区分 OHCI/EHCI/xHCI、DWC2/DWC3 的职责，并沿 platform probe 追到 `usb_add_hcd()`。

## Host 控制器类型决定调度和硬件队列

OHCI 主要服务 USB 1.1，使用 ED/TD 等描述符；EHCI 负责 USB 2.0 High Speed，低/全速设备通常经 Transaction Translator 或 companion 路径；xHCI 统一管理 USB 2.0/3.x 设备，使用 command/transfer/event ring。

DWC2 是常见 USB 2.0 dual-role IP，可在 Host 与 Device 间切换；DWC3 提供 USB 3.x device core，Host 模式通常表现为 xHCI 平台设备。驱动名称相似不等于寄存器模型相同，设备树 compatible 必须匹配实际 IP 和 glue layer。

HCD 向 usbcore 表现一个 root hub。物理端口连接变化通过 root-hub control/status API 上报，hub 驱动随后执行枚举。因此 HCD 注册成功后即使没有外接设备，`lsusb -t` 也应看到 root hub。

## platform probe 如何走到 `usb_add_hcd`

典型流程是：

1. platform driver 匹配 compatible；
2. 映射 MMIO、取得 IRQ；
3. enable clock、deassert reset、初始化 PHY；
4. `usb_create_hcd()` 分配通用 HCD；
5. 填入资源和私有控制器状态；
6. 初始化硬件与 DMA mask；
7. `usb_add_hcd()` 注册 root hub 并允许中断。

失败回滚必须反向停止控制器、remove HCD、退出 PHY、assert reset、disable clock。若 IRQ 在 HCD 状态完整前打开，早到中断可能访问未初始化 ring/queue。

`usb_add_hcd` 失败说明问题仍在控制器/HCD 注册阶段；root hub 出现后普通 Device 枚举失败，才进入端口供电、PHY 信号和上层 USB 协议。

## 设备树描述硬件依赖，不描述 USB Device

简化的 EHCI 节点可能是：

```dts
usb@ff500000 {
    compatible = "generic-ehci";
    reg = <0x0 0xff500000 0x0 0x10000>;
    interrupts = <GIC_SPI 62 IRQ_TYPE_LEVEL_HIGH>;
    clocks = <&cru HCLK_USBHOST>, <&cru CLK_USBHOST_UTMI>;
    resets = <&cru SRST_USBHOST>;
    phys = <&usb2phy_host>;
    phy-names = "usb";
    vbus-supply = <&vcc5v0_host>;
    status = "okay";
};
```

`reg/interrupts` 对应控制器资源，clock/reset 让 IP 工作，PHY 负责模拟/收发器，`vbus-supply` 控制 Host 端口供电。具体 binding 的 clock/phy 名称由 compatible 决定，不能从另一 SoC 节点照搬。

外接 USB Device 的 VID/PID、interface 和 endpoint 不写进设备树，它们由总线枚举发现。设备树描述的是不可枚举的板级连接和控制器资源。

## Dual-role、OTG 与 Type-C 角色切换

`dr_mode = "host"`、`"peripheral"`、`"otg"` 指定固定或双角色。固定 Host 可直接使能 VBUS；Device 模式等待 VBUS；OTG/Type-C 系统还需要 ID、extcon、Type-C Port Manager 或 `usb-role-switch` 协调控制器、PHY 与供电方向。

```dts
usb@fe800000 {
    compatible = "snps,dwc2";
    dr_mode = "otg";
    usb-role-switch;
    phys = <&usb2phy_otg>;
    phy-names = "usb2-phy";
};
```

角色切换不是只改一个 mode bit。必须先停止当前 HCD/UDC 数据路径、断开 pull-up 或 VBUS、重新配置 PHY/FIFO，再启动另一角色。状态机错误会表现为 Host root hub 和 UDC 反复注册/注销。

## PHY、VBUS 和 cache/IOMMU 常制造“软件已 probe”假象

控制器寄存器可访问不代表 PHY 锁定或端口有电。用示波器确认 VBUS/RESET/REFCLK（若适用），读取 PHY 状态和 controller port status。过流 GPIO、regulator current limit 和 Type-C power role 也会阻止供电。

使用 DMA descriptor 的 HCD 要满足对齐、coherent memory、DMA mask 和 cache 维护要求。IOMMU fault、event ring 不更新或 descriptor 仍是旧值，可能是 DMA 映射问题而非 USB 协议。相关错误应与 `dmesg` 中 IOMMU/HCD 日志一起看。

## bring-up 的最小验证顺序

```bash
dmesg | grep -Ei 'xhci|ehci|ohci|dwc|usb|phy'
ls /sys/bus/platform/drivers
lsusb -t
cat /sys/kernel/debug/clk/clk_summary 2>/dev/null
cat /sys/kernel/debug/regulator/regulator_summary 2>/dev/null
```

先确认 controller platform device 与 driver 绑定，再确认 `usb_add_hcd` 后 root hub 存在；接着确认 VBUS 与端口 connect change，最后才插入已知良好设备做枚举。没有 root hub 时更换 U 盘没有诊断价值。

动态调试可针对 HCD 和 PHY 模块开启。若控制器有 debugfs ring/port 状态，记录 enqueue/dequeue、event ring 与 port status，避免只看一条“timeout”。

## 小结

嵌入式 Linux USB Host bring-up 的主线是硬件依赖到 HCD，再到 root hub 和普通设备枚举。OHCI/EHCI/xHCI 与 DWC2/DWC3 代表不同硬件模型；设备树连接 MMIO、IRQ、clock/reset、PHY、regulator 和 role switch；`usb_add_hcd` 是进入 usbcore 的关键边界。下一篇把视角移到 MCU，比较没有 Linux usbcore 时协议栈如何通过 DCD/HCD 直接管理 USB IP。
