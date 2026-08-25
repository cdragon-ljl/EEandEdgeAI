---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #03 · BAR 与 MMIO"
description: "前面一讲我们已经看到了 PCIe 配置空间，也知道了系统如何识别设备。这一讲进入 PCIe 驱动里真正会天天打交道的东西：**BAR 和 MMIO**。"
pubDate: "2026-08-18"
series: pcie
order: 3
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe Endpoint 通过 BAR 声明“我需要多大的 CPU 可访问窗口”，系统枚举时为它分配地址，驱动再映射并使用 MMIO accessor。BAR 不是设备寄存器的物理地址常量，也不是一块可以随意 `memcpy` 的普通 RAM。

本篇从写 `0xffffffff` 的 sizing 机制出发，解释 32/64 位与 prefetchable 属性、Linux resource 管理、`pci_request_region()`、`pci_iomap()` 和 posted write 顺序。

## BAR 寄存器编码类型和地址属性

Memory BAR 低位编码 I/O/Memory、32/64 位和 prefetchable，地址位按大小对齐。64 位 BAR 使用相邻两个 dword 组合地址，并占用两个 BAR index。I/O BAR 使用独立 I/O space，在很多嵌入式平台并不常见。

Prefetchable 表示读取没有副作用且允许合并/预取，通常用于 frame buffer 或设备 RAM；控制/状态寄存器通常 non-prefetchable。错误标记会让 bridge window 和 CPU 映射属性不符合设备语义。

BAR 只描述 Host 地址窗口。Endpoint 内部还要把 BAR hit + offset 路由到寄存器、BRAM 或 DMA aperture；这个地址转换属于 Endpoint 设计。

## 写全 1 sizing 为什么能得到大小

枚举器保存 BAR 原值，写 `0xffffffff`，读回硬件实现的地址 mask，再恢复。未实现的低地址位读为 0，取反加一得到窗口大小。

例如 memory BAR 读回 mask `0xfffff000`，去掉属性位后表示最低 12 位不可编程，窗口大小为 4 KiB。64 位 BAR 要合并高低 dword 后计算。

运行中的驱动不应自己执行 sizing：写全 1 会暂时改变 BAR，可能破坏设备 decode。Linux PCI core 已完成 sizing，驱动读取 resource 即可。

## Linux resource 树保存分配结果

```c
resource_size_t start = pci_resource_start(pdev, 0);
resource_size_t len   = pci_resource_len(pdev, 0);
unsigned long flags   = pci_resource_flags(pdev, 0);
```

`start` 是 Host 物理资源地址，`len` 是窗口大小，flags 说明 I/O/Memory、prefetchable 等。`/sys/bus/pci/devices/BDF/resource` 显示同一信息。

Bridge memory/prefetchable window 必须覆盖下游 BAR，Host bridge outbound window 又必须把 CPU 地址转换为 PCIe address。任何一级缺失都会出现资源分配失败或 MMIO abort。

## request 再 iomap，先声明所有权再访问

```c
ret = pci_request_region(pdev, 0, "demo");
if (ret)
    return ret;

bar0 = pci_iomap(pdev, 0, 0);
if (!bar0) {
    pci_release_region(pdev, 0);
    return -ENOMEM;
}
```

`pci_request_region()` 在 resource tree 中声明驱动独占，防止其他驱动重复使用；`pci_iomap()` 建立适合 MMIO/I/O port 的内核访问映射。managed 版本可自动随 device 生命周期回收，但硬件停止顺序仍要由驱动保证。

第三个参数限制映射最大长度，0 表示整个 BAR。驱动仍应验证所需寄存器 offset + width 不超过 `pci_resource_len()`。

## MMIO 必须使用 accessor 并尊重寄存器语义

```c
u32 status = readl(bar0 + REG_STATUS);
writel(ctrl, bar0 + REG_CONTROL);
```

`readl/writel` 提供体系结构所需的访问宽度、endian 和 I/O ordering 语义。不要把 `__iomem` 强转成普通指针解引用；也不要对有副作用寄存器使用普通 `memcpy`。

PCIe Memory Write 是 posted。`writel()` 返回时，写可能仍在桥或链路中。若必须确认设备已经看到写入，可按设备规范读取安全的同一设备寄存器做 flush：

```c
writel(DO_RESET, bar0 + REG_CONTROL);
readl(bar0 + REG_STATUS); /* flush posted write when register is safe */
```

Read 的副作用、write-one-to-clear、doorbell、64 位寄存器拆分顺序由设备手册决定。通用 `readl` 不能替代设备级同步协议。

## CPU 地址、PCIe 地址和设备内部 offset 不一定相同

在 SoC RC 上，CPU 访问 `0x60000000` 可能经 Host controller outbound ATU 转成 PCIe address `0x00000000`，命中 Endpoint BAR0，再由 Endpoint 将 offset 0x1000 路由到寄存器。驱动看到的是 CPU resource start，设备 DMA 使用的则是 DMA API 返回地址，两者不要混用。

IOMMU 通常影响 Endpoint DMA 到内存的地址，不改变 CPU 对 BAR MMIO 的基本 resource API。Endpoint 自带 inbound/outbound ATU 时还会增加设备内部地址转换层。

## 释放前先停止设备产生访问

remove/error path 应先禁止设备队列、DMA 和中断，确保不再访问 BAR 相关状态，再 `pci_iounmap()`、`pci_release_region()`。先解除映射后再写 stop 寄存器显然无效；设备仍 DMA 时释放其他内存则更危险。

调试 MMIO 时核对：

```bash
lspci -s BDF -vv
cat /sys/bus/pci/devices/BDF/resource
cat /proc/iomem | grep -i pci
```

配置空间 BAR 有值但 resource 文件为 0/冲突，查枚举分配；resource 正常但首次 read abort，查 bridge/RC window 和 Endpoint decode；read 值固定全 1，可能是 Completion Unsupported Request、链路/Endpoint reset 或访问了未实现 offset。

## 小结

BAR 用属性位与 size mask声明窗口，PCI core 为其分配 Host resource，驱动通过 `pci_request_region` 获得所有权、`pci_iomap` 建立 `__iomem` 映射，再用 `readl/writel` 访问。Posted write、bridge/ATU 地址转换和设备寄存器副作用决定了 MMIO 不能当普通内存。下一篇把 BAR 放入完整 `pci_driver` probe/remove 与错误回滚。
