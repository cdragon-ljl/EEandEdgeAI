---
title: "嵌入式知识体系 · USB/PCIe 驱动开发对比 #04 · 高频面试题与工程回答"
description: "USB 和 PCIe 是 Linux 驱动面试里很常见的两个方向。面试官通常不会只问概念，而是会围绕枚举、驱动匹配、传输、DMA、中断、IOMMU 和排查思路持续追问。"
pubDate: "2026-08-18"
series: pcie
order: 16
tags: ["USB", "PCIe", "Linux Driver"]
draft: false
---
USB/PCIe 面试真正考察的不是命令清单，而是能否从现象判断当前层次、指出内核对象和异步所有权，并给出可验证证据。下面的问题同时给出可靠推导和常见错误答案。

## USB 场景

### `lsusb` 能看到设备但没有 `/dev/ttyACM0`，先查什么？

设备级枚举已完成。先用 `lsusb -t` 和 interface modalias确认 CDC ACM interface、IAD/Union Descriptor 和 `cdc_acm` 是否绑定，再看 probe 日志。若绑定成功才进入 TTY 注册与 class control request。

错误答案是“换 USB 线”作为唯一结论。线材仍可能导致后续传输问题，但 VID/PID稳定出现说明至少 EP0 枚举已成功，调查应从 interface/class 证据开始。

### 为什么 USB interrupt endpoint 不等于 CPU 中断？

Interrupt transfer 由 Host 按 `bInterval` 周期调度 IN/OUT token，Device不能主动打断 CPU。Host Controller完成 transaction 后可能触发控制器 IRQ，HCD 再完成 URB。协议传输类型和 CPU IRQ 是两层。

错误答案是“设备有数据就触发 interrupt endpoint”。设备通常只能准备数据并对 IN token响应。

### disconnect 中为什么需要 `usb_kill_anchored_urbs()`？

URB 提交后由 usbcore/HCD异步拥有，completion 可能与 disconnect 并发。先阻止重提，再 kill anchor并等待完成，之后才能释放 buffer/私有对象。只调用 `usb_free_urb` 不会同步取消 HCD 请求。

证据链是 anchor 中请求、completion status、disconnected 标志和 kref，而不是在 disconnect 加固定 sleep。

### Bulk IN 返回短数据是错误吗？

不一定。短于请求长度的包可正常终止 bulk transfer，status 0、`actual_length < transfer_buffer_length`。只有上层协议要求固定长度或设置 `URB_SHORT_NOT_OK` 时按错误处理。

错误答案是循环补读直到请求长度；这可能跨越协议消息边界。

### Gadget 枚举失败但 `/sys/class/udc` 存在，下一步看什么？

UDC 已注册，继续查是否 bind UDC、pull-up/VBUS、EP0 setup、descriptor/configfs function 和 setup status。UDC存在不代表 composite已连接 Host。

## PCIe 场景

### `lspci` 看不到 Endpoint，驱动 id_table 有问题吗？

驱动匹配尚未发生。先查 power、PERST#、REFCLK、lane、LTSSM、RC Host bridge和 config access。LTSSM不到 L0 时修改 id_table 无效。

错误答案是手动 modprobe 驱动；没有 `pci_dev` 时 driver core没有匹配对象。

### BAR 有地址但 `readl()` 返回全 1，如何分层？

确认 sysfs resource/bridge window、RC outbound ATU、Endpoint BAR decode/inbound address translation、reset和 offset。全 1 可能是 Unsupported Request/Completer Abort或未实现寄存器。

证据包括 `lspci -vv`、resource、AER、Host controller/Endpoint ATU状态，而不是把 BAR 地址当普通 RAM用 devmem反复写。

### MSI-X vector 计数增长但任务不完成，说明什么？

通知路径已到 CPU，继续检查 handler 是否对应正确 queue、CQ producer/phase、`dma_rmb()`、completion id和 wake/poll。IRQ 数增长不证明 DMA payload 或所有权正确。

错误答案是继续调 affinity。Affinity影响性能，不会修复错误 CQ。

### 总 free 内存足够，为什么 `dma_alloc_coherent` 失败？

还受 DMA mask、coherent pool/CMA、连续性、IOMMU和 GFP context限制。先确认设备 mask 与请求 size/对齐，并查看 DMA/IOMMU/CMA日志。

普通 heap 总量不是 DMA 可达 coherent memory 的等价指标。

### IOMMU fault 应该直接关闭 IOMMU吗？

不应。记录 requester、IOVA、方向，与 descriptor DMA address/length和 mapping生命周期对应。常见原因是 unmap 后迟到 DMA、地址高位/长度错误或 reset未停机。

关闭 IOMMU 可能把 fault 变成静默内存破坏，只能作为受控对比。

## 跨总线设计问题

### USB URB 与 PCIe DMA descriptor 有什么共同点和差异？

共同点是异步所有权：提交后 buffer不能随意修改，完成/取消后才能回收。差异是 URB由 usbcore/HCD调度，PCIe descriptor ring由设备私有协议和 doorbell消费；USB Host控制 transaction，PCIe Endpoint可主动 DMA。

### 如何设计安全的用户态零拷贝？

先定义谁拥有 buffer、何时 sync/barrier、设备断开/reset后如何撤销、用户进程退出如何回收。USB常由内核 URB buffer与 mmap/DMABUF框架连接；PCIe可能 mmap payload pool或 pin user pages。两者都不应把控制 ring/任意 MMIO直接暴露给不可信用户。

错误答案是“mmap 就是零拷贝”。没有 ownership、DMA mapping和生命周期，mmap只是扩大故障面。

### 现场排查的通用证据链是什么？

先证明硬件/链路存在，再证明总线枚举对象存在，再证明驱动资源发布，再证明异步请求已提交，再证明完成/中断到达，最后检查应用协议。USB 对应 connect/EP0/interface/URB/class；PCIe 对应 LTSSM/config/BAR+IRQ/DMA ring/application。

跨层跳跃是最常见错误答案：设备节点存在不证明数据正确，IRQ计数不证明 completion正确，平均吞吐不证明 reset后资源收敛。

### `usb_submit_urb()` 成功后可以立刻复用 buffer 吗？

不能。成功表示URB已交usbcore/HCD异步拥有，buffer在completion或同步kill前必须有效且不被并发修改。Streaming DMA还可能由HCD映射。错误答案是“submit只复制指针所以函数返回就能改”；正因为只保存指针，生命周期更长。

证据是URB状态、anchor、completion和kill是否完成，不是调用栈已经返回。

### CherryUSB CDC 能枚举但 OUT 数据收不到，如何分层？

先看Host是否发bulk OUT、DCD是否配置endpoint/FIFO、IRQ是否调用 `usbd_event_ep_out_complete_handler()`、报告nbytes是否正确、应用是否重提 `usbd_ep_start_read()`，再查DMA cache invalidate。

错误答案是直接改CDC描述符；能配置并出现串口通常说明描述符/EP0主线已成功，数据问题更接近DCD和buffer ownership。

### 提高 MPS 一定提升 PCIe 吞吐吗？

不一定。大MPS降低header比例，但路径所有设备必须支持，还会占credit/buffer并影响公平性；瓶颈若是outstanding Read、内存或CPU则无效。应对照LnkSta、MPS/MRRS、TLP大小、credit和吞吐。

错误答案是用setpci把值改到设备上限；路径和系统策略不匹配可能导致错误。

### IOMMU fault 只在压力下出现，最可能看什么？

重点看ring wrap、descriptor length、高位地址、timeout/unmap后迟到DMA、reset generation和并发mapping回收。压力让所有权窗口和回绕出现，不代表IOMMU性能不足。

证据链是fault IOVA/requester/direction到具体request id和mapping生命周期。

### FLR 后为什么设备仍枚举但业务不工作？

FLR保留function在PCI拓扑中，但会清设备内部queue/DMA/IRQ状态。驱动必须stop、执行reset、恢复PCI state，重新写ring base/index、MSI-X映射和firmware状态，再允许提交。`lspci`可见只证明Configuration Space存在。

错误答案是重新probe才能恢复；成熟驱动应把init/stop复用于slot_reset/runtime resume。

### Ring full 时扩大队列是否就是 backpressure？

不是。扩大只增加缓冲时间。Backpressure要求提交入口阻塞/`-EAGAIN`、payload pool与CQ high watermark传回生产者，设备也在CQ不足时停止消费SQ。长期生产率过高最终仍必须限流。

### 如何在 USB 和 PCIe 之间选择控制与数据通路？

先看角色、拓扑、可插拔、Host生态、带宽/延迟、主动DMA和安全。USB适合标准Class/线缆外设/MCU Device，PCIe适合板内低延迟MMIO和多队列DMA。某些系统用USB做维护、PCIe做高速数据，但要统一固件版本/reset协议。

错误答案是只比较Gbps；软件生态、供电、隔离和恢复成本同样决定方案。

### 如何证明 error recovery 真正完成？

恢复后不仅设备重新出现，还要验证旧请求全部完成为错误、URB/DMA mapping/reference收敛、queue generation更新、IRQ/work无残留、新请求可运行且数据正确。USB做反复拔插/suspend，PCIe做FLR/AER/timeout。

证据链应有状态迁移和计数守恒，不是一条“reset success”日志。

## 小结

可靠的 USB/PCIe 面试回答必须给出对象、状态、调用上下文和证据链，并主动指出错误答案忽略的条件。USB 重点是 interface/endpoint/URB/Gadget/Class 与 disconnect；PCIe 重点是 Link/config/BAR/MSI-X/DMA/IOMMU/reset。真正可迁移的能力，是判断当前层次并沿所有权追到完成或回收。
