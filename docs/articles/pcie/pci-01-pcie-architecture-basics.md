---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #01 · PCIe 架构与基础概念"
description: "USB 讲完后，我们转到另一条在芯片软件、高速外设和加速器里非常重要的总线：**PCIe**。"
pubDate: "2026-08-18"
series: pcie
order: 1
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe 驱动中的配置空间、BAR、中断和 DMA 都建立在链路已经进入可传输状态之上。理解 PCIe 不能从 `pci_register_driver()` 开始：先要知道 Root Complex、Switch 和 Endpoint 如何形成拓扑，LTSSM 如何建立 Link，Transaction Layer 又如何用 TLP 表达一次内存访问。

本篇建立后续文章共同使用的硬件与协议模型，并把这些概念映射到 Linux 能看到的链路能力和设备对象。

## Root Complex、Switch 与 Endpoint 组成点对点拓扑

Root Complex（RC）连接 CPU/内存系统与 PCIe fabric，是枚举和资源分配的起点。Endpoint（EP）是网卡、NVMe、FPGA 或加速器。Switch 有一个上游 port 和多个下游 port，每个 port 都是一条独立 Link。

PCIe 不是所有设备共享电气总线。每条 Link 由若干 lane 组成，每个 lane 都有独立 TX/RX 差分对并全双工工作。x1/x4/x8/x16 表示协商后的 lane 数；实际宽度和速率取两端及链路质量共同支持的值，不由插槽外观单独决定。

```mermaid
flowchart TB
    CPU[CPU and Memory] --> RC[Root Complex]
    RC --> EP0[NVMe Endpoint]
    RC --> SW[PCIe Switch]
    SW --> EP1[Network Endpoint]
    SW --> EP2[FPGA Endpoint]
```

Bridge/port 将总线号范围隔开。Linux 枚举得到的 domain:bus:device.function（BDF）是拓扑位置，不是设备永久身份；热插拔或固件资源变化可能改变 BDF。

## Lane 速率、编码和有效带宽要分开计算

Gen1/Gen2 使用 8b/10b 编码，2.5/5.0 GT/s 每 10 bit只有 8 bit有效；Gen3 起使用 128b/130b，速率依次为 8/16/32 GT/s 等。单 lane 单方向 raw payload上限还要扣除 TLP header、LCRC、DLLP、SKP和 flow-control空隙。

例如大量 16 字节 Memory Write使用 3DW/4DW header时，协议开销比例远高于 256/512 字节 payload。链路 x4 不代表单请求延迟变成四分之一，它提高的是并行符号吞吐。性能报告应同时写实际 `LnkSta` speed/width、MPS、请求大小和方向。

Lane bonding由 Physical Layer完成，上层 TLP不感知具体 lane。链路可因训练问题从 x4 降到 x2/x1继续工作，所以“设备枚举成功”不能替代宽度验证。

## 三层协议各自解决不同可靠性问题

Transaction Layer 把 CPU/设备请求编码为 TLP（Transaction Layer Packet），包括 Memory Read/Write、Configuration Read/Write、Completion 和 Message。请求头包含 address、length、Requester ID、tag、attribute 等，读请求依赖 Completion 返回数据，posted Memory Write 通常没有 Completion。

Data Link Layer 给相邻链路上的 TLP 增加 sequence number 与 LCRC，使用 ACK/NAK 和 replay buffer 保证一跳可靠传输；DLLP 还传递 flow-control credit。它不理解某个 BAR 寄存器的业务含义。

Physical Layer 负责 lane、编码、串并转换、均衡、训练和电气状态。链路降速/降宽发生在这里，但最终会影响 Transaction Layer 可用带宽。

这三层不能互相替代。AER 报告的 malformed TLP 属于协议/事务问题，Replay Timer Timeout 属于链路可靠性，Receiver Error 更接近物理层。排错时应根据错误类型选择证据。

## TLP 把 MMIO、配置空间和 Completion 统一成事务

CPU 对 BAR 映射地址执行 `writel()`，Root Complex 生成 Memory Write TLP；设备 DMA 读 Host 内存时发出 Memory Read Request，RC/内存系统返回一个或多个 Completion with Data；配置枚举则使用 Configuration TLP。

Memory Read 是 non-posted 请求，需要 tag 匹配 Completion。设备可同时发出多个 outstanding request，吞吐受 tag、credit、Max Read Request Size 和 Completion 延迟影响。Memory Write 是 posted，请求离开发送方并不等于目标寄存器副作用已经完成；驱动需要时通过 readback 或规范定义的同步点确认。

TLP payload 还受到 Max Payload Size（MPS）限制，大请求可能拆包。链路速率只是 raw capability，编码开销、TLP/DLLP header、credit、包大小和流控共同决定有效吞吐。

### TLP header、tag 与 Completion 如何配对

3DW header用于 32 位地址，4DW用于 64 位地址。Memory Request包含 requester ID、tag、first/last byte enable、length和 attribute。Non-posted Read保存 tag等待 Completion；Completion携带 completer ID、status、byte count、lower address和原 tag。

同一 requester可用多个 tag保持 outstanding Read。Tag/credit耗尽时即使 lane空闲也不能继续发。Completion可能按 MPS/RCB拆分，接收端要按 byte count/lower address重组，而不能假设一个 Read只返回一个 TLP。

Posted Write没有 Completion，错误通过 AER或设备协议间接体现。需要确认 MMIO side effect时使用同一设备的安全 readback或规范定义的 flush，而不是等待不存在的 write completion。

### DLLP credit 与 replay只保证一跳传输

Data Link Layer为 TLP加 sequence/LCRC，接收端 ACK/NAK，发送端在 replay buffer保留未确认 TLP。Replay Timer/rollover异常说明链路可靠性问题，但 ACK只证明下一跳收到，不证明目标设备业务已经处理。

Credit分为 Posted/Non-Posted/Completion 的 Header/Data（PH/PD、NPH/NPD、CplH/CplD）。接收 buffer不足时发送方停发相应类型，其他类型可能继续。设备 DMA读吞吐受 NPH/tag和 Cpl credit共同限制。

## LTSSM 决定链路何时能传 TLP

Link Training and Status State Machine（LTSSM）从 Detect 开始，经过 Polling、Configuration 协商 lane/速率，进入 L0 后才能正常传输。Recovery 用于重新训练或速率变化；Disabled、Hot Reset、Loopback 等状态处理特殊控制。

```text
Detect -> Polling -> Configuration -> L0
                     ^               |
                     +--- Recovery <-+
```

PERST# 释放、REFCLK 稳定、lane 极性/映射、receiver detect、equalization 任一异常都可能让 LTSSM 卡在前置状态。此时 `lspci` 看不到 Endpoint，Linux device driver 没有执行机会。

设备已枚举但 `LnkSta` 显示低于目标速率/宽度，说明 LTSSM 成功进入 L0 但协商降级。使用 `lspci -s BDF -vv` 对照 `LnkCap` 与 `LnkSta`，再结合控制器/Endpoint LTSSM debug register、AER 和信号测试定位。

## Credit 流控和顺序规则影响驱动可见行为

接收端为 posted、non-posted、completion 的 header/data buffer 宣告 credit，发送端 credit 不足时必须停发。队列设计若产生大量小读请求，可能受 non-posted tag/credit 限制，而不是 PCIe lane 带宽。

PCIe 允许一定程度的事务重排，Relaxed Ordering、No Snoop 和 ID-based ordering 等 attribute 会改变约束。驱动在 descriptor ready、doorbell 和 completion 之间仍要使用 DMA API 与 memory barrier，不能把“PCIe 可靠传输”误解为 CPU 内存操作天然有序。

### Ordering attribute 与软件 barrier 是两套约束

默认 PCIe ordering约束同一 traffic class/requester的事务，但 Relaxed Ordering、ID-based Ordering、No Snoop会改变规则。它们不等于 CPU memory model，也不替代 DMA API barrier。

CPU先写 descriptor普通内存，再写 BAR doorbell，驱动需要 `dma_wmb()` 和正确 MMIO accessor；设备先写 payload/CQE再 MSI，也需硬件保证顺序，Host读取时用 `dma_rmb()`。链路可靠与内存可见性必须同时成立。

ASPM L0s/L1、L1 Substates降低功耗但增加唤醒延迟，对 REFCLK/CLKREQ#和平台固件有要求。低负载偶发 timeout、Recovery增加时，应对比关闭 ASPM而不是把其当永久修复。

## Linux 看到的是已经训练好的设备树

固件/Host bridge 驱动先让 RC 工作并提供 ECAM/config access。PCI core 从 root bus 扫描，创建 `pci_bus`、`pci_dev` 和 bridge 层次。普通 Endpoint driver 接到 `probe()` 时，Link 已建立、配置空间可读、BAR 资源通常已分配。

```bash
lspci -tv
lspci -s 0000:01:00.0 -vv
```

树形输出对应 RC/bridge/Endpoint 拓扑，详细输出中的 `LnkCap/LnkSta`、DevCap/DevCtl、AER/MSI capability 是协议状态在 Linux 的入口。没有设备时先查 Host bridge、PERST#/REFCLK/LTSSM，不要先检查 `pci_device_id`。

## 小结

PCIe 是由 RC、Switch、Endpoint 和点对点 Link 组成的分层互连。LTSSM 让链路进入 L0，Physical/Data Link/Transaction 三层分别处理电气训练、相邻链路可靠性和端到端 TLP 事务。MMIO、配置访问与 DMA 都是不同 TLP 路径。下一篇将从 Linux 扫描 root bus 开始，解释 BDF、配置空间、bridge recursion 和 Capability。
