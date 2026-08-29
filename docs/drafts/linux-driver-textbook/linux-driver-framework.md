# Linux 驱动开发实战：30 篇学习路径

本系列面向会 C、Makefile 和常用 Linux 命令，但尚未系统学习驱动的读者。通用机制以 Linux 6.12 LTS 为基线，板级实验以 RV1126 为例；厂商内核差异会单独标注。

## 1. 第一阶段：驱动基础

1. [实验环境与内核源码](linux-driver-01-driver-environment-source-tree.md)
2. [内核模块原理与实验](linux-driver-02-kernel-module-first-experiment.md)
3. [VFS 与字符设备](linux-driver-03-vfs-character-device-cdev.md)
4. [字符设备 LED 实验](linux-driver-04-character-led-driver-experiment.md)
5. [设备模型与 sysfs](linux-driver-05-device-model-kobject-class-sysfs.md)
6. [platform 总线与 probe](linux-driver-06-platform-bus-match-probe.md)
7. [设备树基础](linux-driver-07-device-tree-dts-dtsi-compilation.md)
8. [设备树 LED 与 Overlay](linux-driver-08-device-tree-led-overlay-experiment.md)
9. [并发与同步](linux-driver-09-kernel-concurrency-lock-context.md)
10. [定时器与 workqueue](linux-driver-10-timer-hrtimer-workqueue.md)

## 2. 第二阶段：常用驱动框架

11. [Pinctrl 与 GPIO descriptor](linux-driver-11-pinctrl-gpio-descriptor.md)
12. [中断子系统与分层](linux-driver-12-interrupt-gic-irq-domain-layering.md)
13. [阻塞、poll 与异步通知](linux-driver-13-blocking-nonblocking-poll-async.md)
14. [Input、按键与触摸](linux-driver-14-input-key-touchscreen.md)
15. [I2C 与 Regmap](linux-driver-15-i2c-regmap-driver.md)
16. [SPI 子系统](linux-driver-16-spi-message-transfer-driver.md)
17. [PWM](linux-driver-17-pwm-backlight-motor.md)
18. [电源管理与 watchdog](linux-driver-18-power-management-runtime-pm-watchdog.md)
19. [IIO 与 ADC](linux-driver-19-iio-adc-driver.md)
20. [RTC 与 NVMEM](linux-driver-20-rtc-nvmem-eeprom.md)

## 3. 第三阶段：进阶子系统

21. [DMA、IOMMU 与 dma-buf](linux-driver-21-memory-dma-dmaengine-iommu-dmabuf.md)
22. [Framebuffer 与 DRM/KMS](linux-driver-22-framebuffer-drm-kms-display.md)
23. [块设备、SCSI 与 MTD/UBI](linux-driver-23-block-emmc-scsi-mtd-ubi-storage.md)
24. [USB 子系统概览](linux-driver-24-usb-subsystem-overview.md)
25. [UART、TTY 与 console](linux-driver-25-uart-serial-core-tty-console.md)
26. [PCI/PCIe 驱动模型](linux-driver-26-pci-pcie-enumeration-resource-irq.md)
27. [网络、NAPI、MAC 与 PHY](linux-driver-27-net-device-napi-mac-phy.md)
28. [SMP 与内存顺序](linux-driver-28-smp-memory-barrier-percpu.md)

## 4. 第四阶段：工程能力

29. [驱动调试方法](linux-driver-29-driver-debug-dynamic-debug-ftrace.md)
30. [驱动工程化与长稳](linux-driver-30-driver-engineering-remove-recovery-soak.md)

USB 协议与驱动实战进入站内 USB 系列，PCIe 链路/TLP/高吞吐进入 PCIe 系列，V4L2 与 ASoC 进入音视频系列。本系列保持内核驱动学习主线，不重复其他专题。
