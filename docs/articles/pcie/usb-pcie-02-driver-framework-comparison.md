---
title: "嵌入式知识体系 · USB/PCIe 驱动开发对比 #02 · 驱动框架对比"
description: "USB 和 PCIe 在 Linux 内核中都有成熟的总线驱动框架。它们表面上都包含 `id_table`、`probe()`、`remove/disconnect()` 这些生命周期概念，但底层资源模型完全不同。"
pubDate: "2026-08-18"
series: pcie
order: 14
tags: ["USB", "PCIe", "Linux Driver"]
draft: false
---
Linux USB 与 PCI 驱动都接入 driver core，也都有 probe/remove，但传给驱动的对象、可用资源和异步停止方式不同。把两套 API 强行一一对应容易误解；更有效的是比较对象生命周期。

## 被匹配的对象不同

USB interface driver 的 probe 得到 `struct usb_interface`，通过 `interface_to_usbdev()` 访问共享 `usb_device`，再从 altsetting/endpoint 构造 URB。复合设备的不同 interface 可以绑定不同驱动。

PCI driver 的 probe 得到 `struct pci_dev`，代表一个 PCI function。它直接包含 Configuration Space、BAR resource、IRQ capability 和 DMA device。Multifunction device 的每个 function 有独立 `pci_dev`。

```text
USB: usb_device -> usb_interface -> endpoint -> URB
PCI: pci_bus -> pci_dev -> BAR / IRQ / DMA ring
```

## probe 发布顺序体现总线资源

USB probe 的中心是 endpoint 与异步 request：解析 interface、分配 URB/buffer、建立私有对象、注册 class/char interface、开始接收。设备已由 usbcore 配置，driver 不负责 Host Controller enable。

PCI probe 要显式 `pci_enable_device()`、request BAR、设置 DMA mask、`pci_set_master()`、iomap、分配 ring、vector/IRQ、启动设备。硬件仍可能 bus master访问内存，因此 stop 顺序更严格。

两者共同原则是：内部状态完整后才发布用户入口，失败按反序回滚。

## URB 与 DMA descriptor 的所有权边界

USB driver `usb_submit_urb()` 后，URB/buffer 归 usbcore/HCD 异步使用，completion 或 kill 后才能复用。Host Controller决定事务调度。

PCI driver 把 DMA descriptor 交给 Endpoint，`dma_wmb()` 后写 doorbell；设备写 completion并 MSI-X，Host `dma_rmb()` 后回收。DMA API 管地址/cache，设备 queue协议管 ownership。

USB 的 anchor 与 PCIe request/ring table 都管理 in-flight 工作，但 anchor 由 USB core理解 URB；PCI ring 是设备专有 ABI，驱动必须自行定义 full、generation 和 reset。

## disconnect 与 remove 的硬件停止差异

USB 拔出时 usbcore/HCD 会让 URB 以 shutdown/cancel 完成，driver disconnect 仍要阻止重提、kill anchors、撤销节点并等待 kref。设备已经物理消失，通常无法再发总线事务。

PCIe remove 可能来自 unbind/hotplug，Endpoint 可能仍在 Link 上且 Bus Master Enable 打开。驱动必须先命令设备停止 DMA、mask IRQ、确认 quiescent，再清 bus master、释放 DMA/BAR。Surprise removal 时硬件无法响应，驱动仍要让软件 mapping/IRQ 收敛。

## 同步对象由回调上下文决定

USB completion 和 PCI hardirq 都不能睡眠，适合自旋锁、状态提交和 wake/work；probe/disconnect/remove 与 file operation 可用 mutex。两者都需要引用计数管理用户打开对象，但 PCI mmap/DMA pinned pages 往往增加更长寿命。

`usb_interface` 的 intfdata 与 `pci_dev` 的 drvdata只是找到私有对象，不自动保证对象还活着。kref/refcount、dead/disconnected 标志和停止异步工作仍需显式设计。

## Reference count 保护软件对象，不代表硬件仍可用

USB driver常用 `usb_get_dev()/usb_put_dev()` 保护 `usb_device`，对私有对象用 `kref`；interface disconnect后对象可因open file继续存在，但所有 I/O检查 disconnected。URB anchor负责在途请求，不等于用户引用。

PCIe driver的 `pci_dev` 由device core管理，私有对象仍需 reference count保护open/VMA/work。Remove后即使内存还在，BAR已解除、DMA/IRQ已停，file operation必须返回dead。VMA引用只能延长payload内存，不能延长已拔出的硬件。

Reference count解决“何时释放软件内存”，stop/kill/synchronize解决“硬件何时不再访问”，两者缺一不可。

## 错误回滚与 managed resource 的边界

USB probe失败反向释放endpoint buffer/URB、intfdata、注册节点和device引用；PCIe probe反向停止硬件、IRQ、DMA、BAR/region、master和enable。每个goto label只撤销已成功阶段。

`devm_*`/`pcim_*`减少机械释放，但不会自动让设备DMA quiescent；USB interface managed action同样不能阻止completion重提。Managed resource释放前仍要执行总线特定stop顺序。

错误注入应覆盖每个分配/注册阶段，确认没有残留sysfs节点、IRQ、URB、DMA mapping和reference。

## 电源管理和 reset 入口不同但目标相同

USB runtime PM 可能 autosuspend Device/interface、停止 URB并支持 remote wakeup；resume 后 endpoint/interface配置由 core/class协同。

PCI PM 保存 PCI state、设置 D-state，并在 resume/reset 后重建 BAR 内 queue/IRQ/DMA状态。FLR/AER recovery 可在 `pci_dev` 不消失时重置 function。

两者都应把 start/stop/reinitialize 抽成内部状态机供 probe、resume、reset共享，避免每个回调复制不同资源顺序。

## 用户接口和权限模型不能照搬

USB标准Class通常通过TTY、Block、Input、V4L2、ALSA子系统提供成熟权限/ABI；Vendor设备可用usbfs/libusb或自定义driver。用户不能直接控制HCD ring。

PCIe自定义设备常使用char/ioctl/mmap或VFIO。BAR/doorbell和DMA ring直接暴露会允许任意设备访问，必须限制offset、buffer ownership、IOMMU mapping和reset。VFIO以IOMMU group为安全边界。

对两种总线，ABI都要定义版本、timeout、取消、拔出/reset后返回值和兼容性；“mmap零拷贝”不能替代权限与生命周期设计。

## 代码阅读时从哪些入口进入

USB：先找 `struct usb_driver`、id table、probe/disconnect，再追 endpoint helper、URB completion、anchor 和 file operation。

PCIe：先找 `struct pci_driver`、probe/remove，再追 BAR register、DMA ring、MSI-X handler、timeout/reset 和用户接口。

只看注册结构体只能证明驱动“挂上总线”，数据路径和寿命要沿回调闭合。

## 小结

USB 驱动围绕 `usb_interface`、endpoint 和 URB，PCIe 驱动围绕 `pci_dev`、BAR、DMA 与 IRQ。两者共享 driver core 的 probe/remove 模式，却在硬件启用、异步所有权和拔出/停机上有不同责任。真正可迁移的能力是发布/回滚、引用计数和状态机思维，不是把一套 API 名称替换成另一套。
