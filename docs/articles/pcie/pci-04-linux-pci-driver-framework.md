---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #04 · Linux PCI 驱动框架"
description: "前面几讲我们已经把 PCIe 的架构、配置空间和 BAR 讲过了。这一讲正式进入 Linux PCI 驱动的核心框架。"
pubDate: "2026-08-18"
series: pcie
order: 4
tags: ["PCIe", "Linux Driver"]
draft: false
---
Linux PCI driver 的 probe 入口看似简单，但真正正确性来自资源启用顺序和反向回滚。设备 decode、DMA mask、bus master、BAR、IRQ、队列和用户接口之间有明确依赖；任何一步失败都不能留下仍会 DMA 或中断的半初始化硬件。

本篇用一个具备 BAR、DMA 和 IRQ 的 Endpoint 说明 `struct pci_driver` 生命周期，并解释 managed API、remove、PM 与 reset 的边界。

## `struct pci_driver` 连接 ID 匹配与生命周期

```c
static const struct pci_device_id demo_ids[] = {
    { PCI_DEVICE(0x1234, 0x5678) },
    { }
};
MODULE_DEVICE_TABLE(pci, demo_ids);

static struct pci_driver demo_driver = {
    .name     = "demo_pci",
    .id_table = demo_ids,
    .probe    = demo_probe,
    .remove   = demo_remove,
};
module_pci_driver(demo_driver);
```

注册后 PCI core 对已枚举 `pci_dev` 匹配 VID/DID/class。probe 发生时配置空间可读、resource 已存在，但设备未必 enabled、bus mastering 未开，驱动私有队列也尚未建立。

`pci_set_drvdata()` 将私有对象绑定 `pci_dev`。发布字符设备/netdev 等用户入口应放在所有底层资源可用之后。

## probe 按依赖顺序启用设备

典型顺序如下：

1. `pci_enable_device()` 打开 MMIO/I/O decode；
2. `pci_request_regions()` 声明 BAR 所有权；
3. `dma_set_mask_and_coherent()` 协商 streaming/coherent DMA 地址宽度；
4. `pci_set_master()` 打开 Bus Master Enable；
5. `pci_iomap()` 映射 BAR并识别硬件版本/能力；
6. 分配 DMA ring/buffer；
7. `pci_alloc_irq_vectors()` 和 request_irq；
8. 复位/初始化硬件，写 descriptor base，启动队列；
9. 注册用户或网络/块设备接口。

DMA mask 应在任何 DMA allocation 前设置。设备只支持 32 位 DMA 而平台内存位于 4 GiB 以上时，DMA API 才能选择可达内存、IOMMU 或 bounce；直接把物理地址截断会静默破坏内存。

`pci_set_master()` 不会创建 DMA 映射，只允许设备发起 Memory Request。应在 descriptor 地址有效后、启动硬件前打开；错误回滚停止硬件后可 `pci_clear_master()`。

## 一个可审计的 probe 骨架

```c
static int demo_probe(struct pci_dev *pdev,
                      const struct pci_device_id *id)
{
    struct demo *dev;
    int ret;

    ret = pci_enable_device(pdev);
    if (ret)
        return ret;

    ret = pci_request_regions(pdev, "demo_pci");
    if (ret)
        goto err_disable;

    ret = dma_set_mask_and_coherent(&pdev->dev, DMA_BIT_MASK(64));
    if (ret)
        ret = dma_set_mask_and_coherent(&pdev->dev, DMA_BIT_MASK(32));
    if (ret)
        goto err_regions;

    pci_set_master(pdev);
    /* allocate object, map BAR, allocate rings, IRQ, start hardware */
    return 0;

err_regions:
    pci_release_regions(pdev);
err_disable:
    pci_disable_device(pdev);
    return ret;
}
```

完整驱动应为每个后续阶段设置明确 label，且 label 只撤销已经完成的步骤。把所有错误跳到同一个 `kfree` 会遗漏 IRQ、DMA、BAR 或 device enable。

### 完整错误回滚要覆盖 IRQ、ring 和硬件启动

Probe后半段常见顺序是 alloc ring、`pci_alloc_irq_vectors()`、request IRQ、program base、start/unmask。每一步都应有对应 label：启动失败先 mask/stop，free IRQ/vector，free DMA，iounmap，clear master，release regions，disable device。

IRQ在 request成功后可能立即到达，所以软件 queue、lock和私有指针必须先初始化，设备中断源保持 mask到最后。反向释放时先 mask并 `synchronize_irq()`，再释放 handler和ring，避免早到/迟到中断访问半初始化内存。

`pci_set_drvdata()` 只保存指针，不增加自定义对象 reference count。用户 open、mmap、work和error recovery并发时仍需 dead状态、refcount和完成同步。

## Managed API 能减少释放代码，但不能决定停机顺序

`pcim_enable_device()`、`pcim_iomap_regions()`、`devm_kzalloc()`、`devm_request_irq()` 等可以在 device detach 时自动释放资源。它们适合缩短机械回滚，但不会替你停止设备 DMA、mask 中断或等待 workqueue。

remove 仍应先撤销用户入口，停止提交，mask 设备中断，停止 DMA engine，`synchronize_irq()`/cancel work，再释放 ring。Managed cleanup 随后解除 IRQ/map/memory，顺序必须与硬件状态兼容。

## remove、热插拔与用户引用并发

PCIe 热插拔、AER recovery、驱动 unbind 都可能触发 remove。用户仍 mmap/read/poll 时，私有对象不能立即释放。与 USB 类似，需要 disconnected/dead 状态、引用计数和 waitqueue 唤醒；不同之处是 PCIe 设备还可能继续 bus-master DMA，因此必须先在硬件层停机并清 bus master。

BAR mmap 给用户后，remove 需要阻止新的 fault/access；生产驱动通常借助 subsystem 提供的生命周期或自建 VMA 引用。仅删除 `/dev` 节点不能撤销已经建立的映射。

## 中断和队列初始化要避免早到事件

request_irq 后 IRQ 可能立即到达。设备中断源应保持 mask，直到 handler 所需锁、ring 和状态全部初始化。启动顺序通常是 clear pending、request vectors/IRQ、初始化软件队列和 descriptor、写硬件地址、最后 unmask/start。

错误回滚则先 mask/stop，再 free_irq 和 DMA。若 free ring 在前，晚到中断会读取已释放 descriptor。

## PM、reset 与 AER 复用同一资源状态机

Suspend/resume 需要保存/恢复 PCI state、停止队列、设置电源状态并重新初始化硬件。Function Level Reset、Secondary Bus Reset 或 AER recovery 可能清 BAR 内寄存器，但 `pci_dev` 和驱动对象仍存在。

成熟驱动应把“停止硬件、初始化硬件、恢复队列”拆成可重入内部函数，让 probe、resume、reset/error recovery 共享，而不是在每个回调复制不同顺序。

官方 PCI 驱动 API 见 [PCI Support Library](https://docs.kernel.org/driver-api/pci/pci.html)。调试 probe 失败时，除 dmesg 外应检查 resource、enable count、DMA mask、MSI capability 和 driver symlink，定位最后一个成功阶段。

### runtime PM、system sleep 与 reset 的状态差异

Runtime PM处理设备空闲但仍绑定：`pm_runtime_get_sync()`/put 控制 active引用，runtime_suspend停止 queue/IRQ并进入 D-state，runtime_resume恢复 PCI state和设备内部寄存器。System suspend还要协调冻结用户任务、wake capability和平台电源。

FLR只重置 function，Secondary Bus Reset影响桥下多个设备，Hot Reset影响链路。Reset可能清 DMA engine、MSI-X table和BAR内部配置，但 `pci_dev`对象仍存在。驱动应复用统一 stop/init函数重建 queue，而不是只重新写一个 control bit。

AER通过 `struct pci_error_handlers` 的 `error_detected()`、`slot_reset()`、`resume()` 协商恢复。`error_detected()` 停止 I/O并返回恢复能力，slot_reset重新初始化硬件，resume恢复提交。不能在 AER callback与普通 remove同时重复释放资源。

## 小结

Linux `pci_driver` 的关键不在注册宏，而在 probe/remove 的依赖顺序：enable、regions、DMA mask、bus master、BAR、ring、IRQ、硬件和用户入口逐层发布，失败与 remove 反向撤销。Managed API 只能管理资源释放，不能替代硬件停机。下一篇将深入 INTx、MSI 和 MSI-X，解释 IRQ vector 如何与队列和 CPU affinity 对应。
