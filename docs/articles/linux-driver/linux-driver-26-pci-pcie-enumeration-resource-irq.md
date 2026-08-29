---
title: "嵌入式知识体系 · Linux 驱动开发实战 #26 · PCI/PCIe 枚举、资源、驱动模型与中断"
description: "从配置空间和 BAR 枚举出发，理解 pci_driver 的 probe、DMA、INTx、MSI/MSI-X 及 PCIe 的关系。"
pubDate: "2026-08-29"
series: linux-driver
order: 26
tags: ["Linux Driver", "PCI", "PCIe", "MSI"]
draft: false
---

platform device 需要固件描述地址，PCI 设备则有标准配置空间。host 枚举 bus/device/function，读取 vendor/device ID 和 BAR，分配资源后再与 pci_driver 匹配。

## 1. 配置空间让设备可以被发现

配置空间包含 vendor/device、class code、command/status、BAR 和 capability list。`lspci -nnvv` 展示这些字段，sysfs 为每个 BDF 创建目录。

```sh
lspci -nn
lspci -s 01:00.0 -vv
ls -l /sys/bus/pci/devices/0000:01:00.0
```

BDF 是总线位置，不是稳定产品身份；重构拓扑后可能改变。

## 2. pci_driver 通过 ID 表匹配

```c
static const struct pci_device_id demo_ids[] = {
    { PCI_DEVICE(0x1234, 0x5678) },
    { }
};
MODULE_DEVICE_TABLE(pci, demo_ids);

static struct pci_driver demo_driver = {
    .name = "demo-pci",
    .id_table = demo_ids,
    .probe = demo_probe,
    .remove = demo_remove,
};
module_pci_driver(demo_driver);
```

probe 先 `pcim_enable_device()`，设置 DMA mask，再申请/map BAR。`pci_resource_start/len/flags` 描述已分配资源，不能把 BAR 物理地址当普通 RAM。

## 3. BAR 提供 MMIO 或 I/O 空间

```c
ret = pcim_iomap_regions(pdev, BIT(0), "demo-pci");
bars = pcim_iomap_table(pdev);
regs = bars[0];
value = readl(regs + REG_STATUS);
```

MMIO 访问使用 `readl/writel`，并遵守寄存器 ordering。用户态 `resource0` 和 mmap 只适合受控调试或 UIO/VFIO 方案，普通驱动仍负责权限和生命周期。

## 4. DMA 仍使用通用 DMA API

PCIe 地址和 BAR 不改变上一篇 DMA 规则。驱动针对 `&pdev->dev` 建立 mapping，device 可通过 IOMMU/SWIOTLB 看到 DMA address。不要把 CPU physical 或 BAR 地址混为 DMA buffer。

## 5. INTx、MSI 与 MSI-X

INTx 是共享电平中断；MSI 用内存写触发中断；MSI-X 提供更多独立 vector。驱动用 `pci_alloc_irq_vectors()` 请求范围，再用 `pci_irq_vector()` 取得 Linux IRQ。

```c
nvec = pci_alloc_irq_vectors(pdev, 1, 8,
                             PCI_IRQ_MSIX | PCI_IRQ_MSI | PCI_IRQ_LEGACY);
irq = pci_irq_vector(pdev, 0);
```

remove 前先停止 DMA/中断源、同步 handler，再释放 vector 和 BAR。

## 6. PCI 与 PCIe 的边界

Linux PCI core 的枚举、driver、BAR 和 MSI API 同时服务 PCIe。PCIe 额外定义 link、TLP、AER、MPS/MRRS、ATU 等内容，站内 PCIe 专题会继续深入。

下一篇学习网络子系统，看看 PCIe 或 SoC MAC 驱动怎样把 DMA ring 中的帧交给 NAPI 和 net_device。

## 7. probe/remove 的完整顺序

一个 DMA 设备的 probe 通常按 enable → request regions → DMA mask → map BAR → allocate rings → request vectors/IRQ → start hardware → register user/subsystem interface 推进。remove 先让接口离线，再 stop queue/device、同步 IRQ、回收 DMA mapping/ring，最后释放 vector 和 PCI resources。

错误回滚不能只依赖 pcim：managed helper 会释放 BAR 等资源，但硬件仍可能 DMA。任何失败点都要先停止 bus mastering 或设备 engine，再释放被它访问的内存。

```sh
cat /sys/bus/pci/devices/0000:01:00.0/resource
cat /sys/bus/pci/devices/0000:01:00.0/numa_node
grep -i -E 'aer|iommu|msi' /var/log/kern.log 2>/dev/null
```

性能测试同时记录 link speed/width、MPS/MRRS、IRQ vector/CPU、DMA segment 和 IOMMU fault。吞吐低可能来自 link，也可能来自 ring、cache、interrupt moderation 或应用 buffer，不能只看 `lspci` 的 LnkSta。

## 8. 参考资料

- [PCI Bus](https://docs.kernel.org/PCI/index.html)
- [PCI driver API](https://docs.kernel.org/driver-api/pci/pci.html)
- [野火：PCI 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_pci_subsystem.html)
