---
title: "嵌入式知识体系 · PCIe 驱动开发实战 #19 · USB 与 PCIe 总线模型对比"
description: "USB 和 PCIe 都是嵌入式 Linux、智能硬件、AI 加速和高速外设开发中常见的总线。但它们的设计思想完全不同。"
pubDate: "2026-08-29"
series: pcie
order: 19
tags: ["USB", "PCIe", "Architecture", "Linux 6.12"]
draft: false
---
USB 和 PCIe 都能连接高速外设，也都支持设备发现、驱动绑定、热插拔和电源管理，但它们暴露给软件的基本抽象不同。USB 是 Host 调度的设备/Endpoint 传输总线；PCIe 是 Root Complex 路由、接近内存语义的点对点互连。

本文以 Linux 6.12 的 USB Core 与 PCI Core 对象作为统一对比基线。

比较的目的不是判断谁“更先进”，而是理解为什么同一个工程问题在两条总线上要使用不同协议和驱动结构。

## 一、根节点的控制方式不同

USB Host 拥有总线调度权，Device 只能响应 token。即使键盘“主动”上报，仍是 Host 周期性轮询 Interrupt Endpoint。Hub 扩展树，但不改变 Host 控制权。

PCIe Root Complex 建立 fabric 与地址路由，Endpoint 可以作为 requester 主动发 DMA Memory Read/Write，也可以响应 CPU/RC 的 Memory/Configuration Request。PCIe Link 全双工并允许多个 outstanding transaction。

```mermaid
flowchart LR
    subgraph USB[USB control model]
        UH[Host schedule] --> UE[Endpoint transaction]
        UE --> UD[USB Device]
        UD --> UE
    end
    subgraph PCIE[PCIe transaction model]
        RC[Root Complex] <--> EP[Endpoint]
        RC <--> MEM[Host Memory]
        EP <--> MEM
    end
```

因此 USB Device 无法任意选择总线发送时刻；PCIe Endpoint 则可在 credit/tag/ordering 允许时发起事务。

## 二、发现输入是描述符与 Configuration Space

USB Device 从地址 0 的 EP0 返回 Device/Configuration/Interface/Endpoint descriptor，Host 发送 `SET_ADDRESS`、`SET_CONFIGURATION`，再按 Interface class/ID 绑定驱动。

PCIe Endpoint 在独立 Configuration Space 中提供 Vendor/Device/Class、Header、BAR 和 Capability。RC 按 BDF 探测，递归扫描 Bridge，分配 bus number、BAR 和 bridge window，再创建 `pci_dev`。

USB 描述符更多表达功能协议与 Endpoint；PCIe 配置空间更多表达 Function 身份、地址资源和总线能力。USB Class 可直接决定用户 API，PCIe BAR 内部业务协议通常由设备/厂商定义。

## 三、数据通道是 URB 与 BAR + DMA Queue

USB Host Driver 创建 URB，指定 pipe/Endpoint、buffer、length 和 completion，HCD 把它调度为 Control/Bulk/Interrupt/Isochronous transaction。带宽由 Host schedule 和 Endpoint 类型决定。

PCIe Driver 用 BAR/MMIO 配置设备，通过 DMA descriptor ring 发布 buffer，doorbell 通知设备，MSI-X 通知 completion。数据主体通常直接在 Host memory 与 Device 间搬运。

USB 也可能使用 Host Controller DMA，但 DMA 地址由 HCD 管理，Interface Driver 看到 URB；PCIe Function 自己是 DMA requester，Function Driver 直接使用 Linux DMA API 管理 mapping。

## 四、资源、带宽和错误恢复单位不同

USB 资源包括 Device address、Interface、Endpoint、周期带宽、URB 和 Host Controller schedule。拔出时 `disconnect()` 需要 kill URB；reset/clear halt 常以 Device/Endpoint 为单位。

PCIe 资源包括 BDF、BAR/window、vector、DMA mapping、tag/credit 和 queue。remove/reset/AER recovery 需要停止 bus mastering/DMA、同步 IRQ、重建 ring/generation。

USB error recovery 常见 EP0 reset、Endpoint stall/clear、Class reset；PCIe error recovery 常见 Link retrain、FLR/hot reset、AER callback。两者都要求异步请求收敛，但硬件边界不同。

## 五、hotplug、电源与安全模型不同

USB 从设计上强调外部热插拔和标准 Class。供电、端口 reset、suspend/resume、remote wakeup 是常见路径；用户随时拔线必须是驱动正常生命周期。

PCIe 也支持 hotplug，但很多嵌入式 Endpoint 固定焊接。Surprise removal 更危险，因为 Endpoint 可能正在 DMA。IOMMU group/IOVA 为 PCIe requester 提供隔离；USB Interface Driver 的 DMA 通常由 HCD 隔离管理。

USB Device 只能在 Host 安排的 buffer/transaction 中传输；PCIe Endpoint 具备更直接的 memory requester 能力，因此错误/恶意 DMA 的安全影响更大。

## 六、如何选择

选择 USB：外部可插拔、跨平台标准 Class、线缆距离/供电/成本重要、Device 不需要共享内存式访问。选择 PCIe：板内/机内高吞吐低延迟、设备需要主动 DMA、多队列并发、BAR/MMIO 控制和高带宽扩展。

| 维度 | USB | PCIe |
| --- | --- | --- |
| 根控制者 | Host Controller 调度所有 transaction | RC 建立 fabric，Endpoint 可主动请求 |
| 发现 | EP0 descriptor 与 Configuration | BDF、Configuration Space、Bridge scan |
| 数据抽象 | Endpoint + Transfer + URB | Address + TLP + DMA Queue |
| 通知 | Host 周期调度/URB completion | INTx/MSI/MSI-X message |
| 资源 | Address、Interface、Endpoint、周期带宽 | BAR、window、tag/credit、vector、IOVA |
| 热插拔 | 常规设计目标 | 平台可选，surprise removal 风险更高 |
| 标准功能 | HID/CDC/MSC/UVC/UAC 等 Class | 配置机制标准，业务协议多由设备定义 |
| 安全边界 | Device 只能响应 Host 安排传输 | Endpoint 可主动 DMA，需要 IOMMU 隔离 |

### 同一个 AI/FPGA 设备如何做选择

若设备每次上传少量配置、下载结果，要求外接/跨平台且无需内核专用驱动，USB Bulk + vendor protocol/libusb 可能足够。Host 控制所有传输，固件实现 EP0 和有限 Endpoint，系统集成成本较低。

若设备持续访问大块 Host memory、需要多 queue/低 P99 和并行 outstanding，PCIe 更合适。它需要 BAR、DMA descriptor、MSI-X、IOMMU/reset 协议，硬件/驱动复杂度更高。

还可将 USB 用于维护/升级，PCIe 用于运行时数据；但两条通路必须有一致的 reset/firmware ownership，避免 USB 正在升级时 PCIe DMA 仍运行。

控制面可以 USB、数据面 PCIe；也可以 PCIe 控制 + 网络数据。关键是业务语义、带宽/延迟、拓扑、软件生态、热插拔和安全边界，而不是只比较峰值数字。

**参考资料**

- [USB 2.0 Specification - USB-IF](https://www.usb.org/document-library/usb-20-specification)
- [PCI-SIG Specifications](https://pcisig.com/specifications)

## 七、同一个问题的对象映射

| 工程问题 | USB | PCIe |
| --- | --- | --- |
| 根节点是谁 | Host Controller/Root Hub | Root Complex/Root Port |
| 拓扑节点 | Hub、Device | Bridge/Switch、Function |
| 软件总线对象 | `usb_bus`/`usb_device` | `pci_bus`/`pci_dev` |
| 驱动绑定单位 | 常为 `usb_interface` | `pci_dev` Function |
| 发现输入 | Descriptor Hierarchy | Configuration Space Header/Capability |
| 数据通道 | Endpoint/Pipe/URB | BAR MMIO + DMA Queue/Descriptor |
| 地址 | USB Device Address + Endpoint | BDF + MMIO/IOVA/PCI Address |
| 异步通知 | Host 周期调度 IN | INTx/MSI/MSI-X Device Message |
| 热移除 callback | `disconnect` | `remove`/Hotplug/AER |

“都是 Bus Driver”只说明都接入 Driver Core，不能推出资源与停止方法相同。

## 八、Root Ownership 与事务发起权

USB Host 发起所有总线事务。

Device 有数据也要等 Host 调度 IN Token。

PCIe Endpoint 可作为 Requester 主动发 Memory Write/Read、MSI Message，Root Complex 负责路由与系统集成。

```mermaid
flowchart LR
    UH[USB Host] --> TOKEN[Token/transaction scheduling]
    TOKEN --> UD[USB Device Endpoint]
    PRC[PCIe Root Complex] <--> FAB[PCIe fabric routing]
    FAB <--> PEP[PCIe Endpoint Requester/Completer]
    PEP --> MSI[MSI-X Memory Write]
    PEP --> DMA[DMA Memory Request]
```

这决定了 USB Interrupt Endpoint 与 PCIe MSI-X 不是同一种“中断”。

前者是 Host 保证轮询周期，后者是 Endpoint 主动发 Message TLP。

## 九、发现过程的输入与输出

USB 从 Address 0/EP0 读取 Descriptor，分配 Device Address，选择 Configuration，发布 Interface。

PCIe 按 BDF 读 Configuration Space，递归扫描 Bridge，分配 Bus Number/BAR/Window，发布 Function。

```mermaid
sequenceDiagram
    participant U as USB Core
    participant UD as USB Device
    participant P as PCI Core
    participant EP as PCIe Function
    U->>UD: reset, address, GET_DESCRIPTOR, SET_CONFIGURATION
    UD-->>U: descriptor hierarchy
    U->>U: publish usb_interface
    P->>EP: config read by BDF, BAR sizing
    EP-->>P: header/capability/BAR mask
    P->>P: assign resources and publish pci_dev
```

USB Descriptor 描述“这个配置有哪些功能端点”。

PCI Configuration Space 同时承载 Function Identity、资源编码和 PCIe Capability。

## 十、地址域不同

USB Device Address 只在当前 Bus 枚举期有效，Endpoint Address 只在 Device/Interface 模式内有效。

PCIe BDF 是拓扑位置，BAR 获得 PCI/CPU MMIO 地址，DMA 使用 DMA Address/IOVA。

```mermaid
flowchart TD
    UADDR[USB bus device address] --> EPADDR[endpoint number/direction]
    EPADDR --> PIPE[Linux USB pipe]
    BDF[PCIe BDF] --> CFG[configuration address]
    BAR[BAR bus address] --> MMIO[CPU ioremap address]
    DMAA[DMA address/IOVA] --> RAM[Host memory]
```

USB URB Buffer 的 DMA 映射由 HCD/usbcore 数据路径处理。

PCIe Function Driver 直接为设备 DMA Engine 建立 DMA Mapping。

## 十一、资源获取方式不同

USB Interface Driver 的主要资源来自已激活 Alternate Setting：Endpoint Descriptor、Pipe、URB、Buffer、PM Reference。

PCI Driver 取得 Function、BAR Region、MMIO Mapping、DMA Mask、Bus Master、IRQ Vector 与 Device Queue。

| 阶段 | USB | PCIe |
| --- | --- | --- |
| enable | Configuration/Alt 已由 Core 管理 | `pci_enable_device_mem` |
| claim | Interface 已绑定；可 claim 关联 Interface | `pci_request_regions` |
| map | URB Buffer/HCD DMA | `pci_iomap` + DMA API |
| notify | Interrupt URB | `pci_alloc_irq_vectors` + IRQ |
| stop | kill URB/anchor | stop DMA, sync IRQ, free Ring |

## 十二、带宽分配与背压

USB Host Controller 在 Frame/Microframe 中调度，周期性 Endpoint 预留机会，Bulk 使用剩余时间。

PCIe 用 Credit、Tag、MPS/MRRS、Outstanding、Queue Depth 与 Memory System 形成吞吐。

```mermaid
flowchart LR
    USBINT[USB periodic endpoints] --> UHC[Host schedule]
    USBB[USB bulk] --> UHC
    UHC --> TIME[frame/microframe bus time]
    SQ[PCIe descriptor queue] --> TLP[TLP generation]
    CREDIT[link credits/tags] --> TLP
    TLP --> MEM[DMA/memory/completion]
```

USB NAK 通常表示某次 Transaction 暂时未就绪。

PCIe Queue Full 是 Driver/Device Descriptor Capacity 的背压。

上层都需要传播背压，但机制不同。

## 十三、错误恢复单位

USB 常按 Endpoint clear halt、Interface reset、Device reset、Port reset/重新枚举扩大范围。

PCIe 按 Queue reset、FLR、PM reset、Secondary Bus/Hot Reset、Slot Power Cycle 扩大范围。

USB reset 可能重新读取/比较 Descriptor。

PCIe reset 需要恢复 Configuration、BAR/Bus Master、MSI-X 与 Device 私有 Queue。

两者共同原则：先阻止新请求并停止异步数据面，确认旧 DMA/Request 不再发生，再回收并重建。

## 十四、电源管理

USB 有 autosuspend、Selective Suspend、Remote Wakeup 和 Link Power Management。

PCIe 有 Function D-state、ASPM、L1SS、PME 与 runtime PM。

USB Interface PM 可能共享同一物理 Device 的电源事实。

PCIe Multi-function/Bridge/Link 也可能共享上游资源。

功能驱动都不能只修改自己看到的一个 bit 而忽略 Parent/Link/Platform。

## 十五、安全模型

USB Device 不能直接以 PCIe Requester 身份访问任意 Host Memory；Host Controller 代为 DMA URB Buffer。

PCIe Bus Master 能直接发 DMA Transaction，因此 IOMMU、DMA API、ACS/Group 与 reset/quiesce 更关键。

USB Device 仍可通过恶意 Descriptor/Length 攻击 Host Parser，所以 Descriptor 必须防御解析。

两者安全风险不同，不是“USB 安全、PCIe 不安全”的二元结论。

## 十六、设备选择

USB 适合标准 Class、即插即用、外接线缆、成本敏感和跨平台设备。

PCIe 适合低延迟、高带宽、深 Queue、Peer/Accelerator、NVMe/NIC/GPU/FPGA。

某些产品同时使用：USB 做管理/升级/调试，PCIe 做数据面。

选择应比较带宽、延迟、热插拔、布板/连接器、驱动复杂度、IOMMU、安全与生态。

## 十七、Linux 6.12 一手资料

- [Linux 6.12 USB API](https://www.kernel.org/doc/html/v6.12/driver-api/usb/usb.html)
- [Linux 6.12 PCI driver API](https://www.kernel.org/doc/html/v6.12/driver-api/pci/pci.html)
- [Linux USB power management](https://docs.kernel.org/driver-api/usb/power-management.html)
- [Linux PCI subsystem](https://docs.kernel.org/PCI/index.html)
- [PCI-SIG specifications](https://pcisig.com/specifications)

## 十八、请求完成与取消的共同不变量

USB URB 和 PCIe DMA Request 的共同点：

- 发布前对象、缓冲和回调全部有效。
- 发布后硬件/控制器拥有请求，CPU 不提前释放。
- Completion 只发布当前 generation 的结果。
- stop 先阻止新提交，再同步取消/静止。
- 用户接口先撤销新入口，外部引用最后释放。

不同点是 USB Core/HCD 提供通用 URB 取消，PCIe Function Driver 必须按设备协议停止 DMA Queue。

这也是从 USB Driver 迁移到 PCIe Driver 时最需要提高的责任范围。

## 十九、上下层协议的边界

USB Class Specification 常统一定义 Host/Device 控制与数据格式。

PCIe 只定义互连、配置、事务与能力；NVMe、Ethernet、GPU、FPGA Accelerator 的业务 Queue 是各自协议。

所以“会 PCIe”不等于“会 NVMe”，就像“会 USB”不等于掌握所有 UVC/UAC 细节。

总线机制解决运输和发现，上层协议决定消息、队列、错误与用户语义。

工程文档应分别写总线合同和业务协议合同，避免把二者混成一份寄存器/命令清单。

## 二十、小结

USB 以 Host/Endpoint/Transfer 为核心，PCIe 以 RC/Endpoint/Transaction/Address 为核心。Descriptor 与 Configuration Space、URB 与 DMA Ring、disconnect 与 remove/reset 不能机械一一对应。

下一篇从 Linux Driver Core 视角比较两类驱动对象和所有权迁移。
