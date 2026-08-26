---
title: "嵌入式知识体系 · USB/PCIe 驱动开发对比 #03 · 调试工具对比"
description: "学驱动不能只看源码，必须掌握工具。USB 和 PCIe 的调试工具完全不同，因为它们的总线模型、资源模型和数据通路都不同。"
pubDate: "2026-08-18"
series: pcie
order: 15
tags: ["USB", "PCIe", "Linux Driver"]
draft: false
---
调试工具不是越多越好，而是每个工具必须对应一个层次。USB 的 usbmon 能看到 Host 调度的传输，PCIe 的 `lspci -vv` 能看到配置与 Link capability，但二者都不能直接证明设备内部协议或 DMA buffer 内容正确。

本篇按“想回答什么问题”比较工具边界。

## 一、设备是否被总线发现

USB：`dmesg -w` 看端口与枚举，`lsusb -t` 看 topology/speed/driver，`lsusb -v` 看描述符。设备不存在时继续查 VBUS、role、PHY 与 EP0。

PCIe：`lspci -Dnn/-tv` 看 BDF/topology，`lspci -vv` 看 LnkSta、BAR、Capability 和 driver。设备不存在时查电源、PERST#、REFCLK、LTSSM 与 Host bridge。

两者的“能列出设备”只证明枚举层成功，不证明功能数据通路。

## 二、描述与配置是否合理

USB 原始描述符：

```bash
hexdump -C /sys/bus/usb/devices/1-2/descriptors
```

配合 `lsusb -v` 检查 bLength、wTotalLength、IAD、endpoint 与 class descriptor。

PCIe 原始配置空间：

```bash
lspci -s BDF -xxxx
cat /sys/bus/pci/devices/BDF/config | hexdump -C
```

配合 `lspci -vv` 检查 Type header、BAR、MSI/MSI-X、PCIe、AER、SR-IOV。`setpci` 会写配置，生产设备上应极谨慎。

## 三、单次传输发生了什么

USB 使用 usbmon，Wireshark 解码 Setup、URB submit/complete、endpoint、status 和 payload：

```bash
sudo modprobe usbmon
sudo cat /sys/kernel/debug/usb/usbmon/0u
```

它能看到 Host 请求与完成，但 Device 固件内部为何 STALL 仍需设备日志。

PCIe 普通 Linux 软件没有等价的全量 TLP 抓包。驱动 tracepoint、ftrace、perf、设备 ring counter、IOMMU fault 和 AER 提供软件证据；真实 TLP/credit/ordering需要 PCIe protocol analyzer 或 RC/EP IP trace。

不要把 `lspci -xxx` 当数据包抓取，它只读 Configuration Space。

## 四、中断是否到达并服务了正确队列

两者都可看 `/proc/interrupts`。USB Host Controller IRQ 是 HCD 服务所有端口/URB，不等于某个 interrupt endpoint 一次 IRQ；PCIe MSI-X 常能直接按 queue vector 映射。

USB 继续结合 usbmon completion 和 class driver log；PCIe 结合 msi_irqs、queue producer/consumer、MSI-X mask/table 和 handler counter。

## 五、DMA、cache 与地址转换哪里出错

USB HCD/UDC DMA 通常由 controller driver 管理，interface driver提交 URB；嵌入式 HCD问题看 controller ring/FIFO、DMA API、IOMMU和 cache。

PCIe Endpoint DMA由功能驱动/设备 ring直接管理，IOMMU fault 的 requester/IOVA/方向可对应 descriptor。SWIOTLB、DMA mask、mapping count 和 payload校验是关键。

KASAN/lockdep/kmemleak 用于两种驱动的软件寿命错误，但不能检测外部设备 DMA 越界；IOMMU 更适合暴露后者。

## 六、错误恢复是否真正收敛

USB 反复插拔、autosuspend/resume、STALL/reset、在途 URB取消；PCIe FLR/hot reset/AER recovery、DMA timeout、Surprise Down。测试结束后都要检查请求/映射/引用计数归零。

使用 trace-cmd 给 driver state、IRQ、workqueue 加时间线，比散落 printk 更容易判断停止顺序。动态调试应只打开目标 module/file，避免日志改变时序。

## 七、dynamic_debug、tracepoint 和 sanitizer 解决不同问题

`dynamic_debug`按 module/file/function启用 `pr_debug()`，适合观察probe、PM、error path和状态机。USB可启用usbcore/HCD/class，PCIe可启用PCI core、AER、IOMMU和目标driver；高频路径应限范围。

Tracepoint/ftrace/trace-cmd建立时间线：USB URB submit/complete、IRQ/work/调度，PCIe queue submit/IRQ/poll/reset。工具只记录内核已埋点事件，自定义driver应增加request id、queue id和generation trace。

KASAN发现越界/UAF，lockdep发现锁顺序，kmemleak检查拔插后泄漏；IOMMU fault检测设备DMA越界。它们不能替代线级usbmon/PCIe analyzer，但能把软件所有权问题与协议问题分开。

## 八、Protocol analyzer 何时值得使用

USB analyzer可直接观察reset、setup、token/handshake、包间时序和电气错误；当usbmon显示Host提交但Device无/错响应时很有价值。Device固件与Host抓包应对时。

PCIe analyzer可观察LTSSM、TLP/DLLP、credit、replay、Completion和ordering；当AER/header log不足或怀疑硬件顺序时使用。`lspci -xxx`只是Configuration Space快照，不是TLP抓包。

分析仪证据仍需映射到driver request/descriptor。没有request id/address对照，看到TLP也难定位应用操作。

## 九、证据矩阵

- `usbmon + Wireshark`：USB transaction/URB，不能证明 Device 内部状态；
- `lsusb -v`：描述符，不能证明 class stream；
- `lspci -vv`：Link/config/BAR/Capability/AER，不能证明 payload DMA；
- IOMMU fault：非法 IOVA 访问，不能自动指出哪段应用逻辑提交；
- `/proc/interrupts`：IRQ 数，不能证明正确 queue 被回收；
- perf/ftrace：CPU 路径与延迟，不能测物理信号；
- protocol analyzer：线级 USB/TLP，成本高但跨越软件猜测。

## 十、小结

USB 调试以枚举、描述符、usbmon/Wireshark 和 class log 为主；PCIe 以 LTSSM、`lspci -vv`、BAR、MSI-X、ring、IOMMU fault 与 AER 为主。工具输出必须对应当前层次，不能用配置空间或设备节点替代数据通路证据。下一篇通过场景问答检验这种证据边界。
