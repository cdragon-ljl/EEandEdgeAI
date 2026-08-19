---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #03 · BAR 与 MMIO"
description: "前面一讲我们已经看到了 PCIe 配置空间，也知道了系统如何识别设备。这一讲进入 PCIe 驱动里真正会天天打交道的东西：**BAR 和 MMIO**。"
pubDate: "2026-08-18"
series: usb-pcie
order: 12
tags: ["PCIe", "Linux Driver"]
draft: false
---
前面一讲我们已经看到了 PCIe 配置空间，也知道了系统如何识别设备。这一讲进入 PCIe 驱动里真正会天天打交道的东西：**BAR 和 MMIO**。

如果说配置空间是设备的“身份证和基础说明”，那么 BAR 就是设备和 CPU 之间建立稳定通信的“窗口”。驱动一旦把 BAR 映射到内核虚拟地址，就可以像访问内存一样访问设备寄存器。

## 一、BAR 是什么

BAR 是 Base Address Register 的缩写，表示基地址寄存器。它的作用是向主机申请一段地址空间，用来映射设备资源。

设备通过 BAR 告诉系统：

- 我需要多大的一段地址空间
- 这段空间是内存空间还是 I/O 空间
- 需要映射哪些寄存器或缓冲区

在现代 PCIe 设备中，最常见的是**内存映射寄存器**，也就是 MMIO。

## 二、MMIO 是什么

MMIO 全称 Memory Mapped I/O，中文可以理解为“内存映射输入输出”。

它的核心思想是：把设备寄存器映射到 CPU 可以直接访问的地址空间里。这样驱动就不需要通过特殊指令访问硬件，而是直接读写一个虚拟地址。

例如：

```c
void __iomem *base;
base = pci_iomap(pdev, 0, 0);

writel(0x1, base + REG_CTRL);
val = readl(base + REG_STATUS);
```

`readl()` 和 `writel()` 就是在访问 MMIO 寄存器。

## 三、BAR 和寄存器的关系

设备内部通常会有很多控制寄存器，例如：

- 控制寄存器
- 状态寄存器
- DMA 入口寄存器
- 中断控制寄存器
- 队列控制寄存器

这些寄存器一般会被放进 BAR 映射的地址范围里。驱动通过 BAR 映射后，就能访问这些寄存器。

## 四、BAR 为什么重要

没有 BAR，驱动就不知道去哪里读写设备寄存器。

BAR 的本质作用是让设备告诉系统：

“请给我一段地址窗口，我要把自己的控制接口暴露给你。”

这一步完成后，CPU 才能对设备进行真正的控制。

## 五、BAR 和 RAM 不是一回事

初学者很容易把 BAR 当成普通内存。实际上：

- RAM 是系统内存
- BAR 是设备资源映射窗口
- MMIO 只是看起来像内存，底层其实对应设备寄存器

所以访问 MMIO 时不能随便用普通指针逻辑，必须用内核提供的读写接口，并注意顺序和屏障。

## 六、典型 PCI 驱动如何映射 BAR

```c
static int xxx_probe(struct pci_dev *pdev,
                     const struct pci_device_id *id)
{
    void __iomem *base;

    if (pci_enable_device(pdev))
        return -ENODEV;

    if (pci_request_regions(pdev, "xxx"))
        return -EBUSY;

    base = pci_iomap(pdev, 0, 0);
    if (!base)
        return -ENOMEM;

    pci_set_drvdata(pdev, base);
    return 0;
}
```

驱动通常要做的步骤是：

1. 使能设备
2. 申请资源
3. 映射 BAR
4. 保存地址
5. 在后续逻辑中读写寄存器

## 七、访问 MMIO 的注意事项

### 1. 不能随便做普通内存优化

MMIO 访问具有副作用，编译器不能像普通内存那样自由重排，所以要用专门的访问接口。

### 2. 要注意字节宽度

寄存器可能是 8 位、16 位、32 位甚至 64 位，必须和硬件定义一致。

### 3. 要注意顺序

某些寄存器写入顺序不能乱，尤其是设备启动、DMA 启停和中断配置时。

### 4. 要注意缓存一致性

如果设备和 CPU 共享数据，还会涉及 DMA 缓存一致性问题，这个后面会单独讲。

## 八、BAR 资源怎么查看

可以用 `lspci -vv` 看设备资源分配情况。你会看到类似：

- `Region 0: Memory at ...`
- `Region 1: I/O ports at ...`

这能帮助你确认 BAR 是否申请成功、大小是否合理。

## 九、MMIO 和普通寄存器访问的差别

普通软件里访问变量，是访问 RAM；驱动里访问 MMIO，是在访问设备。

这意味着：

- 不能假设访问是无副作用的
- 不能假设读写顺序可随意变化
- 不能假设设备随时都在线且响应正常

## 十、BAR 设计和设备功能的关系

不同设备会把不同功能放在不同 BAR 里：

- BAR0：控制寄存器
- BAR1：队列区域
- BAR2：doorbell 或命令区
- BAR3：片上 SRAM 或大窗口

这不是固定标准，但很多设备都采用类似组织方式。

## 十一、一个 BAR / MMIO 的理解流程

```mermaid
flowchart TD
    A[PCIe 设备枚举完成] --> B[系统分配 BAR]
    B --> C[驱动调用 pci_iomap]
    C --> D[得到 __iomem 基地址]
    D --> E[readl/writel 访问寄存器]
    E --> F[控制设备状态和 DMA]
```

## 十二、调试时重点看什么

### 1. BAR 是否分配成功

看 `lspci -vv`，确认资源区域是否存在。

### 2. 映射是否成功

`pci_iomap()` 返回值不能为空。

### 3. 寄存器读写是否生效

写控制位后，状态位是否变化。

### 4. 是否出现访问异常

有些设备没上电或者链路不稳时，读 MMIO 会直接失败或读到无意义数据。

## 十三、小结

这一讲你应该掌握了：

- BAR 是 PCIe 设备向系统申请的资源窗口
- MMIO 是驱动访问设备寄存器的常见方式
- `pci_iomap()` 是 BAR 映射的典型接口
- MMIO 不是普通内存，访问时要非常注意顺序、宽度和副作用

下一讲我们会进入 Linux PCI 驱动框架，把 `struct pci_driver`、`probe()`、`remove()` 这些核心接口讲透。

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
