---
title: "Linux 驱动开发实战系列框架"
description: "从 Linux 设备模型、内核资源和外设总线，深入存储、网络、USB、V4L2、ASoC 与驱动可靠性。"
pubDate: "2026-08-27"
series: linux-driver
order: 0
tags: ["Linux Driver", "Kernel", "Device Model"]
draft: true
---

# Linux 驱动开发实战系列框架

## 系列边界

Linux 驱动系列回答的是“Linux 内核如何描述、匹配、管理和访问硬件”。它从 platform/probe 和字符设备开始，经过内核同步、I2C/SPI/UART、DMA、内存与资源框架，进入块设备、MTD、netdev、USB、V4L2、ASoC、thermal 和可靠性分析。

rootfs、启动服务、系统升级和量产属于 BSP；驱动系列只在设备 PM、firmware、NVMEM 等与内核设备生命周期直接相关的地方讨论系统集成。

`mermaid
flowchart LR
    A[设备模型与模块] --> B[内核资源与并发]
    B --> C[总线与外设]
    C --> D[DMA / IOMMU / firmware]
    D --> E[存储 / 网络 / 多媒体子系统]
    E --> F[性能与可靠性]
`

## 四个阶段

1. 驱动模型、模块、字符设备、sysfs 与内核执行上下文；
2. I2C、SPI、UART、PWM、ADC、watchdog、DMA 与调试；
3. device lifecycle、I/O 映射、pinctrl、IRQ、clock、regulator、IOMMU、remoteproc 与 NVMEM；
4. block、MTD、netdev、USB、V4L2、ASoC、thermal 和长稳分析。

## 篇目顺序

| 顺序 | 主题 | 文件 |
|---:|:---|:---|
| 1 | platform 设备模型与 probe 机制 | `linux-driver-01-platform-device-model-and-probe.md` |
| 2 | 第一个内核模块与字符设备 | `linux-driver-02-first-kernel-module-and-char-device.md` |
| 3 | misc、sysfs、procfs 与 debugfs | `linux-driver-03-misc-sysfs-procfs-debugfs.md` |
| 4 | GPIO 与 LED 子系统 | `linux-driver-04-gpio-led-subsystem.md` |
| 5 | 按键、中断与 Input 子系统 | `linux-driver-05-keys-interrupt-input-subsystem.md` |
| 6 | timer、workqueue 与 delayed work | `linux-driver-06-timers-workqueues-delayed-work.md` |
| 7 | 内核同步原语与并发设计 | `linux-driver-07-kernel-synchronization-primitives.md` |
| 8 | I2C、regmap 与传感器驱动 | `linux-driver-08-i2c-regmap-sensor-driver.md` |
| 9 | SPI 设备与传输 | `linux-driver-09-spi-driver-transfers.md` |
| 10 | UART、TTY 与 console 驱动框架 | `linux-driver-10-uart-tty-console-driver.md` |
| 11 | PWM、ADC 与 watchdog 驱动适配 | `linux-driver-11-pwm-adc-watchdog.md` |
| 12 | DMA 与缓存一致性 | `linux-driver-12-dma-cache-coherency.md` |
| 13 | 驱动调试方法论 | `linux-driver-13-driver-debugging-methodology.md` |
| 14 | Linux 设备模型、sysfs 与资源生命周期 | `linux-driver-14-linux-device-model-lifecycle.md` |
| 15 | 驱动内存管理与 I/O 映射 | `linux-driver-15-driver-memory-io-mapping.md` |
| 16 | pinctrl、GPIO 与 IRQ 子系统深入 | `linux-driver-16-pinctrl-gpio-irq-subsystem.md` |
| 17 | clock、reset、regulator 与上电时序 | `linux-driver-17-clock-reset-regulator-power-sequence.md` |
| 18 | IOMMU 与 DMA 地址转换 | `linux-driver-18-iommu-dma-address-translation.md` |
| 19 | 固件加载、remoteproc 与 rpmsg | `linux-driver-19-firmware-remoteproc-rpmsg.md` |
| 20 | RTC、NVMEM、EEPROM 与 eFuse 板级信息管理 | `linux-driver-20-rtc-nvmem-eeprom-efuse.md` |
| 21 | 块设备、eMMC 与 SD 存储链路 | `linux-driver-21-block-storage-emmc-sd.md` |
| 22 | MTD、UBI、SPI NOR 与 NAND 存储 | `linux-driver-22-mtd-ubi-nor-nand.md` |
| 23 | Ethernet、MAC、PHY 与 netdev | `linux-driver-23-ethernet-mac-phy-netdev.md` |
| 24 | USB Host、Device 与 OTG | `linux-driver-24-usb-host-device-otg.md` |
| 25 | V4L2、IMX415 与 MIPI CSI | `linux-driver-25-v4l2-imx415-mipi-csi.md` |
| 26 | ALSA SoC、I2S/TDM 与音频链路 | `linux-driver-26-alsa-asoc-i2s-audio.md` |
| 27 | thermal、CPUFreq、Devfreq 与电源管理 | `linux-driver-27-thermal-cpufreq-devfreq-pm.md` |
| 28 | 系统可靠性、性能分析与长稳调试 | `linux-driver-28-reliability-performance-debug.md` |

## 与专门子系统系列的关系

本系列中的 USB、V4L2 与 ASoC 文章负责内核驱动入口和 RV1126 bring-up。USB、PCIe 与音视频独立系列继续深入协议、框架细节、应用接口和端到端数据链路。