---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #12 · DMA 环形队列与 MSI-X 高吞吐设计"
description: "PCIe 设备驱动的难点通常不在“能不能读一个 BAR 寄存器”，而在于如何让设备持续、高效、可恢复地搬运数据。网卡、采集卡、FPGA 和 AI 加速器普遍采用 **描述符环形队列 + DMA + MSI/MSI-X** 的组合。"
pubDate: "2026-08-18"
series: usb-pcie
order: 21
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

## 初学者扩展讲解


## PCIe 学习中的关键主线

PCIe 的核心主线可以概括为：链路训练、配置空间、资源分配、BAR 映射、中断通知、DMA 搬运。初学者不要一开始就陷入 TLP、DLLP 等协议细节，先把 Linux 驱动真正会接触到的对象搞清楚。

设备上电后，Root Complex 会尝试和 Endpoint 建立链路，这个过程叫链路训练。链路训练成功以后，系统才能扫描配置空间。配置空间里有 Vendor ID、Device ID、Class Code、BAR、Capability 等信息。系统根据这些信息识别设备、分配 MMIO 地址空间、配置中断能力，然后内核 PCI 子系统根据匹配表调用具体驱动的 `probe()`。

如果 `lspci` 看不到设备，通常说明问题还在驱动 probe 之前。此时要优先检查供电、PERST#、REFCLK、lane 连接、Root Complex 配置和设备树。很多初学者会在驱动代码里找半天，但设备根本没有枚举，驱动没有任何机会执行。

## BAR 和 MMIO 要这样理解

PCIe 设备内部有寄存器，但 CPU 不能直接凭空访问这些寄存器。BAR 可以理解为设备向系统声明的一扇窗口：设备说“我需要一段地址空间”，系统分配一个 CPU 可访问的物理地址范围，驱动再把这段范围映射成内核虚拟地址。之后驱动通过 `readl()`、`writel()` 读写这段地址，就相当于访问设备寄存器。

典型流程是：

```c
pci_enable_device(pdev);
pci_request_regions(pdev, "demo");
bar = pci_iomap(pdev, 0, 0);
value = readl(bar + REG_STATUS);
writel(0x1, bar + REG_CTRL);
```

这里每一步都有意义。`pci_enable_device()` 使能设备；`pci_request_regions()` 申请 BAR 资源，避免多个驱动冲突；`pci_iomap()` 建立映射；`readl/writel` 才是真正访问寄存器。不要用普通指针直接访问 MMIO，也不要用 `memcpy` 随便操作寄存器区域。

## DMA、IOMMU 和 cache 一致性

PCIe 高速设备通常不会依赖 CPU 一字节一字节搬数据，而是使用 DMA。DMA 的意思是设备直接读写内存，CPU 只负责准备 buffer、告诉设备地址和长度、等待完成通知。

这里有三个地址概念必须区分：CPU 虚拟地址、CPU 物理地址、设备看到的 DMA 地址。驱动不能把普通虚拟地址直接写给设备，而要通过 DMA API 获取设备可访问地址：

```c
void *cpu_addr;
dma_addr_t dma_addr;

cpu_addr = dma_alloc_coherent(&pdev->dev, size, &dma_addr, GFP_KERNEL);
```

`cpu_addr` 给 CPU 访问，`dma_addr` 给设备访问。如果平台启用了 IOMMU，`dma_addr` 可能是 IOVA，不等于真实物理地址。使用 DMA API 的好处是内核会帮你处理映射、权限和 cache 一致性问题。工程中很多“DMA 写了但 CPU 看不到”“偶发数据错误”“IOMMU fault”，本质都是地址、cache 或生命周期管理出错。

## PCIe 排错的顺序

PCIe 排错建议按下面顺序：

```bash
lspci
lspci -vv
lspci -xxx
cat /proc/interrupts
dmesg -w
```

`lspci` 看设备是否枚举；`lspci -vv` 看 BAR、链路速率、链路宽度、MSI/MSI-X 和驱动绑定；`lspci -xxx` 看配置空间原始内容；`/proc/interrupts` 看中断是否触发；`dmesg` 看驱动日志、AER 错误、IOMMU fault 和 DMA 报错。性能问题还要进一步看 `perf`、ftrace、队列深度、buffer 大小和 CPU 亲和性。

## PCIe 驱动代码阅读建议

阅读 PCIe 驱动时，先看 `pci_device_id` 匹配表，再看 `pci_driver` 结构体。进入 `probe()` 后，重点看是否调用 `pci_enable_device()`、`pci_request_regions()`、`pci_set_master()`、`dma_set_mask_and_coherent()`、`pci_iomap()` 和中断申请函数。随后再看驱动如何创建 DMA 描述符队列、如何启动硬件、如何在中断处理里回收完成项。

一个成熟的 PCIe 驱动不只是能收发数据，还要处理热插拔、错误恢复、DMA 超时、中断丢失、设备复位、IOMMU fault 和长时间压力测试。初学时可以先跑通最小路径，但最终必须理解这些异常路径。


## 面向初学者的阅读方法

刚开始学习这类驱动文章时，最容易犯的错误，是把每一个名词都当成孤立知识点去背。实际工程里，驱动不是由名词堆起来的，而是一条从硬件连接、总线枚举、内核匹配、资源申请、数据传输到用户态验证的完整链路。读这一篇时，建议先抓住三件事：第一，这个机制解决什么问题；第二，Linux 内核用什么对象表达它；第三，出现故障时应该从哪一层开始查。

例如看到“枚举”，不要只记住它叫 enumeration，而要理解为：系统需要先发现设备、识别设备能力、给设备分配地址或资源，然后才可能让具体驱动接管。看到“驱动匹配”，也不要只背 `probe()`，而要继续追问：是谁触发 `probe()`？匹配表里放了什么？设备还没有出现时驱动会不会执行？驱动执行以后第一步应该申请什么资源？这些问题连起来，才是真正能在板子上排错的知识。

## 从硬件到软件的完整路径

一条外设链路通常可以分成五层。第一层是硬件层，包括供电、时钟、复位、信号线、连接器和外设本身。第二层是总线层，也就是 USB、PCIe、I2C、SPI 这类协议如何发现设备、传输数据。第三层是内核框架层，Linux 会把设备抽象成 `struct device`、总线对象、驱动对象和资源对象。第四层是具体驱动层，驱动负责把通用框架和具体芯片寄存器、端点、队列、描述符连接起来。第五层是用户态验证层，包括命令行工具、测试程序、日志和性能统计。

初学者排错时不要一上来就怀疑驱动代码。设备没有被系统看到时，驱动代码通常还没有执行；驱动没有绑定时，可能是匹配表或描述符问题；驱动绑定了但不能传输时，才更可能进入 buffer、DMA、中断、同步和协议细节。按照这个顺序排查，可以避免在错误层面浪费时间。

## 建议准备的实验环境

学习 USB/PCIe 驱动，最好准备一台 Linux 主机、一块支持外设扩展的开发板，以及至少一个真实设备。USB 方向可以从 U 盘、USB 串口、USB 摄像头、USB 网卡开始；PCIe 方向可以从 NVMe、PCIe 网卡、PCIe 转串口卡、FPGA PCIe Endpoint 或开发板自带 PCIe 插槽开始。没有 PCIe 硬件时，也可以先通过 `lspci` 观察 PC 上已有设备，理解配置空间、BAR 和驱动绑定。

每次实验都建议记录四类信息：硬件连接照片或说明、内核版本和设备树/配置、关键命令输出、问题现象和解决过程。驱动学习的进步往往不是来自“看懂一段代码”，而是来自反复把现象、日志、源码和硬件状态对应起来。

## 常用观察命令

无论是 USB 还是 PCIe，都建议养成先看系统状态的习惯：

```bash
uname -a
dmesg -w
lsmod
cat /proc/interrupts
cat /proc/iomem
```

`uname -a` 用来确认内核版本；`dmesg -w` 用来实时观察设备插拔、枚举和驱动 probe 日志；`lsmod` 用来看模块是否加载；`/proc/interrupts` 用来看中断是否触发；`/proc/iomem` 可以帮助理解 MMIO 资源分配。不要小看这些基础命令，很多现场问题并不是复杂 bug，而是设备没枚举、驱动没加载、资源没分配或中断没到。

## 初学者最容易混淆的点

第一，不要把“用户态能看到设备节点”等同于“驱动完全正常”。设备节点只说明某个驱动创建了接口，真正的数据通路还要看读写、ioctl、mmap、poll、DMA 和中断是否正常。

第二，不要把“驱动 probe 成功”等同于“硬件已经工作”。probe 成功通常只代表资源申请和初始化基本完成，后续传输仍可能因为时钟、复位、buffer、协议状态或固件问题失败。

第三，不要把“命令没有报错”等同于“性能达标”。高速设备还要统计吞吐、延迟、CPU 占用、内存拷贝次数、DMA 是否真正生效，以及异常恢复是否可靠。

## 推荐的验证闭环

一篇驱动文章学完以后，不建议只停留在阅读层面。至少做一个小闭环：先用命令确认设备存在，再找到它绑定的驱动，然后观察内核日志，再做一次最小读写或传输测试，最后故意制造一个小错误，例如拔掉设备、改错匹配 ID、禁用模块或调整 buffer 数量，观察系统如何报错。只有经历过“正常路径”和“异常路径”，才能真正理解驱动框架为什么这样设计。
