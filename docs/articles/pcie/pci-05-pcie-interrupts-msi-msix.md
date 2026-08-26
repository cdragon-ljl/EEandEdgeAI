---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #05 · PCIe 中断：INTx、MSI 与 MSI-X"
description: "PCIe 设备要想高效地通知主机，离不开中断机制。对于驱动开发来说，中断不是附属功能，而是设备和主机同步状态、完成任务、提交新工作的重要通道。"
pubDate: "2026-08-18"
series: pcie
order: 5
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe 设备通常用中断通知 DMA 完成、队列事件和错误。INTx、MSI、MSI-X 最终都进入 Linux IRQ 子系统，但硬件语义、共享方式、mask 能力和队列扩展完全不同。驱动若只会 `request_irq()`，仍可能遭遇共享中断风暴、vector 分配降级或数据尚未可见。

本篇从设备发出通知的方式开始，沿 `pci_alloc_irq_vectors()` 到 handler、affinity 和中断丢失排查。

## INTx 是需要设备撤销的共享电平事件

传统 INTx 在 PCIe 中以 Message TLP 模拟引脚 assert/deassert，仍保留电平和共享语义。多个设备可以共享同一 Linux IRQ，handler 必须读取本设备 status，若没有 pending 返回 `IRQ_NONE`。

设备 handler 要先确认并清除/ack 本设备中断源，使 INTx deassert。只清 Host IRQ controller 而不清设备 status，会立即再次进入中断形成 storm。读取 status 还要遵守设备的 write-one-to-clear 或 read-clear 语义。

INTx 兼容性好，但共享、单 vector 和电平处理不适合多队列高吞吐设计。

## MSI 是设备发出的一次 Memory Write

MSI Capability 由系统配置 message address/data。设备触发时发送 Memory Write TLP，Root Complex 将其转换为 CPU interrupt。没有共享物理线，也不存在传统 deassert；设备仍需在自己的 status/queue 中记录待处理工作。

MSI 可以支持多个 message，但数量和对齐受 capability 约束。Linux vector 分配可能少于设备最大值，驱动必须按实际返回值配置硬件，不能假设请求 8 就一定得到 8。

设备写 completion 数据和 MSI 的先后仍要符合协议/设备设计。Host handler 收到中断时 descriptor/completion 必须已经对 DMA 可见；设备端硬件需要保证写数据先于 MSI，驱动端还要用 DMA barrier 正确读取 ownership。

### MSI Capability 中的 message 与 mask

系统在 MSI Capability中写 Message Address/Data，设备触发时发一条 posted Memory Write TLP。64-bit capable设备有高地址寄存器；per-vector masking是否存在由 capability bit决定。Multiple Message Capable/Enable编码支持与实际启用数量，通常要求 2 的幂。

MSI没有电平 deassert，但设备自己的 completion/status仍需消费和清除。若同一 vector聚合多个原因，handler循环读取 pending bitmap直到稳定，避免新事件落在 ack窗口。

设备写 payload/CQE 必须先于 MSI对 Host可见。PCIe ordering与设备实现要保证这一点，Host handler读取 DMA completion前执行 `dma_rmb()`。否则可能出现 IRQ先到、CQE仍旧的“伪丢中断”。

## MSI-X 用 BAR 中的表把 vector 分开配置

MSI-X Capability 指向 MSI-X Table 与 Pending Bit Array（PBA）所在 BAR/offset。每个 table entry 有 message address、data 和 vector control，可独立 mask。PBA 记录被 mask 时到达的 pending vector。

设备常让每个 RX/TX queue 或 completion queue 对应一个 MSI-X vector，再为管理/错误保留独立 vector。这样 handler 只服务关联队列，并可设置不同 CPU affinity。

Table 是设备 BAR 资源的一部分，不应被普通寄存器映射代码误覆盖。Linux PCI/MSI core 负责配置 message，驱动只申请 vector 并将队列映射到返回的 Linux IRQ。

### MSI-X Table 和 PBA 是设备内存结构

每个 MSI-X Table entry含 Message Address、Message Data和 Vector Control Mask bit；Capability给出 table与 Pending Bit Array（PBA）的 BIR/offset，它们位于某个 BAR。Function Mask可一次屏蔽全部 vector。

Vector被 mask时事件应在 PBA保留 pending，unmask后触发；table写入和设备内部 queue-vector映射必须同步。驱动不直接随意改 table内容，PCI/MSI core负责配置；设备固件/FPGA要正确实现 BIR、大小、mask与pending。

多队列常将 RX/TX/management/error分配不同 vector。实际 `pci_alloc_irq_vectors()` 返回少于请求时，驱动要重建 queue-vector映射，而不是假设 table全部启用。

## Linux 统一 vector 申请并允许降级

```c
int nvec = pci_alloc_irq_vectors(pdev, 1, wanted,
        PCI_IRQ_MSIX | PCI_IRQ_MSI | PCI_IRQ_LEGACY);
if (nvec < 0)
    return nvec;

for (i = 0; i < nvec; i++) {
    int irq = pci_irq_vector(pdev, i);
    ret = request_irq(irq, demo_irq, 0, "demo", &dev->q[i]);
    if (ret)
        goto err_irq;
}
```

返回值是实际 vector 数。只得到 1 个时，驱动需要让多个 queue 共享 handler 或减少 queue；不能继续访问不存在的 `pci_irq_vector(pdev, 3)`。

释放时先 mask/停止设备产生中断，`synchronize_irq()`，再 free_irq，最后 `pci_free_irq_vectors()`。先释放 vector 后设备继续 MSI，可能产生 stray interrupt 或触发未知目标。

Managed API `pci_alloc_irq_vectors_affinity()` 可按 pre/post vector 与 queue 数给出 affinity 方案。驱动也可用 `irq_set_affinity_hint()` 提示目标 CPU，但需在 remove 时清除；新设计优先使用 IRQ affinity descriptor/managed affinity，避免与用户 irqbalance 策略冲突。

### Threaded IRQ、poll budget 与 interrupt moderation

需要睡眠或较重控制处理时可用 `request_threaded_irq()`：top half确认来源、mask设备并返回 `IRQ_WAKE_THREAD`，thread handler处理后 unmask。高吞吐 queue更常借鉴 NAPI：IRQ只关闭通知，poll按 budget批量消费 CQ，清空后重新打开。

Interrupt moderation按 completion计数或时间聚合。阈值大降低 IRQ/CPU开销但增加尾延迟；阈值小改善延迟但可能形成 storm。设备/驱动应暴露 packet/completion per interrupt、moderation timer和P99延迟一起调优。

Affinity按 queue、worker和NUMA内存布置。`pci_alloc_irq_vectors_affinity()` 可生成 managed affinity；`irq_set_affinity_hint()` 只是提示且 remove时要清除，不能与 irqbalance策略互相覆盖。

## Handler、threaded IRQ 与轮询之间如何分工

硬中断 handler 应读取/ack 原因、屏蔽需要延后处理的 queue，并安排 NAPI、tasklet、work 或 threaded IRQ。大量 completion 不应在 hardirq 中逐个进行复杂用户通知。

网络驱动常在中断后关闭 queue IRQ，用 NAPI 轮询一批 descriptor，再重新 unmask；NVMe/存储则按 completion queue 批量回收。中断合并通过计数/时间阈值降低 IRQ 率，但会增加尾延迟。

## 中断“丢失”要区分设备、PCIe、IRQ 和软件队列

```bash
lspci -s BDF -vv | grep -A5 -E 'MSI|MSI-X'
cat /proc/interrupts
cat /sys/bus/pci/devices/BDF/msi_irqs/* 2>/dev/null
```

Capability Disabled 表示设备没有启用相应模式；msi_irqs 存在但计数不涨，检查设备 vector table/program、mask 与硬件 event；计数涨但业务不动，检查 handler status、descriptor ownership 和 wakeup；计数异常高，检查中断源未清、empty queue 仍触发或 moderation。

AER Unsupported Request/Completer Abort 可能说明 MSI write 地址被设备/平台错误处理，IOMMU interrupt remapping 配置也会影响虚拟化场景。不要直接轮询替代中断掩盖根因。

## 小结

INTx 是共享电平事件，需要设备 deassert；MSI 用 Memory Write 触发；MSI-X 通过 BAR table 提供大量独立可 mask vector。Linux 用 `pci_alloc_irq_vectors` 统一申请并可能降级，`pci_irq_vector` 映射实际 IRQ，affinity 与队列设计共同决定扩展性。下一篇进入 DMA，解释中断到来前 descriptor 和数据如何在 CPU 与设备之间交接所有权。
