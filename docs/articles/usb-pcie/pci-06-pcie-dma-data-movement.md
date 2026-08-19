---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #06 · PCIe DMA 数据搬运"
description: "PCIe 设备之所以强大，很大一部分原因来自 DMA。对于高速网卡、NVMe、采集卡、FPGA 和 AI 加速器来说，真正的数据通路通常不是 CPU 一次次读写寄存器，而是设备直接通过 DMA 访问主机内存。"
pubDate: "2026-08-18"
series: usb-pcie
order: 15
tags: ["PCIe", "Linux Driver"]
draft: false
---
PCIe 设备之所以强大，很大一部分原因来自 DMA。对于高速网卡、NVMe、采集卡、FPGA 和 AI 加速器来说，真正的数据通路通常不是 CPU 一次次读写寄存器，而是设备直接通过 DMA 访问主机内存。

这一讲把 PCIe DMA 的核心机制讲清楚。

## 一、为什么 PCIe 离不开 DMA

PCIe 设备通常要搬运大量数据，例如：

- 网卡收发包
- SSD 读写块数据
- 图像采集卡上传帧数据
- AI 加速器读取输入和写回输出

如果这些数据都由 CPU 通过 MMIO 一次次搬运，性能会非常差。DMA 的价值就是让设备直接和内存交换数据，CPU 只负责配置和同步。

## 二、DMA 的基本模型

DMA 的基本流程是：

1. 驱动分配或映射一块内存
2. 得到设备可访问的 DMA 地址
3. 把 DMA 地址写入设备寄存器
4. 设备通过 PCIe 读写这块内存
5. 完成后通过中断通知 CPU
6. 驱动处理结果

## 三、CPU 地址和 DMA 地址不是一回事

驱动开发里非常重要的一点是：CPU 看到的虚拟地址，设备不能直接使用。

常见地址概念有：

- CPU 虚拟地址
- CPU 物理地址
- DMA 地址
- IOMMU 映射后的 IOVA

驱动必须通过 DMA API 获取设备可用地址，不能随便把普通指针丢给设备。

## 四、Linux DMA API 的基本使用

### 1. 一致性 DMA 内存

```c
void *cpu_addr;
dma_addr_t dma_addr;

cpu_addr = dma_alloc_coherent(&pdev->dev, size,
                              &dma_addr, GFP_KERNEL);
```

这种内存 CPU 和设备都能稳定访问，适合描述符环、控制块、小型共享结构。

### 2. 流式 DMA 映射

```c
dma_addr_t dma;
dma = dma_map_single(&pdev->dev, buf, len, DMA_TO_DEVICE);
```

适合临时数据传输，但需要正确 unmap。

## 五、DMA 方向为什么重要

Linux DMA API 需要明确方向：

- `DMA_TO_DEVICE`：CPU 写好数据，设备读取
- `DMA_FROM_DEVICE`：设备写数据，CPU 读取
- `DMA_BIDIRECTIONAL`：双向访问

方向写错可能导致缓存同步异常，表现为数据脏、旧数据、偶现错误。

## 六、DMA 和 cache 一致性

在非一致性架构上，CPU cache 和设备看到的内存可能不一致。

例如：

- CPU 写了数据，但还在 cache 中，设备读不到
- 设备写了数据，但 CPU cache 里还有旧值

DMA API 的一个重要职责就是帮助处理 cache 同步。

## 七、描述符环是什么

很多 PCIe 设备使用 descriptor ring 管理 DMA。

驱动准备一组描述符，每个描述符描述一块 buffer：

- 地址
- 长度
- 状态
- 控制位

设备按环形队列消费或生产描述符。

```mermaid
flowchart LR
    A[CPU 填写描述符] --> B[写 doorbell]
    B --> C[设备读取描述符]
    C --> D[执行 DMA]
    D --> E[更新完成状态]
    E --> F[触发中断]
    F --> G[驱动回收 buffer]
```

## 八、DMA 中断协同

DMA 完成后，设备通常通过 MSI/MSI-X 通知驱动。驱动在中断或底半部中：

- 检查完成队列
- 回收 buffer
- 唤醒等待线程
- 提交新的 DMA 任务

高性能设备通常不会“一次 DMA 一次中断”，而是做批量处理或中断聚合。

## 九、常见 DMA 问题

### 1. 地址写错

把 CPU 虚拟地址当 DMA 地址写给设备，这是严重错误。

### 2. 没有设置 bus master

PCIe 设备要发起 DMA，通常需要 `pci_set_master()`。

### 3. 方向错误

DMA direction 写错会导致 cache 同步问题。

### 4. 释放过早

设备还在 DMA，驱动已经释放 buffer，会导致内存破坏。

### 5. IOMMU 映射问题

设备能看到的地址和 CPU 物理地址不一致，需要正确配置 IOMMU。

## 十、调试 DMA 的工具和方法

- `dmesg` 看 DMA API warning
- `lspci -vv` 确认设备状态
- ftrace/perf 看中断和处理耗时
- 驱动日志打印 DMA 地址、长度、方向
- 长时间压力测试检查数据一致性

## 十一、验证清单

- `pci_enable_device()` 成功
- `pci_set_master()` 已调用
- DMA mask 设置正确
- DMA buffer 生命周期正确
- map/unmap 成对出现
- 中断能通知完成
- 数据校验长期稳定

## 十二、小结

PCIe DMA 是高速设备驱动的核心。真正的重点不是“会调用一个 DMA API”，而是理解地址、缓存、一致性、描述符环、中断和生命周期。

> 🏷️ PCIe / DMA / descriptor ring / cache一致性 / IOMMU / Linux驱动

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
