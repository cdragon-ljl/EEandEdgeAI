# USB 与 PCIe 全系列参考框架重写设计

**状态：** 已确认
**日期：** 2026-08-28

## 目标

以 Linux 6.12 LTS 为唯一代码与 API 基线，全面重构 USB 与 PCIe 两个系列。野火 LubanCat RK356x USB/PCI 文档作为知识组织、教学顺序、结构体/API 选择和实验闭环的质量参考；Linux 官方文档、Linux 6.12 LTS 内核源码、USB-IF/PCI-SIG 公共规范作为技术事实来源。Linux 6.18 LTS 若存在值得说明的接口变化，以差异说明出现，不改变主线代码版本。

重写后，USB 系列包含 14 篇正式文章，PCIe 系列包含 22 篇正式文章。文章应达到“读者能从框架对象一路追到数据传输、错误回滚、设备移除和调试”的深度，而不是概念清单或零散 API 速查。

## 读者与平台边界

- 读者具备 C 语言、Linux 用户态和基本内核模块经验，但不预设 USB/PCIe 驱动经验。
- 主线 API 使用 Linux 6.12 LTS；涉及 Linux 6.18、6.6、6.1 或 vendor 旧内核接口时明确标注版本差异。
- 示例使用平台无关的 Linux 驱动骨架；需要硬件背景时可采用 RK356x、DWC3/xHCI、DesignWare PCIe 或通用 Endpoint 示例。
- MCU USB 作为 Linux USB 主线后的扩展，只使用当前 CherryUSB 官方接口重新核实。
- 不把 RK356x 4.19 BSP 的结构体字段和函数签名直接当作 Linux 6.12 LTS 事实。

## 来源与引用规则

资料优先级：

1. Linux 6.12 LTS 官方文档与目标版本内核源码；
2. USB-IF、PCI-SIG、PCIe ECN 等可公开获取的规范资料；
3. 芯片/控制器官方 binding、数据手册和驱动文档；
4. 野火 LubanCat RK356x 驱动教程，用于教学框架、知识密度和实验组织参考。

野火网页只显示版权声明，没有展示允许全文复制的文档许可证。因此允许借鉴章节逻辑、知识点组合、结构体字段分类、API 选择和实验思路；正文、图表和代码必须重新编写。引用野火特有实验或结论时提供原始链接，不整段复制文字或完整示例代码。

## USB 系列结构：14 篇

| 顺序 | 主题 | 核心交付 |
|---:|:---|:---|
| 1 | USB 拓扑、速度、Transaction 与四类 Transfer | 建立 Host 主导、总线时间、Endpoint/Pipe 和调度模型 |
| 2 | 枚举状态机 | 从连接检测、Port Reset、地址分配到 SET_CONFIGURATION |
| 3 | 描述符体系 | Device、Configuration、Interface、IAD、Endpoint、BOS 与 class-specific 描述符 |
| 4 | Linux USB 子系统架构 | HCD、Root Hub、USB Core、Interface Driver 与设备模型 |
| 5 | USB 核心对象 | `usb_device`、`usb_interface`、altsetting、endpoint、ID table 的生命周期和关系 |
| 6 | USB Core API 与 Pipe helper | 注册、endpoint helper、pipe 构造、DMA coherent buffer 与同步调用边界 |
| 7 | URB 生命周期 | alloc/fill/submit/completion/anchor/kill、DMA、取消和并发关闭 |
| 8 | Interface Driver 生命周期 | probe、disconnect、reset、autosuspend、remote wakeup 与 teardown |
| 9 | HID 键盘鼠标驱动 | Boot Protocol、Report、Input 子系统映射、热拔插和 usbhid 冲突 |
| 10 | 厂商 Bulk 设备驱动 | 异步收发、字符设备、FIFO、poll、背压和 disconnect |
| 11 | USB Class 驱动 | HID、MSC、CDC ACM、UVC、UAC 的对象与协议边界 |
| 12 | Gadget 与 Composite | UDC、EP0、usb_request、ConfigFS、FunctionFS 和 role switch |
| 13 | Host Controller bring-up | xHCI、DWC3、PHY、regulator、设备树、HCD/root hub 和角色切换 |
| 14 | USB 调试与 MCU 扩展 | usbmon、Wireshark、dynamic debug、协议分析仪及 CherryUSB 对照 |

## PCIe 系列结构：22 篇

| 顺序 | 主题 | 核心交付 |
|---:|:---|:---|
| 1 | PCIe 拓扑、Lane、Link、协议三层与 TLP | 建立事务、链路、物理层和流量控制模型 |
| 2 | BDF、Configuration Space 与枚举 | 理解 Type 0/1 header、桥递归扫描和资源发现 |
| 3 | BAR、资源窗口、ATU 与 MMIO | 解释 sizing、resource tree、地址转换和访问顺序 |
| 4 | Linux PCI Core | `pci_bus`、`pci_dev`、`pci_ops`、资源树和设备模型 |
| 5 | PCI Driver 生命周期与 API | id table、register、enable、regions、iomap、master、remove 与 PM |
| 6 | PCI Explorer 驱动 | 标准头、Capability/Extended Capability、BAR 和只读 sysfs 浏览器 |
| 7 | INTx、MSI、MSI-X | vector 分配、affinity、threaded IRQ、队列映射和释放 |
| 8 | DMA API 与内存顺序 | DMA mask、coherent/streaming mapping、barrier 与所有权 |
| 9 | DMA Descriptor Ring | descriptor 发布、doorbell、completion、回收、generation 和 reset |
| 10 | IOMMU 与高级地址能力 | IOVA、SWIOTLB、ATS、PRI、PASID、SVA 与 fault |
| 11 | PCIe 电源管理 | D0-D3、ASPM、CLKREQ、runtime PM、save/restore 和唤醒 |
| 12 | 错误与复位 | AER、FLR、Hot Reset、error handlers 与恢复状态机 |
| 13 | PCIe 性能模型 | TLP、MPS、MRRS、Tag、Credit、Read RTT 与吞吐上限 |
| 14 | PCIe 网卡源码 | probe、DMA ring、NAPI、MSI-X、skb、PM 与 remove |
| 15 | RC/EP 硬件 bring-up | PERST#、REFCLK、CLKREQ#、LTSSM、配置空间和链路稳定性 |
| 16 | Linux PCI Endpoint Framework | EPC/EPF、BAR、MSI、inbound/outbound window 与配置 |
| 17 | 多队列高吞吐设计 | MSI-X、多 queue、batch、backpressure、reset 和长稳 |
| 18 | PCIe 系统调试 | lspci、setpci、sysfs、debugfs、AER、IOMMU fault 和链路证据 |
| 19 | USB/PCIe 总线模型对比 | 发现、资源、数据通道、热插拔和错误单位 |
| 20 | USB/PCIe 驱动框架对比 | interface/URB 与 function/BAR/DMA queue 的生命周期 |
| 21 | USB/PCIe 调试证据链对比 | 软件日志、trace、协议分析和硬件工具的证明边界 |
| 22 | USB/PCIe 面试与工程设计题 | 从结构体、状态机和错误路径推导答案 |

## 单篇写作合同

每篇必须按主题需要覆盖以下内容：

- 概念定义及其在整个子系统中的位置；
- 关键内核对象、结构体字段、所有权和生命周期；
- 注册、匹配、probe、数据传输、停止、remove 和错误回滚；
- Linux 6.12 LTS 源码目录、核心调用点和版本差异；
- 可编译的核心代码，完整标注上下文、依赖和释放路径；
- 热插拔、并发、电源管理、超时、复位与资源释放；
- 用户态验证、内核日志、sysfs/debugfs 和协议工具；
- 常见现象、根因和分层排查路径；
- 至少 5 张有信息量的 Mermaid 图；
- Linux 官方文档、内核源码、规范和野火参考链接。

篇幅不作为唯一质量标准，但框架、核心对象/API 和完整实验通常应达到 450–700 行；单一机制通常应达到 300–500 行。禁止通过项目树、重复命令、练习清单和空泛总结填充篇幅。

## 代码标准

- 所有 Linux 内核代码按 Linux 6.12 LTS 重新编写，并在文章中声明版本基线；Linux 6.18 差异不得混入 6.12 示例。
- 示例必须体现正常路径、失败回滚、remove/disconnect、并发停止和 PM 边界。
- USB 代码不得从野火 4.19 键鼠实验直接复制；重新实现 HID、Bulk、URB、HCD 和 Gadget 示例。
- PCIe 代码重新实现 Explorer、DMA ring、IRQ、网卡调用链和 Endpoint 示例。
- 硬件寄存器和 descriptor 格式若无公开硬件定义，使用清晰的教学设备协议，不伪装成真实芯片寄存器。

## 迁移与兼容性

- USB 从 10 篇调整为 14 篇，PCIe 从 16 篇调整为 22 篇。
- 文件名、frontmatter `order` 和显示标题统一重新编号。
- 所有已发布旧 URL 生成静态重定向到新地址。
- USB/PCIe 比较文章保留在 PCIe 系列尾部，作为跨总线综合内容。
- 同步更新两个系列框架、README 篇数、站点内容测试和搜索索引。
- 重写分 USB、PCIe、综合对比三个批次进行，每批通过内容契约、完整测试和生产构建后再进入下一批。

## 测试与验收

- 为每篇建立必须覆盖的结构体、API、状态机、源码路径和 teardown/error 关键词契约。
- 检查正式文章数量、连续编号、frontmatter、标题与文件名一致。
- 每篇至少 5 个 Mermaid block，并通过 Astro/Mermaid 构建。
- 禁止追加统一模板、重复练习或与主题无关的结尾来满足行数。
- 验证所有旧 URL 对应的静态重定向页面均生成并指向正确新地址。
- 运行 Git 跟踪测试、USB/PCIe 内容测试和生产构建；构建必须 0 errors。

## 非目标

- 不复制野火文档正文或完整代码。
- 不把 Linux 4.19 API 当作 Linux 6.12 LTS 事实。
- 不扩展到完整 USB 协议规范或 PCIe Base Specification 的逐字段翻译。
- 不在本次重写中修改 BSP、Linux 驱动、音视频或其它系列正文。
