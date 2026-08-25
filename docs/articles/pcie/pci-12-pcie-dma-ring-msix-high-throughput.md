---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #12 · DMA 环形队列与 MSI-X 高吞吐设计"
description: "PCIe 设备驱动的难点通常不在“能不能读一个 BAR 寄存器”，而在于如何让设备持续、高效、可恢复地搬运数据。网卡、采集卡、FPGA 和 AI 加速器普遍采用 **描述符环形队列 + DMA + MSI/MSI-X** 的组合。"
pubDate: "2026-08-18"
series: pcie
order: 12
tags: ["PCIe", "Linux Driver"]
draft: false
---
高吞吐 PCIe 设备不会让 CPU 为每个请求同步写一组寄存器。它使用 submission/completion ring：CPU 批量准备 descriptor、更新 producer 并写 doorbell，设备消费后写 completion、更新 consumer/phase 并触发 MSI-X。正确性来自明确所有权和内存顺序。

本篇把 ring、doorbell、MSI-X、多队列、背压和 reset 组合成一套可扩展数据路径。

## Submission 与 Completion 分开表达两个方向

Submission Queue（SQ）由 Host software 生产、Device 消费；Completion Queue（CQ）由 Device 生产、Host 消费。每个队列有固定 2 的幂长度，index 可通过 mask 回绕。

```c
struct sqe {
    __le64 addr;
    __le32 len;
    __le16 id;
    __le16 flags;
};

struct cqe {
    __le16 id;
    __le16 status;
    __le32 actual;
    u8 phase;
};
```

Ring memory 常用 `dma_alloc_coherent()`，payload 可用 streaming mapping。SQ/CQ 的 DMA base 和 size 在初始化时写入设备。

## producer、consumer 和 phase 区分 full/empty

对长度 N：SQ free 可由 `(consumer - producer - 1) & (N - 1)` 计算，保留一槽区分 full/empty；也可使用单调 32/64 位计数器。CQ 常用 phase bit：每绕一圈 phase 翻转，Host 只消费 phase 与期望一致的 cqe。

只保存低位 index 且不留空/phase，会在 producer == consumer 时无法区分空与满。软件和硬件必须使用同一公式和计数位宽。

```mermaid
flowchart LR
    FREE[Free SQ slot] -->|CPU fills| PREP[Prepared]
    PREP -->|dma_wmb + producer| DEV[Device owned]
    DEV -->|DMA and CQE| DONE[Completion ready]
    DONE -->|dma_rmb + consume| FREE
```

## doorbell 只宣布已经完成的 descriptor

CPU 写 payload、SQE 地址/长度/ID，执行 `dma_wmb()`，再提交 producer 并 `writel()` doorbell。若先敲 doorbell，设备可能读到旧或半写 descriptor。

Doorbell 是 posted MMIO write。通常不需要每次 readback，但设备 start/stop/reset 等要求确认时按寄存器规范 flush。批量 N 个 SQE 后一次 doorbell，可减少 MMIO TLP；batch 大小会在吞吐和延迟之间取舍。

Device 写 payload 和 CQE 后再更新 CQ producer/phase并触发 MSI-X。Host handler看到 cqe 后执行 `dma_rmb()` 再读取 actual/status/payload。

## MSI-X 应与队列一一或分组对应

理想情况下每个 queue pair 对应一个 MSI-X vector，handler 只访问本 queue 的 CQ，无需全局扫描。Vector affinity 与 queue worker/NUMA buffer 对齐，减少跨核访问。

Vector 少于 queue 时，可多个 queue 共享一个 vector并用 pending bitmap；管理/错误 vector 与数据 vector 分开。`pci_alloc_irq_vectors()` 返回的实际数量决定最终拓扑，驱动要动态调整。

中断合并按 completion 数或 timer 触发。高负载下 mask IRQ、budget poll CQ、处理完再 unmask，可避免每个 cqe 一次中断；低延迟模式使用较小 moderation。

## 背压必须从应用一路传到 Device

SQ 满时，驱动不能覆盖 Device-owned slot。阻塞提交者等待 completion、返回 `-EAGAIN` 或使用更高层 queue，策略要明确。Payload pool 耗尽、CQ 接近满也要停止 Device 取新任务或产生 flow-control。

Device 若继续生产 CQE 导致 CQ overflow，软件会丢失 completion和 buffer ownership。硬件应有 queue halt/error，Host 监控 high watermark 并及时 doorbell CQ head。

用户态生产速度超过设备时，深 ring 只会增加排队延迟。应暴露 in-flight、queue depth 和 dropped/backpressure counter。

## 多队列减少锁，但共享资源仍需设计

每 queue 独立 producer lock、ring 和 vector，数据路径无需全局锁。设备 reset、firmware command、buffer allocator 和用户 context 仍可能共享，需要清晰的 control-plane 锁与状态。

用户与内核共享 ring 时，必须定义谁写哪个字段、原子性、barrier 和恶意输入验证。更安全的基础实现由内核持 ring，用户通过 ioctl/io_uring-like command 提交。

## Timeout 和 reset 要处理 generation

请求 timeout 后先阻止新提交，mask vector，停止/abort Device queue，确认 DMA quiescent，再回收 mapping。Reset 重新初始化 ring 并增加 generation；旧 cqe 带旧 generation 或 id 时丢弃，不能完成新请求。

FLR/Hot reset 可能清 MSI-X table、BAR 内 queue register 和 DMA engine。恢复顺序重新 enable、map/IRQ（按框架语义）、写 base/size、clear ring、unmask/start。等待者统一收到可区分的 reset/error。

## 性能与正确性一起验收

测试 producer/consumer wrap、ring full、CQ overflow、乱序 completion、多个 queue、IRQ affinity、batch/moderation、用户退出、timeout、FLR 和 IOMMU fault。长压结束后：

```text
submitted = completed + failed + in_flight
all DMA mappings accounted
no CQ/SQ ownership mismatch
no AER/IOMMU errors unless injected
```

吞吐、P99 延迟、CPU、IRQ 和 reset recovery time一起报告。只测顺序发送一个 buffer 不能证明 ring 正确。

## 小结

高吞吐 PCIe 数据路径由 SQ/CQ ring、producer/consumer/phase、DMA ownership、`dma_wmb/rmb`、doorbell 和 MSI-X 共同组成。多队列扩展并行，背压保护 ring，generation/reset处理迟到 completion。至此 PCIe 主线从 Link、配置/BAR、中断、DMA/IOMMU走到了可恢复的高吞吐队列。
