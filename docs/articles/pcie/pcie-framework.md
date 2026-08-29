---
title: "PCIe 驱动开发实战 · Linux 6.12 系列框架"
description: "PCIe 协议、PCI Core、DMA/IRQ/IOMMU、PM/AER、Endpoint、高吞吐与系统调试的 18 篇学习顺序。"
pubDate: "2026-08-29"
series: pcie
order: 0
tags: ["PCIe", "Framework", "Linux 6.12"]
draft: true
---

本系列固定 Linux 6.12 LTS 基线，先建立拓扑、配置空间与 BAR 地址模型，再进入 PCI Core/Driver、IRQ/DMA/IOMMU、PM/AER/性能，最后覆盖 RC/EP、Endpoint Framework、高吞吐和系统化调试。

| 阶段 | 文章 |
| --- | --- |
| 协议与资源 | 01 拓扑/Link/TLP；02 枚举/配置；03 BAR/ATU/MMIO |
| PCI Core | 04 `pci_bus/pci_dev/pci_ops`；05 Driver 生命周期；06 PCI Explorer |
| 中断与 DMA | 07 INTx/MSI/MSI-X；08 DMA API；09 Descriptor Ring |
| 系统机制 | 10 IOMMU/SVA；11 PM/ASPM；12 AER/Reset；13 性能 |
| 真实数据路径 | 14 `rtw88` PCI Glue、IRQ 与 DMA Ring 局部源码案例 |
| Endpoint 与产品设计 | 15 RC/EP Bring-up；16 Endpoint Framework；17 Multi-queue；18 系统调试 |

资料优先级为 PCI-SIG 规范、Linux 6.12 文档与源码、公开硬件手册。

野火资料用于参考教学层次和实验组织，正文、图示、示例协议与源码均重新编写。
