---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #09 · PCIe 性能与稳定性优化"
description: "PCIe 驱动能跑起来只是第一步。真正的工程难点在于：高负载下是否稳定、吞吐是否达标、延迟是否可控、异常场景是否能恢复。"
pubDate: "2026-08-18"
series: pcie
order: 9
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe 性能不是 `Gen × lane` 一个数字。有效吞吐还受到编码、TLP header、Max Payload Size、Max Read Request、credit、outstanding 数、DMA ring、中断、CPU/NUMA 和内存带宽影响；稳定性则由 AER、timeout、reset 和长期资源一致性决定。

本篇给出可复用的测量模型，不虚构某块硬件的 benchmark，重点说明每个指标对应哪一层。

## 先确认实际链路，不用插槽规格代替

```bash
lspci -s BDF -vv | grep -E 'LnkCap|LnkSta'
```

`LnkCap` 是设备能力，`LnkSta` 是本次协商结果。目标 Gen4 x4 若实际为 Gen3 x1，任何 ring 调优都无法补回物理带宽。降速/降宽应检查拓扑、Switch、插槽 bifurcation、信号、equalization 和 AER。

理论 line rate 还要扣除编码与协议开销。小 TLP 的 header/LCRC 比例更高，所以大量几十字节请求远低于大 payload 的效率。

## Max_Payload_Size 决定写 TLP 的最大数据段

MPS 由链路路径上设备能力和系统配置共同决定，Device Control 中的当前值可能低于 Device Capability 上限。更大 MPS 减少 header 开销，但增加单包占用与错误重放成本，并要求整个路径支持。

设备 DMA write 4096 字节，在 MPS 256 时至少拆成多个 TLP。驱动通常不直接逐包控制，但硬件 queue/burst 设计与 MPS 会影响吞吐。不要随意通过 setpci 修改生产系统 MPS，错误配置可能破坏拓扑兼容性。

## Max_Read_Request 和 outstanding 决定读延迟隐藏能力

Memory Read Request 受 Max_Read_Request（MRRS）限制，Completion 还受 RC/bridge 的 completion boundary、MPS 和 credit 影响。单个同步 read 的往返延迟较高，高吞吐设备需要多个 outstanding tag 并行，让链路在等待某个 Completion 时继续工作。

MRRS 过小增加请求数量，过大可能占用 credit/内部 buffer 并影响公平性。设备设计应测量 outstanding 深度、Completion latency 和 tag 利用率，而不是只增大 MRRS。

## Ring 深度、批处理和 doorbell 决定软件能否喂满硬件

Ring 太浅会在一次调度延迟内耗尽，设备等待 producer；过深会增加排队延迟并掩盖拥塞。通过 producer/consumer high watermark 和 queue idle time选择深度。

批量填写 descriptor 后一次 `dma_wmb()` 和 doorbell，可减少 MMIO 与 barrier 开销。Completion 也可按 budget 批量回收。每个请求都写 doorbell、每个 completion 都触发 IRQ，会把 CPU 和 PCIe 小事务开销放大。

吞吐与延迟需要分别测量：中断合并/批量通常提高吞吐但增加尾延迟。至少报告平均、P99、queue depth 和 batch 参数，不能只给最高瞬时带宽。

## MSI-X、affinity 与 NUMA 要按队列布置

多队列设备让每个 queue 使用 MSI-X vector，并将 IRQ、处理线程和 buffer 绑到同一 NUMA node/CPU，可降低跨核 cache 和远端内存访问。

```bash
cat /proc/interrupts
cat /sys/bus/pci/devices/BDF/numa_node
numactl --hardware
```

irqbalance 可能重新分配 affinity，手工 hint 与系统策略要协调。所有 vector 都落到 CPU0 会形成单核瓶颈；盲目分散又会增加共享状态锁竞争。

## DMA mapping、IOMMU 和 cache 可能成为软件瓶颈

每个小 buffer 单独 map/unmap 会产生 IOMMU 页表和 IOTLB invalidation；长期 pool、scatter-gather 合并和合理大页可减少成本。SWIOTLB bounce 会额外复制，应通过日志确认。

零拷贝只有在所有权清晰时才成立。把用户页长期 pin 或 mmap coherent buffer可能降低复制，却增加内存回收、cache 和安全复杂度。性能优化必须同时记录 CPU 占用、内存带宽和 pinned memory。

## AER 与设备计数器是稳定性的一部分

Advanced Error Reporting（AER）区分 Correctable、Uncorrectable Non-Fatal 和 Fatal。Correctable Error 频率持续增长可能预示链路质量问题，即使业务尚未失败；Fatal/Surprise Down 需要 reset/recovery。

```bash
lspci -s BDF -vv | grep -A20 'Advanced Error'
dmesg | grep -i aer
```

设备驱动还应维护 submitted/completed/timeout/reset、IRQ、ring full、DMA mapping failure 和数据校验错误。压力结束后 producer/consumer、mapping 和 request 数必须收敛，不能只因数据还在流动就认为稳定。

## 一套可复现的 profiling 顺序

1. 固定硬件、固件、内核、CPU governor 和拓扑；
2. 记录 LnkSta、MPS、MRRS、NUMA 和 IOMMU；
3. 测量 payload size、queue depth、outstanding、batch、IRQ moderation；
4. 同时记录吞吐、P99 延迟、CPU、IRQ、内存带宽和错误计数；
5. 每次只改变一个参数；
6. 做长时间、冷热 reset、错误注入与并发退出测试。

`perf`、ftrace/trace-cmd 和设备 counters 用于定位 CPU/调度；协议 analyzer/硬件 counters 用于 TLP/credit/link。没有分层指标时，调参只能得到偶然结果。

## 小结

PCIe 性能由实际 Link、MPS/MRRS、TLP/credit、outstanding、ring、doorbell、MSI-X、NUMA、DMA/IOMMU 和内存系统共同决定。稳定性还必须观察 AER、timeout、reset 和资源收敛。下一篇将把这些指标放进故障证据链，从 PERST#/REFCLK 一路排到 IOMMU fault。
