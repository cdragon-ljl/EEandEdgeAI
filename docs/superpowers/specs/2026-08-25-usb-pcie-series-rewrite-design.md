# USB 与 PCIe 系列全面重写设计

## 目标与读者

面向已经写过简单 Linux 字符驱动、理解 `probe/remove`，但尚未系统掌握 USB 与 PCIe 总线的工程师，全面重写 USB、PCIe 和对比/面试系列。文章应当能够作为连续学习手册阅读，而不是独立知识点、API 清单或后置扩展段落的集合。

保留现有 25 篇文章的文件名、URL、顺序和主题边界，新增 `usb-10-mcu-usb-cherryusb-stack.md`。最终 USB 10 篇，PCIe 主线 12 篇，对比与面试 4 篇，共 26 篇。

## 写作原则

- 删除所有 `## 初学者扩展讲解` 及其复制内容，不在“小结”后追加任何新主题。
- 每篇围绕一个中心问题，从设备现象、硬件/协议对象、Linux 内核对象、调用链和调试证据逐步展开。
- 正常路径与异常路径放在同一条叙事中，断开、超时、并发、DMA、中断和资源释放不作为文章末尾的通用补丁。
- 源码摘录只保留影响当前结论的部分，解释结构体字段、所有权、回调上下文和生命周期。
- 不设置篇幅、标题、代码块、表格或 Mermaid 数量指标。完成标准是主线机制已经闭合。
- Mermaid 只用于枚举、驱动绑定、URB、Gadget、DMA、IOMMU、队列和协议栈分层等复杂关系。
- 不复制相同的“阅读方法、实验环境、常用命令、验证闭环”到每篇文章；调试命令必须服务于当前主题。

## USB 主线

1. **架构与枚举**：Host 主导、Device/Interface/Endpoint、EP0 控制传输、地址分配、描述符获取、配置选择和 Linux 枚举对象。
2. **Linux USB 驱动框架**：usbcore、HCD、hub、interface driver、匹配表、probe/disconnect、引用与拔出并发。
3. **描述符**：Device/Configuration/Interface/Endpoint、IAD、字符串、BOS、class-specific descriptor、Linux 解析与错误案例。
4. **URB 与数据传输**：四种传输、pipe、URB 生命周期、提交/完成/取消、短包、zero packet、锚点和断开同步。
5. **设备驱动实战**：从 interface probe 到 endpoint 发现、私有对象、字符接口、异步收发、poll/ioctl、断开和错误回收。
6. **Linux Gadget**：UDC、gadget driver、Function/Configuration、ConfigFS、FunctionFS、EP0 setup、复合设备和主机兼容性。
7. **Class 驱动**：HID、MSC、CDC ACM、UVC/UAC 的协议特征、Linux 驱动绑定、数据路径和适用场景。
8. **问题排查**：按物理连接、枚举、描述符、绑定、URB 和 class 协议分层，使用 usbmon、Wireshark、tracepoint 和动态调试。
9. **Host 控制器与设备树**：OHCI/EHCI/xHCI/DWC2/DWC3、root hub、PHY、clock/reset/regulator、role switch 和 Linux bring-up。
10. **MCU USB 与 CherryUSB**：MCU USB Device/Host/OTG 基础，endpoint FIFO/DMA/cache，CherryUSB v1.6.1 的 core/class/port/OSAL 分层，DCD/HCD 移植，Device/Host 初始化、CDC/MSC/HID 最小示例和调试。

CherryUSB 固定使用官方 release `v1.6.1`、commit `c9625ffa773ad10b8824d1b5361bca2ccc1f3d1e`。文章使用官方仓库、配置模板、STM32/ESP32 demo 和官方文档，不将特定 MCU HAL 行为写成协议栈公共机制。

## PCIe 主线

1. **架构基础**：Root Complex、Endpoint、Switch、lane/link、LTSSM、transaction/data-link/physical 分层与 TLP 基础。
2. **枚举与配置空间**：BDF、Type 0/1 header、Capability/Extended Capability、资源扫描和 Linux pci_bus/pci_dev。
3. **BAR 与 MMIO**：BAR sizing、32/64 位、prefetchable、资源分配、request/iomap、MMIO 顺序与 endian。
4. **Linux PCI 驱动框架**：匹配、enable、regions、DMA mask、bus master、probe/remove、错误回滚和 managed API。
5. **中断**：INTx、MSI、MSI-X、vector allocation、irq affinity、mask/pending、共享中断和中断丢失排查。
6. **DMA**：CPU/物理/DMA 地址、coherent/streaming mapping、descriptor/ring、ownership、memory barrier 和 cache。
7. **IOMMU**：IOVA、domain、映射、隔离、DMA API、fault、SWIOTLB 和虚拟化边界。
8. **驱动实战**：BAR 控制面、DMA 数据面、IRQ 完成、字符设备或 mmap/poll 用户接口、reset/remove 和错误处理。
9. **性能稳定性**：payload/read request、链路宽度速率、队列深度、中断合并、NUMA/affinity、AER 和压力测试。
10. **问题排查**：从 PERST#/REFCLK/LTSSM 到配置空间、BAR、MSI、DMA、IOMMU 和 AER 的分层证据链。
11. **Endpoint bring-up**：FPGA/SoC Endpoint、配置空间/BAR、地址转换、host 枚举、link issue 和最小寄存器通路。
12. **DMA ring + MSI-X**：高吞吐队列设计、producer/consumer、descriptor ownership、doorbell、completion、多个 vector、背压和恢复。

## USB/PCIe 对比与面试

1. **总线模型对比**：枚举主体、拓扑、寻址、事务、热插拔、错误模型和适用设备。
2. **驱动框架对比**：USB interface/URB 与 PCI pci_dev/BAR/DMA/IRQ 的生命周期对照。
3. **调试工具对比**：usbmon/Wireshark 与 lspci/AER/trace 的证据边界，不重复主线排错正文。
4. **面试问题**：使用工程场景考察枚举、资源、异步传输、中断、DMA、IOMMU、断开和恢复，答案必须给出错误推理分析。

## 验证标准

- USB 10 篇 order 连续，PCIe 16 篇 order 连续，原有 25 个 URL 保持不变。
- 全系列不存在 `初学者扩展讲解`，也不存在从“小结”之后重新开启主题的结构。
- 每篇 frontmatter 完整、draft 为 false，正文不存在重复 H1。
- 新 CherryUSB 文章包含固定版本、Device/Host、DCD/HCD、OSAL、Class、移植、最小示例和调试路径。
- 自动测试、Astro check 和生产构建通过；代表性桌面/移动端页面无横向溢出，Mermaid 无渲染错误。
