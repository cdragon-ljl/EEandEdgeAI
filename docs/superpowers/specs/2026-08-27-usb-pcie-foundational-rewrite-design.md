# USB 与 PCIe 系列基础到源码重写设计

## 1. 背景

当前 USB 与 PCIe 系列虽然覆盖了枚举、驱动框架、DMA、中断等关键词，但没有稳定地建立读者的基础模型。PCIe 第一篇直接进入配置空间、BAR、LTSSM 和 TLP，未先回答“PCIe 是什么、为什么需要它、一次读写如何穿过链路”；部分文章把 API 和故障项并列陈述，读者难以从原理推导到源码和工程行为。

本轮不再扩写现有段落，也不以调整标题层级代替内容重写。保留文件名、frontmatter、文章顺序和线上 URL，从空白正文重新组织 10 篇 USB、12 篇 PCIe 及 4 篇对比/面试专题。

## 2. 目标与边界

目标读者是具备 C 语言、基础计算机组成和 Linux 使用经验，但尚未系统学习 USB/PCIe 的嵌入式开发者。每篇文章必须从读者在上一讲已经建立的模型出发，先定义术语，再讲协议或硬件机制，随后映射到 Linux 对象、内核源码和工程验证。

本轮保持以下兼容性：

- 不改变 `series`、`order`、slug、发布日期和既有页面 URL。
- 不拆分或合并文章数量，不调整网站导航与封面。
- 保留有价值的已有代码片段，但只有在重新推导后才可使用。
- 不虚构硬件测试数据，不把特定厂商实现描述成协议强制要求。

## 3. 资料来源优先级

技术结论按以下优先级核对：

1. USB-IF 发布的 USB 2.0/USB 3.x 规范、Class 规范和描述符定义。
2. PCI-SIG 公共规范资料和 Capability 定义。
3. Linux 内核文档，包括 USB Host/Gadget API、PCI 驱动、MSI、DMA API、IOMMU/VFIO 和 PCI Endpoint Framework。
4. Linux 内核源码中的 `drivers/usb/`、`drivers/pci/`、`kernel/dma/`、`drivers/iommu/` 及相关头文件。
5. CherryUSB v1.6.1 官方仓库、文档和示例。

文章末尾列出本篇实际使用的一手资料。源码名称和调用链以明确的内核版本语义为依据；不同版本存在差异时说明稳定概念与版本差异的边界。

## 4. 统一写作模型

每篇文章围绕一个可回答的问题展开，而不是围绕术语列表展开。正文通常包含 5～8 个主章节，但章节数量不是目标。一个主章节应形成连续推导：

1. 这个机制解决什么问题，若没有它会发生什么。
2. 参与对象、数据结构、协议字段和硬件状态分别是什么。
3. 一次真实操作如何按时间顺序或数据路径执行。
4. Linux 在何处创建对象、调用驱动并转移资源所有权。
5. 如何观察、验证和定位错误。

只有能独立展开多个自然段的主题才使用标题。一两句话的说明、术语定义和故障项使用段内加粗或表格，不单独建章。

架构、对象关系、枚举、状态机、请求响应、DMA 所有权和分层排错必须在对应位置使用 Mermaid 图，并由相邻正文解释图中的节点和箭头。

## 5. USB 十篇学习路径

### USB 01：USB 是什么，以及设备如何被枚举

先解释 USB 解决的连接、识别、供电和多设备接入问题；建立 Host 主导、Device 响应、Hub 扩展的总线模型；介绍速度等级、物理连接、端点和四种传输类型。随后从端口连接检测、reset、默认地址、EP0 控制传输、描述符读取、`SET_ADDRESS`、`SET_CONFIGURATION` 走完整枚举时序，并映射到 `hub_port_connect()`、`usb_new_device()` 和 interface driver 绑定。至少包含总线拓扑图和枚举时序图。

### USB 02：Linux USB Host 驱动框架

从 Host Controller、HCD、usbcore、`usb_device`、`usb_interface` 到 `usb_driver` 建立对象层次。沿设备发现、interface match、`probe()`、URB 提交、runtime PM、disconnect 和对象释放解释完整生命周期，重点说明 interface 绑定、引用计数和“对象仍存在不代表硬件仍可访问”。至少包含软件栈图和热插拔生命周期图。

### USB 03：描述符如何表达设备能力

从字节流和 `bLength/bDescriptorType` 讲清 Device、Configuration、Interface、Endpoint、String、IAD、BOS 和 Class-specific descriptor。解释 `wTotalLength`、Alternate Setting、复合设备与 interface association，并对照 Linux 的 `usb_host_config`、`usb_host_interface` 和 endpoint 对象解析真实 `lsusb -v` 输出。至少包含描述符树、读取时序和 Linux 对象映射图。

### USB 04：传输、Endpoint、Pipe 与 URB

从 USB transaction、transfer 与 Linux URB 的层次差异开始，解释 Control/Bulk/Interrupt/Isochronous 的调度和完成语义。沿 `usb_alloc_urb()`、fill、submit、HCD 排队、completion、unlink/kill、anchor 和多 URB 轮转讲清 buffer 所有权、短包、ZLP、iso packet status 与并发取消。至少包含 URB 生命周期、Control 三阶段和多 URB 数据流水图。

### USB 05：完成一个可热插拔的 USB 设备驱动

以 vendor-specific bulk 设备为主线，从 ID/interface 匹配、端点发现、私有对象、字符设备发布、异步收发、wait queue、poll、背压和错误回滚，写出可审计的驱动骨架。重点推导 disconnect 与 open file/URB completion 并发时的停止顺序。至少包含 probe 资源获取图和 disconnect 所有权收敛图。

### USB 06：Linux Gadget 与 Composite Framework

先解释同一控制器为何能工作在 Device 角色，再建立 UDC、gadget driver、composite、configuration、function、endpoint 和 `usb_request` 的层次。沿 reset、setup、address/configuration、`set_alt()`、数据排队、disable 和 unbind 讲清控制面与数据面，并说明 ConfigFS 与 FunctionFS 的边界。至少包含 Gadget 分层图和 EP0/数据 endpoint 调用时序图。

### USB 07：HID、CDC、MSC、UVC 与 UAC 类协议

不是罗列类名，而是用“描述符如何定义功能、控制请求如何协商、数据端点如何工作、Linux 暴露什么用户 API”统一分析五类设备。分别讲清 HID Report、CDC control/data interface、MSC BOT/UAS、UVC Probe/Commit 与 Alternate Setting、UAC clock/feedback。至少包含类驱动绑定图及控制面/数据面比较图。

### USB 08：建立分层排错证据链

按供电与角色、PHY 与连接、EP0 枚举、描述符、driver bind、URB、Class 协议、用户 API、runtime PM/热插拔分层。解释 `dmesg`、sysfs、usbmon、Wireshark、dynamic debug、tracepoint、KASAN 和 IOMMU fault 分别能证明什么，避免把所有失败归因于驱动。至少包含排错决策树。

### USB 09：Host Controller、PHY 与设备树 Bring-up

从 USB Controller IP、PHY、clock/reset、VBUS regulator、role switch 和 root hub 解释板级 Host 通路。比较 EHCI/xHCI/DWC2/DWC3 的软件边界，沿平台驱动、`usb_create_hcd()`、`usb_add_hcd()` 到 root hub 枚举分析设备树和启动日志。至少包含硬件到 class driver 的链路图及 Host 初始化时序图。

### USB 10：MCU USB 与 CherryUSB

先说明 MCU USB 与 Linux Host/Gadget 在资源、cache、IRQ 和 OS 抽象上的差异，再以 CherryUSB v1.6.1 的 core/class/port/OSAL 分层分析 DCD/HCD 移植。分别走通 Device CDC ACM 和 Host 枚举/Class bind 路径，解释 endpoint FIFO/DMA、cache coherency、回调上下文和验收顺序。至少包含 CherryUSB 架构图和 Device/Host 调用链图。

## 6. PCIe 十二篇学习路径

### PCIe 01：PCIe 是什么

从 CPU、内存和高速设备为什么需要标准互连开始，解释 PCI 到 PCI Express 从共享并行总线到高速串行点对点 fabric 的变化。依次建立 Root Complex、Endpoint、Switch、Port、Link、Lane、x1/x4/x8/x16、GT/s、双工、代际编码和有效带宽概念；再介绍 Physical/Data Link/Transaction 三层、TLP/DLLP、posted/non-posted/completion、credit、replay 和 LTSSM。最后才映射到 Linux 拓扑和 `lspci`。至少包含拓扑图、三层数据封装图、Memory Read/Write 事务图和 LTSSM 主状态图。

### PCIe 02：枚举、BDF 与配置空间

从“系统如何发现一块尚无 BAR 地址的设备”提出问题，解释 ECAM/配置访问、BDF、Type 0/Type 1 Header、bus number、bridge recursion 和 multi-function。沿 Linux root bus scan、vendor ID 探测、`pci_dev` 创建、BAR sizing、resource assignment、bridge window 与 capability traversal 走完整枚举路径。至少包含递归枚举图和配置空间布局图。

### PCIe 03：BAR、MMIO 与地址转换

解释设备为何需要把内部寄存器/存储窗口暴露给 CPU，讲清 I/O BAR、Memory BAR、32/64 位、prefetchable、写全 1 sizing 和资源对齐。把 CPU virtual address、host physical window、PCIe bus address、Endpoint BAR 和内部 offset 串成一条地址路径，并解释 `pci_request_region()`、`pci_iomap()`、readl/writel、posted write 与 readback。至少包含 BAR sizing 时序图和地址转换图。

### PCIe 04：Linux PCI 驱动生命周期

从 `pci_driver`/ID match 到 probe，按 enable、region、DMA mask、bus master、iomap、ring、IRQ、hardware start、user interface 的依赖顺序构建驱动。每一步解释它改变的硬件或内核状态以及失败时的逆序回滚。统一分析 remove、runtime PM、FLR、AER recovery 和用户引用。至少包含 probe 依赖图和统一状态机。

### PCIe 05：INTx、MSI 与 MSI-X

先解释设备为什么需要异步通知 CPU，再比较 INTx 的共享电平语义和 MSI/MSI-X 的 Memory Write 本质。讲清 capability、message address/data、vector、MSI-X Table/PBA、mask、affinity、多队列和 ordering；映射到 `pci_alloc_irq_vectors()`、`pci_irq_vector()`、handler/threaded IRQ/NAPI。至少包含三种中断路径图和多队列 vector 映射图。

### PCIe 06：DMA 与数据所有权

从“设备如何绕过 CPU 搬运内存”开始，区分 CPU VA、PA、bus address 和 DMA address；解释 DMA mask、coherent allocation、streaming mapping、direction、cache sync、scatter-gather 和 memory barrier。以 descriptor ring 为核心走 producer、doorbell、device ownership、completion、unmap/recycle 和 reset。至少包含 DMA 地址图、mapping 生命周期图和 ring 所有权状态图。

### PCIe 07：IOMMU、IOVA 与设备隔离

解释直通 DMA 的风险和 IOMMU 要解决的 addressability/isolation 问题；建立 requester ID、domain、IOVA、page table、IOTLB、group 和 fault 模型。沿 DMA API map/unmap、设备访问和 fault 走一遍，再介绍 SWIOTLB、ATS、PRI、PASID、VFIO/SVA 的作用边界。至少包含地址翻译图和 mapping/fault 时序图。

### PCIe 08：完成一个 BAR + DMA + MSI-X 驱动

以假想但接口明确的 FPGA/加速器 Endpoint 为例，定义寄存器、descriptor、completion 和 reset protocol，再写完整 Linux 驱动骨架。覆盖 probe/unwind、BAR、DMA ring、MSI-X、ioctl/poll/mmap、timeout、generation、remove 与并发停止，避免只给 API 片段。至少包含设备/驱动状态机和请求数据路径图。

### PCIe 09：性能模型与稳定性

从协商链路速率/宽度开始，建立 encoding、TLP overhead、MPS、MRRS、RCB、outstanding/tag、credit、ring、batch、doorbell、interrupt moderation、NUMA、memory bandwidth、IOMMU/IOTLB 的分层性能模型。说明吞吐、平均延迟和 P99 的取舍，并把 AER、timeout、reset 和资源守恒纳入稳定性。至少包含瓶颈链路图和测量闭环图。

### PCIe 10：从不上电到 DMA 错误的排错方法

按 power/PERST#/REFCLK/lane、LTSSM、config access、BDF、BAR/ATU、driver bind、IRQ、DMA/IOMMU、AER/reset 顺序建立证据链。每层给出可观察寄存器、Linux 命令、错误类型和继续向下排查的条件。至少包含分层决策树。

### PCIe 11：Endpoint 硬件和软件 Bring-up

站在 Endpoint 与 Root Complex 两侧解释 REFCLK、PERST#、lane、LTSSM、Configuration Space、BAR、inbound/outbound ATU、MSI-X 和 DMA engine。结合 Linux PCI Endpoint Framework 说明 EPC/EPF、configfs 和测试 function 的作用，并形成从电气到业务的验收阶梯。至少包含双端架构图、LTSSM 图和地址窗口图。

### PCIe 12：高吞吐 DMA Ring 与 MSI-X 多队列

定义提交队列、完成队列、descriptor、phase/generation、producer/consumer、doorbell 和 vector 的共享协议。推导内存屏障、cache、backpressure、interrupt moderation、NAPI/poll budget、reset 和迟到 completion，给出 Linux 伪代码与硬件约束。至少包含 ring 所有权图和多队列数据路径图。

## 7. 四篇专题

- 总线模型比较：从控制权、枚举、寻址、调度、错误恢复和适用设备比较 USB 与 PCIe。
- 驱动框架比较：比较 `usb_interface`/URB/disconnect 与 `pci_dev`/DMA/remove 的对象及所有权差异。
- 调试工具比较：按“工具能证明什么”组织 usbmon、Wireshark、lspci、AER、IOMMU、tracepoint 和协议分析仪。
- 面试与工程问题：问题必须同时考察源码机制和真实应用，答案包含错误答案、正确推导、证据链和工程取舍。

## 8. 验收方式

自动测试只检查容易客观判定的退化：frontmatter/顺序、标题连续、关键技术路径存在、Mermaid 可解析、链接和构建有效。不得以关键词数量或字符数量证明文章“足够深入”。

人工审读逐篇回答以下问题：

- 不熟悉该总线的读者能否理解开头定义和学习动机。
- 每个新术语是否在使用前定义，并能关联到前文模型。
- 协议、硬件、Linux 对象和源码调用链是否互相对应。
- 图是否真正降低理解成本，正文是否解释图中的关键关系。
- 代码是否包含所有权、并发、错误回滚和可验证结果。
- 读完后是否能够完成一个实验、读懂一段源码或定位一类故障。

完成 26 篇正文后，执行专项测试、全量测试、Astro check、生产构建、Mermaid 逐图解析和代表性页面渲染检查，再合并到 `main` 并部署。
