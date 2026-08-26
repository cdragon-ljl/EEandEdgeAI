---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #12 · DMA 环形队列与 MSI-X 高吞吐设计"
description: "PCIe 设备驱动的难点通常不在“能不能读一个 BAR 寄存器”，而在于如何让设备持续、高效、可恢复地搬运数据。网卡、采集卡、FPGA 和 AI 加速器普遍采用 **描述符环形队列 + DMA + MSI/MSI-X** 的组合。"
pubDate: "2026-08-18"
series: pcie
order: 12
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe 设备驱动的难点通常不在“能不能读一个 BAR 寄存器”，而在于如何让设备持续、高效、可恢复地搬运数据。网卡、采集卡、FPGA 和 AI 加速器普遍采用 **描述符环形队列 + DMA + MSI/MSI-X** 的组合。

这一篇从一个抽象的 PCIe Endpoint 数据通路出发，讲清楚缓冲区所有权、描述符、doorbell、completion、中断和内存屏障之间的关系，并给出 Linux 驱动中的关键代码骨架。代码用于说明结构，具体寄存器布局必须以设备硬件 spec 为准。

## 一、先看完整数据通路

以设备向主机发送数据为例：

```mermaid
flowchart LR
    A[设备产生数据] --> B[Endpoint DMA 写入主机缓冲区]
    B --> C[写入 completion 描述符]
    C --> D[MSI-X 通知 CPU]
    D --> E[中断处理或 NAPI poll]
    E --> F[回收描述符并交给上层]
    F --> G[补充空闲缓冲区]
```

主机向设备发送数据时方向相反：

```mermaid
flowchart LR
    A[上层提交请求] --> B[填充 TX 描述符]
    B --> C[dma_wmb 保证描述符可见]
    C --> D[写 doorbell MMIO]
    D --> E[设备读取描述符并 DMA]
    E --> F[设备写 completion]
    F --> G[MSI-X 或轮询回收]
```

这里最关键的不是某个 API，而是 **谁拥有缓冲区、什么时候转移所有权、什么时候可以回收**。

## 二、为什么需要环形队列

如果每次传输都分配一个缓冲区、写一次寄存器、等一次中断，CPU 会花大量时间处理固定开销。环形队列把多个请求预先组织起来：

- 生产者持续填写空闲描述符；
- 设备消费者持续读取可用描述符；
- 设备完成后更新完成状态；
- 驱动批量回收并补充队列。

典型队列包含：

| 区域 | 作用 | 写入者 |
|---|---|---|
| TX descriptor ring | 描述待发送数据 | 主机驱动 |
| RX descriptor ring | 描述可接收缓冲区 | 主机驱动 |
| Completion ring | 描述已完成请求 | 设备或硬件 |
| Doorbell | 通知设备新的 producer index | 主机 MMIO |
| Head/Tail | 表示双方处理进度 | 主机和设备 |

环形队列中的索引不能只用“数组下标相等”判断空满，否则会产生歧义。常见方案是维护 producer/consumer index，并额外保存 phase bit，或者让队列大小取 2 的幂并保留一个空槽。

## 三、缓冲区所有权协议

以 RX 队列为例，缓冲区生命周期可以这样描述：

```text
驱动填充空闲 buffer
        |
        v
驱动把 buffer 交给设备
        |
        v
设备 DMA 写入 buffer
        |
        v
设备写 completion 并交还驱动
        |
        v
驱动同步、解析、交给上层
        |
        v
驱动重新填充并再次交给设备
```

在设备拥有期间，CPU 不能修改描述符指向的内存，也不能提前把 buffer 交给上层复用。否则会出现：

- 设备写入已被上层覆盖的内存；
- 同一个 DMA 地址同时出现在多个描述符；
- completion 到达后找不到对应软件对象；
- 偶发图像撕裂或数据包损坏。

实际项目中建议给每个描述符建立软件上下文：

```c
struct my_dma_buf {
    void *cpu_addr;
    dma_addr_t dma_addr;
    size_t len;
    u16 index;
    bool device_owned;
};

struct my_desc {
    __le64 addr;
    __le32 len;
    __le16 flags;
    __le16 id;
};
```

描述符里的多字节字段通常使用 `__le16`、`__le32` 或 `__le64`，通过 `cpu_to_le32()` 和 `le32_to_cpu()` 显式处理字节序，不要假设设备和 CPU 永远都是同一种 endian。

## 四、Linux DMA API 的选择

### 1. 一致性 DMA 内存

适合描述符环、控制结构和需要 CPU/设备频繁共同访问的区域：

```c
ring->cpu = dma_alloc_coherent(dev,
                               ring_bytes,
                               &ring->dma,
                               GFP_KERNEL);
if (!ring->cpu)
    return -ENOMEM;
```

释放时必须使用对应的：

```c
dma_free_coherent(dev, ring_bytes,
                  ring->cpu, ring->dma);
```

一致性内存简化了 CPU 与设备的可见性问题，但不意味着零成本，也不一定适合大量大块数据。

### 2. Streaming DMA

数据 buffer 更常使用 streaming mapping：

```c
dma_addr_t dma;

dma = dma_map_single(dev, buf, len, DMA_FROM_DEVICE);
if (dma_mapping_error(dev, dma))
    return -EIO;

/* 把 dma 地址写入设备描述符 */

/* 设备完成后 */
dma_sync_single_for_cpu(dev, dma, len, DMA_FROM_DEVICE);
/* CPU 读取 buf */
dma_sync_single_for_device(dev, dma, len, DMA_FROM_DEVICE);
```

使用 `DMA_FROM_DEVICE` 表示数据从设备流向内存，`DMA_TO_DEVICE` 表示从内存流向设备。方向填错在非一致性架构上可能表现为旧数据、随机数据或只在高负载下失败。

长期映射的 buffer 要在设备使用期间保持映射，不能每次中断都无条件 map/unmap。短期映射则必须严格配对。

## 五、描述符发布前的内存顺序

驱动通常先写描述符，再写 doorbell。CPU 和 PCIe 设备之间必须保证这个顺序：

```c
WRITE_ONCE(desc->addr, cpu_to_le64(dma_addr));
WRITE_ONCE(desc->len, cpu_to_le32(len));
WRITE_ONCE(desc->flags, cpu_to_le16(DESC_VALID));

/* 确保描述符内容先于 doorbell 对设备可见 */
dma_wmb();

writel(new_tail, regs + TX_DOORBELL);
```

如果 doorbell 先到达设备，而描述符内容仍停留在 CPU cache 或写缓冲中，设备可能读取到旧地址、旧长度或无效标志。

完成路径也有相反的顺序要求：设备先写 completion，再更新状态或触发中断。CPU 在读取 completion 前，需要遵循设备 spec 要求的读取顺序，并在驱动中使用合适的 `dma_rmb()` 或 DMA sync。具体屏障不能机械套用，必须结合设备对 completion 的写入协议。

## 六、MSI 与 MSI-X 的选择

### MSI

MSI 通常提供数量较少、结构较简单的消息中断。对于单队列或少量队列设备，MSI 已经足够。

### MSI-X

MSI-X 支持更多中断向量，适合把不同队列、错误事件和管理事件分开：

```text
vector 0 -> RX queue 0
vector 1 -> RX queue 1
vector 2 -> TX queue 0
vector 3 -> device error
```

这样可以把队列中断分配到不同 CPU，减少锁竞争并提高并行度。驱动中通常先启用 MSI-X，再申请各向量的 IRQ：

```c
ret = pci_alloc_irq_vectors(pdev, 1, max_vecs,
                            PCI_IRQ_MSIX | PCI_IRQ_MSI);
if (ret < 0)
    return ret;

nvec = ret;
for (i = 0; i < nvec; i++) {
    int irq = pci_irq_vector(pdev, i);
    ret = request_irq(irq, my_irq, 0,
                      "my_pcie", &q[i]);
    if (ret)
        goto err_irq;
}
```

错误路径必须只释放已经成功申请的向量：

```c
while (--i >= 0)
    free_irq(pci_irq_vector(pdev, i), &q[i]);
pci_free_irq_vectors(pdev);
```

## 七、中断处理不要做重活

硬中断处理函数应尽快完成：

1. 读取并确认中断状态；
2. 屏蔽或清除当前中断源；
3. 记录必要的队列状态；
4. 调度下半部、tasklet、workqueue 或 NAPI；
5. 返回 `IRQ_HANDLED`。

示例：

```c
static irqreturn_t my_irq(int irq, void *data)
{
    struct my_queue *q = data;
    u32 status = readl(q->regs + IRQ_STATUS);

    if (!(status & q->irq_mask))
        return IRQ_NONE;

    writel(status, q->regs + IRQ_ACK);
    napi_schedule(&q->napi);
    return IRQ_HANDLED;
}
```

数据包或 completion 的批量回收放到 NAPI poll 等下半部中。中断风暴、锁竞争和 cache 抖动通常都需要通过批处理缓解。

## 八、RX 队列的伪代码

```c
static int my_rx_poll(struct napi_struct *napi, int budget)
{
    struct my_queue *q = container_of(napi, struct my_queue, napi);
    int work = 0;

    while (work < budget) {
        struct my_cqe *cqe = my_peek_cqe(q);
        struct my_dma_buf *buf;
        u32 len;

        if (!cqe)
            break;

        dma_rmb();
        buf = &q->bufs[cqe->id];
        len = le32_to_cpu(cqe->len);

        dma_sync_single_for_cpu(q->dev, buf->dma_addr,
                                buf->len, DMA_FROM_DEVICE);
        my_deliver_to_upper_layer(buf->cpu_addr, len);
        dma_sync_single_for_device(q->dev, buf->dma_addr,
                                   buf->len, DMA_FROM_DEVICE);

        my_repost_rx_desc(q, buf);
        my_advance_cq(q);
        work++;
    }

    if (work < budget) {
        napi_complete_done(napi, work);
        my_unmask_rx_irq(q);
    }

    return work;
}
```

这段代码省略了锁、错误状态、分配失败和上层回收机制，但完整体现了：读取 completion、同步 DMA、处理 buffer、重新投递描述符和恢复中断。

## 九、吞吐量为什么达不到链路理论值

PCIe 链路带宽只是上限，实际吞吐还受到：

- TLP header 和 DLLP 开销；
- Max Payload Size；
- Max Read Request Size；
- DMA 读写方向；
- 主机内存带宽；
- IOMMU 映射和页表开销；
- 描述符数量与队列深度；
- 中断频率；
- CPU 回收速度；
- 设备内部 FIFO；
- NUMA 或 cache locality。

调优时不要只看 `Gen3 x4` 的理论数字。至少分别统计：

```text
设备产生数据量
DMA 提交速率
DMA 完成速率
中断次数
每次中断回收描述符数
队列最大深度
DMA error 次数
CPU 使用率
```

如果队列经常满，可能是设备发送太快或上层处理太慢；如果队列长期空，可能是提交线程、内存分配或设备生产端不足。

## 十、背压、generation 与 reset 让 ring 能长期运行

SQ 满时 software producer 不能覆盖 device consumer 尚未释放的槽位；可以阻塞提交者、返回 `-EAGAIN` 或让上层 queue 限流。CQ 接近满时 Device 也必须停止产生新 completion 或报告 overflow，否则软件会永久丢失 buffer ownership。

多队列减少数据路径锁，但 reset 属于全局控制面。Reset 前进入 QUIESCING，阻止新 doorbell，mask vector，停止 Device DMA并等待 quiescent；随后把所有 in-flight 请求完成为错误，清 producer/consumer/phase，增加 queue generation，再重新写 base/size并启动。

迟到 completion 必须带 request id 或 generation 校验。旧 generation 的 CQE 只能丢弃，不能映射到已经复用的 descriptor。压力测试应覆盖 producer/consumer 多次回绕、ring full、CQ overflow、乱序完成、timeout、FLR 和用户进程退出，而不只是顺序提交。

长期一致性可以用守恒关系检查：`submitted = completed + failed + in_flight`，DMA mapping 数和 buffer pool 数在停止后归零，所有 queue producer/consumer 回到同一 generation。吞吐仍在增长并不能证明资源没有缓慢泄漏。

## 十、稳定性设计

### 1. DMA 超时

超时处理要区分：

- 设备真的没有完成；
- completion 已写入但中断丢失；
- IOMMU fault；
- DMA 地址错误；
- 设备已经进入 fatal error。

恢复流程通常包括：停止新提交、屏蔽中断、读取错误寄存器、停止 DMA、回收软件对象、执行设备复位、重新初始化队列。不能直接释放仍被设备使用的 buffer。

### 2. 设备拔出或复位

PCIe 热复位、链路掉线和系统关机都可能触发资源销毁。驱动需要有统一的状态机，例如：

```text
RUNNING -> QUIESCING -> RESETTING -> REINIT -> RUNNING
                    \-> DEAD
```

所有提交入口都应检查状态，避免在 `QUIESCING` 或 `DEAD` 状态继续写 doorbell。

### 3. DMA mask

设备支持的 DMA 地址宽度必须和平台一致：

```c
if (dma_set_mask_and_coherent(&pdev->dev, DMA_BIT_MASK(64))) {
    if (dma_set_mask_and_coherent(&pdev->dev, DMA_BIT_MASK(32)))
        return -ENODEV;
}
```

这并不代表硬件真的支持 64 位地址。最终应以设备 spec、IOMMU 配置和平台 DMA 能力为准。

## 十一、硬件验证方法

至少准备：

- 一块可枚举的 PCIe Endpoint，如 FPGA、网卡或 NVMe；
- 主机或 SoC 的 PCIe 插槽；
- 串口日志；
- 万用表和示波器；
- 可选的 PCIe 协议分析仪。

建议按顺序验证：

1. `lspci` 能枚举；
2. `LnkSta` 速率和宽度符合预期；
3. BAR 读写测试通过；
4. MSI/MSI-X 中断计数增长；
5. 单 buffer DMA 读写通过；
6. 环形队列连续传输通过；
7. 高负载、长时间和复位恢复通过。

## 十二、验收清单

- [ ] 描述符和 completion 的字节序已明确；
- [ ] TX/RX buffer 的所有权转移有清晰协议；
- [ ] DMA mask、map/unmap、sync API 使用正确；
- [ ] 描述符发布前有适当的内存顺序保证；
- [ ] MSI-X 向量与队列映射关系明确；
- [ ] 硬中断只做确认和调度；
- [ ] 队列满、空、超时和错误状态均有处理；
- [ ] 设备 reset 或链路掉线时不会继续提交 DMA；
- [ ] 已完成单 buffer、环形队列、高负载和恢复测试。

## 十三、小结

PCIe 高吞吐驱动的主线是：

**分配 DMA 内存 → 构造描述符 → 屏障后敲 doorbell → 设备 DMA → completion → MSI-X/NAPI 回收 → 重新投递。**

真正决定稳定性的，是缓冲区所有权、DMA 映射、内存顺序、中断批处理和错误恢复，而不是单独某一个寄存器或 API。

---
