# PCIe 系列野火框架对齐设计

## 1. 调整目标

重新设计 PCIe 系列的学习顺序和文章内部讲解层次，使没有 PCIe 基础的读者能够先理解“PCIe 是什么、解决什么问题、系统由哪些层组成”，再进入 Linux 对象、API、真实驱动和实验，最后学习 IOMMU、电源、错误恢复、性能和 RC/EP 等高级主题。

本次调整不是只修改第 01 篇，也不是对现有 18 篇做表面润色。现有系列虽然包含较多知识点，但存在以下结构问题：

- 第 01 篇在定义 PCIe 之前使用 `readl()`、BAR、TLP、LTSSM 和 DMA。
- 第 03 篇在说明 BAR 之前使用 `pci_iomap()`、Resource 和 ATU。
- 第 04 篇缺少 Linux PCI 子系统整体架构，直接进入 `pci_dev` 等对象。
- 第 05 篇偏重生命周期推导，缺少函数级 API 参考层。
- 第 07 篇使用 DMA Completion 引出中断，但 DMA 在第 08 篇才正式讲解。
- 第 08 篇没有先完整定义 DMA、使用动机和 CPU/DMA 分工。
- 第 09 篇在充分定义 Descriptor 之前进入 Ring Ownership。
- 18 篇被统一的“先看问题、本篇检查点、下一篇”模板约束，文章结构一致但不代表概念依赖正确。

## 2. 野火资料的使用方式

主要参考：

- [野火 Linux PCI 子系统章节](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_pci_subsystem.html)
- Linux 6.12 官方文档、头文件与内核源码。
- PCI-SIG 公开规范资料。

对野火资料采用以下原则：

- 深度参考章节顺序、概念覆盖、解释角度、函数分类和案例组织。
- 野火讲到的 PCIe 基础概念、核心结构、核心函数和实验观察必须逐项映射，不能遗漏后再用高级主题补篇幅。
- 可以沿用通用术语、标准 API、公开设备 ID、标准命令和事实性结论。
- 正文重新组织和表达，不大段复制原文；引用野火特有判断、案例或实验组织时明确注明来源。
- 代码以 Linux 6.12 为基线重新编写或直接分析 Linux 6.12 主线源码，不复制野火实验源码。
- RTL8822CE/RTL8821CE 只在驱动源码和观察案例中出现，不成为整个系列主角。

## 3. 总体学习顺序

前 10 篇使用野火章节的核心骨架，后 8 篇作为 Linux 6.12 与嵌入式产品开发扩展。

| 新顺序 | 文章主题 | 野火框架对应 | 当前内容来源 |
| ---: | --- | --- | --- |
| 01 | PCIe 是什么：历史、用途、拓扑、Link、TLP 与全景概念 | 8.1 基础知识 | 当前 01 重写 |
| 02 | 配置空间、BDF 与递归枚举 | 8.1 配置空间/拓扑 | 当前 02 深化 |
| 03 | BAR、三类资源空间、地址转换与 MMIO | 8.1 BAR/三类空间/DBI | 当前 03 深化 |
| 04 | Linux PCI 子系统整体架构 | 8.2 总体架构 | 当前 04 拆分重写 |
| 05 | 核心数据结构 | 8.3 核心结构 | 当前 04/05 拆分重写 |
| 06 | 核心函数与驱动生命周期 | 8.4 核心函数 | 当前 05 重写 |
| 07 | Linux 6.12 `rtw88` PCI 驱动源码案例 | 8.5 网卡驱动源码 | 当前 14 前移重写 |
| 08 | PCI Explorer：配置、Capability、BAR 与 sysfs | 8.6 Explorer 实验 | 当前 06 后移深化 |
| 09 | DMA 基础、Descriptor 与 Ring | 8.7 PCI DMA 实验 | 当前 08/09 合并重组 |
| 10 | INTx、MSI、MSI-X 与 IRQ | 8.8 PCI IRQ 实验 | 当前 07 后移重写 |
| 11 | IOMMU、SWIOTLB、ATS、PRI、PASID 与 SVA | Linux 6.12 扩展 | 当前 10 |
| 12 | PM、ASPM、L1SS、CLKREQ# 与 Runtime PM | 8.1 ASPM/CLKREQ 扩展 | 当前 11 |
| 13 | AER、FLR、Hot Reset 与 Recovery | 8.1 AER 扩展 | 当前 12 |
| 14 | TLP 性能、MPS、MRRS、Tag 与 Credit | 8.1 TLP 扩展 | 当前 13 |
| 15 | RK356x RC/EP 硬件与 Link Bring-up | 硬件适配层扩展 | 当前 15 |
| 16 | Linux PCI Endpoint Framework | Endpoint 扩展 | 当前 16 |
| 17 | Multi-Queue、DMA、MSI-X 与高吞吐 | 产品化扩展 | 当前 17 |
| 18 | `lspci`、AER、IOMMU 与系统化调试 | 综合调试扩展 | 当前 18 |

## 4. 前 10 篇详细职责

### 4.1 第 01 篇：PCIe 是什么

第 01 篇必须从定义开始，在第一次出现 `readl()`、BAR、TLP、LTSSM 或 DMA 之前完成以下内容：

1. PCIe 全称、定位和典型用途。
2. 为什么需要高速通用互连。
3. PCI 到 PCIe 的演进：保留软件模型，改变电气与传输方式。
4. PCIe 与 USB、片上总线、传统 PCI 的基本区别。
5. Root Complex、Root Port、Switch、Endpoint、Function 的定义。
6. Link、Lane、x1/x4/x8/x16、Generation 与全双工。
7. Configuration、Memory、I/O 三类资源空间的概览。
8. 配置空间、BAR、中断、DMA、ASPM、AER 在整个系统中的位置图。
9. TLP、三层协议和 LTSSM 的入门级说明。
10. 最后再用 CPU 访问设备寄存器的路径串联上述概念。

第 01 篇不进入 Linux API 细节，不假设驱动已经映射 BAR，不以寄存器读取作为读者的第一项知识。

### 4.2 第 02 篇：配置空间与枚举

先说明配置空间是什么、为什么普通地址尚未分配时仍能访问，再进入 BDF、Type 0/Type 1 Header、ECAM、Bus Number、递归扫描和 Capability。

RTL8822CE 的 `10ec:c822` 可以作为标准配置字段案例，但输出必须标明是参考格式或真实采集，不能混淆。

### 4.3 第 03 篇：BAR 与三类资源空间

开头先定义 BAR 及其用途，再解释 BAR 类型、Sizing、Linux Resource、Bridge Window、CPU/PCI/EP 地址域和 ATU。`pci_request_regions()`、`pci_iomap()` 与 MMIO Accessor 只能在这些概念建立后出现。

补充野火框架中的 PCI Configuration、Memory、I/O 三类空间，以及 DBI 在 DesignWare 类控制器中的定位。DBI 是控制器实现概念，不推广为所有 Endpoint 的统一空间。

### 4.4 第 04 篇：Linux PCI 子系统整体架构

在介绍结构体之前建立四层架构：

```text
硬件适配层：Firmware、Host Controller、PHY、ATU、pci_ops
PCI Bus Core：扫描、对象、资源、Capability、Driver Match
功能驱动层：网卡、NVMe、GPU、FPGA、自定义设备
用户交互层：sysfs、lspci、子系统接口、用户设备节点
```

解释每层输入、输出和责任边界，再引出下一篇核心结构。

### 4.5 第 05 篇：核心数据结构

以野火 8.3 为最低覆盖，完整介绍：

- `struct pci_dev`
- `struct pci_driver`
- `struct pci_bus`
- `struct pci_device_id`
- `struct pci_ops`

补充 Linux 6.12 的 `pci_host_bridge`、`struct device`、`struct resource`。每个结构都说明由谁创建、关键字段、生命周期、谁持有引用，以及与相邻对象的关系。

### 4.6 第 06 篇：核心函数与驱动生命周期

按功能分类并提供原型、参数、返回值、调用前提、状态变化和对称清理：

- 注册与注销：`pci_register_driver()`、`pci_unregister_driver()`。
- Enable/Disable：`pci_enable_device()`、`pci_enable_device_mem()`、`pci_disable_device()`。
- 配置访问：`pci_read_config_*()`、`pci_write_config_*()`。
- BAR Resource：`pci_resource_start()`、`pci_resource_len()`、`pci_resource_flags()`、`pci_request_regions()`。
- Mapping：`pci_iomap()`、`pci_iounmap()`。
- Driver Data：`pci_set_drvdata()`、`pci_get_drvdata()`。
- Capability：`pci_find_capability()`、`pci_find_ext_capability()`。
- Bus Master：`pci_set_master()`、`pci_clear_master()`。
- PM State：`pci_save_state()`、`pci_restore_state()`。

生命周期和错误回滚仍然保留，但不能替代函数级参考。

### 4.7 第 07 篇：真实驱动源码

使用 Linux 6.12 `rtw8822ce.c` 和 `rtw88/pci.c`，按以下顺序阅读：

1. PCI ID 与 `pci_driver` 注册。
2. `rtw_pci_probe()`。
3. BAR Resource/Mapping。
4. TX/RX Descriptor Ring。
5. IRQ 与 NAPI。
6. PM/ASPM。
7. Remove、Shutdown 和 Error Handler。

必须区分 PCIe/Linux 通用机制和 Realtek 私有实现。不得声称 Linux 6.12 `rtw88` 使用 MSI-X；该版本申请单个 MSI 或 INTx Vector。

### 4.8 第 08 篇：PCI Explorer

沿野火 Explorer 的观察顺序，但保持通用路径只读：

- 标准配置头。
- Standard/Extended Capability。
- BAR Resource。
- sysfs Attribute。
- `lspci` 对照。
- Probe/Remove 生命周期。

可以借鉴野火输出组织，未知设备不读取或写入私有 BAR。需要真实 BAR 内容案例时，只在公开协议和明确白名单下展示。

### 4.9 第 09 篇：DMA、Descriptor 与 Ring

先定义 DMA，再定义 Descriptor，最后定义 Ring：

```text
CPU 搬运与 DMA 搬运的区别
-> CPU Virtual / Physical / DMA Address
-> DMA Mask 与 Bus Master
-> Coherent / Streaming Mapping
-> 单个 Buffer Ownership
-> Descriptor 的作用和字段
-> Producer / Consumer Ring
-> Doorbell / Completion / Phase
-> Backpressure / Reset / Generation
```

野火 DMA 实验的“结构体、Ring 初始化、寄存器配置、清理、sysfs、Probe/Remove、结果与限制”均要覆盖，但代码和教学协议重新编写。明确说明没有设备公开协议和 Firmware 初始化时不能声称完成真实数据传输。

### 4.10 第 10 篇：IRQ

在读者已经理解 DMA/Descriptor/Completion 后，再解释设备怎样通知 CPU：

- INTx 电平和共享语义。
- MSI 是 Memory Write。
- MSI-X Table/PBA 与多队列。
- `pci_alloc_irq_vectors()`、`pci_irq_vector()`、`request_irq()`、`request_threaded_irq()`。
- Hard IRQ、Threaded IRQ、NAPI/Poll。
- Mask/Clear/Unmask、Lost IRQ 和 Interrupt Storm。
- Probe/Remove/Reset 中的同步与释放。

案例先使用通用设备事件，再用 DMA Completion 说明真实通知，不在 DMA 定义前使用 DMA 作为前置知识。

## 5. 第 11～18 篇调整规则

高级文章总体主题保留，但逐篇执行以下检查：

- 首次出现的概念必须在使用前定义。
- 不用“上一篇已经讲过”代替本篇必要的最小说明。
- 缩写第一次出现时给出全称、中文含义和用途。
- 先讲标准/通用机制，再讲 Linux API，最后讲设备或平台案例。
- 设备私有行为必须明确标注，不推广成 PCIe 标准。
- 实际输出、参考输出、理论计算和教学协议必须区分。
- 删除为了统一模板添加的“先看问题、本篇检查点、下一篇”固定标题；文章按主题选择最合适的结构。

## 6. 文件和 URL 调整

为了让文章编号与学习顺序一致，05～14 的部分主题需要移动。采用以下策略：

- 新 Canonical Filename 与 `order`、标题编号保持一致。
- 当前已上线但主题位置变化的 Slug 加入 `src/pages/pcie/[...legacy].astro` 重定向表。
- 旧链接不得 404，也不得与新 Canonical Route 冲突。
- README、Framework、Article Cross-link 和测试同步更新。

预计发生的主要迁移：

```text
当前 14 rtw88        -> 新 07
当前 06 Explorer     -> 新 08
当前 08 + 09 DMA/Ring -> 新 09
当前 07 IRQ          -> 新 10
当前 10 IOMMU        -> 新 11
当前 11 PM           -> 新 12
当前 12 AER          -> 新 13
当前 13 Performance  -> 新 14
```

## 7. 内容契约与测试调整

删除当前机械指标：

- 开头必须包含“问题/为什么/如何/先看”。
- 每篇必须出现“本篇检查点”。
- 除最后一篇外必须出现“下一篇”。
- 通过因果连接词数量判断解释质量。

新增语义顺序检查：

- 第 01 篇中“PCIe 是/PCI Express 是”的定义早于 `readl()`、BAR、DMA 细节。
- 第 03 篇中 BAR 定义早于 `pci_iomap()`。
- 第 04 篇中子系统四层架构早于核心结构体展开。
- 第 05 篇完整覆盖五个野火核心结构。
- 第 06 篇完整覆盖野火核心函数分类，并包含参数/返回值/清理说明。
- 第 09 篇 DMA 定义早于 `dma_map_*()`，Descriptor 定义早于 Ring 算法。
- 第 10 篇 IRQ 概念建立后再使用 DMA Completion 案例。
- 第 07～10 篇顺序固定为真实驱动、Explorer、DMA、IRQ。
- 18 篇 Frontmatter、编号和 Canonical Filename 连续。
- 所有旧 Slug 重定向到唯一新文章。

测试仍保留：

- Linux 6.12 标记。
- 主题知识点覆盖。
- 至少两个官方一手资料链接。
- Mermaid 语法验证。
- Astro 生产构建和 Pagefind 索引。

## 8. 验收标准

完成后应满足：

- 一个没有 PCIe 基础的读者能从第 01 篇解释 PCIe 的定义、用途、拓扑和核心机制地图。
- 前 10 篇顺序与野火核心教学骨架一致，知识依赖没有倒置。
- 野火 PCI 章节中的基础概念、架构、五个核心结构、核心函数、真实驱动、Explorer、DMA 和 IRQ 均有明确映射。
- 后 8 篇是对 Linux 6.12 和嵌入式产品开发的自然扩展，不阻断基础学习主线。
- 文章没有统一模板痕迹，也不依赖篇幅、图数或连接词配额判断质量。
- 代码保持原创或分析 Linux 6.12 官方源码；野火作为主要参考资料明确引用。
- 旧 URL 可重定向，新 URL、导航、README、测试和构建全部有效。
- 不提交当前工作区中与 PCIe 无关的 `.gitignore` 和机器学习系列改动。
