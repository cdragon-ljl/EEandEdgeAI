# PCIe 系列教学重构设计

## 1. 目标

将 PCIe 系列收缩为 18 篇，在保留 01～18 公开 URL 的前提下，重构讲解顺序、跨篇衔接和示例组织，使读者能够从一个可观察现象出发，逐步建立 PCIe 接口与 Linux PCI 子系统的完整认知模型。

本次重构解决以下问题：

- 术语出现早于解释，单段信息密度过高。
- 结构体、API 和限制条件被并列罗列，缺少因果关系。
- 抽象对象多，配置空间、BAR、IRQ 和 DMA 等具体状态少。
- 正常路径尚未讲清，就提前进入并发、复位、错误恢复等高级分支。
- 代码只说明职责，缺少输入、状态变化、返回结果和清理责任的执行追踪。
- 文章之间像专题合集，读者无法复用上一篇建立的知识。
- 示例设备容易抢占主题，使 PCIe 教程变成某一款芯片的驱动教程。

重构后的系列以 PCIe 通用机制为主角，以 Linux 6.12 PCI 子系统为实现基线。RTL8822CE、RTL8821CE、NVMe、RK356x Root Complex 和 `pci_epf_test` 只在适合的知识点中充当局部案例。原有 19～22 的 USB/PCIe 对比文章删除，不再承担跨总线综合内容。

## 2. 非目标

- 不把 18 篇文章改写成 RTL8822CE 或 `rtw88` 专题。
- 不复制野火文章的正文、图示或实验源码。
- 不伪造硬件运行日志、寄存器值或实测性能数据。
- 不为了增加篇幅加入与当前知识点无关的完整实验。
- 不用私有 Realtek 寄存器构造可直接加载的危险驱动。
- 不删除 IOMMU、AER、Endpoint Framework、多队列等现有高级主题。
- 不修改 01～18 的文章文件名和对外 URL。
- 不保留 19～22 的 USB/PCIe 对比文章及其导航入口。

## 3. 内容依据

资料优先级如下：

1. PCI-SIG 公开规范资料。
2. Linux 6.12 文档、头文件和内核源码。
3. 芯片厂商公开手册及 Linux 上能够观察的标准信息。
4. 野火 PCI 子系统资料的教学框架和案例组织方式。

引用野火资料时，只借鉴其“基础概念、内核对象、接口、源码案例、观察结果”的递进方式。正文、代码、图示和推导过程重新编写，并保留必要来源说明。

## 4. 核心教学原则

### 4.1 接口机制是主线

整个系列使用一条连续的通用机制链：

```text
拓扑与事务
  -> 配置空间与枚举
  -> BAR 与地址窗口
  -> Linux PCI Core 对象
  -> 驱动匹配和生命周期
  -> 中断
  -> DMA 与 IOMMU
  -> 电源、错误恢复和性能
  -> RC/EP 实现
  -> 系统化调试
```

每篇必须说明它接收了上一篇的什么结论，又为下一篇建立什么前提。

### 4.2 设备只作局部证据

设备案例按知识点选择，不要求同一设备贯穿全部文章：

| 知识点 | 优先案例 | 案例作用 |
| --- | --- | --- |
| BDF、配置空间、Capability、BAR | RTL8822CE/RTL8821CE 的标准 PCIe 信息 | 展示 `lspci` 和 sysfs 可观察结果 |
| Driver Match、Probe、Remove | Linux 6.12 `rtw88` PCI Glue | 展示 PCI Core 与功能驱动的边界 |
| IRQ、DMA Ring | 通用教学设备模型，并以 `rtw88` 或 NVMe 源码作旁证 | 避免把私有寄存器当作 PCIe 通用机制 |
| 多队列和性能 | 网卡与 NVMe 对照 | 说明相同 PCIe 能力如何服务不同数据路径 |
| Root Complex Bring-up | RK356x PCIe 控制器 | 解释 Host 侧时钟、复位、PHY、ATU 和链路训练 |
| Endpoint Framework | Linux `pci_epf_test` | 解释 EP 控制器、EPF 和 Host 测试驱动协作 |
| IOMMU、AER、PM | Linux 通用接口和标准 Capability | 保持机制独立于具体设备 |

案例出现前必须说明“它用于证明哪个通用概念”；案例结束后必须重新总结可迁移到其他设备的结论。

### 4.3 先正常路径，后高级约束

每篇先把最小正常流程讲完整，再增加第二层内容：

1. 读者要解决的问题。
2. 可以直接观察的现象或最小例子。
3. 通用机制的因果推导。
4. Linux 对象、API 和调用链。
5. 失败、并发、清理和生产约束。

不得在主流程建立前集中抛出 AER、D3cold、IOMMU Fault、热拔插等异常术语。

### 4.4 解释状态变化，不只罗列 API

重要 API 使用统一的状态表：

| 项目 | 内容 |
| --- | --- |
| 调用前提 | 哪个对象已经存在，设备处于什么状态 |
| 输入 | 关键参数来自哪里 |
| 核心动作 | PCI Core、设备或资源树发生什么变化 |
| 成功结果 | 驱动此后可以做什么 |
| 失败结果 | 返回值和仍然有效的资源 |
| 对称清理 | 哪个 API 撤销本次动作 |

代码必须沿真实调用顺序讲解，避免把若干函数原型孤立摆放。

### 4.5 图示服务于推导

每张图只承担一种职责：拓扑、地址转换、调用时序、状态机或所有权。图中首次出现的缩写必须在正文中提前解释。

不为了满足图数量而重复绘制同一关系。读者无法从图中回答一个具体问题时，应改成表格、代码追踪或文字推导。

### 4.6 证据边界明确

内容中的数据分为三类并明确标记：

- 实际可观察值：来自公开设备信息、标准工具输出或 Linux 源码。
- 代表性示例值：用于计算和推导，不声称来自真实硬件。
- 教学设备协议：用于原创代码演示，明确说明不能绑定未知真实设备。

没有实机验证的输出不得写成“运行结果”。可以写成“预期结构”或“示例输出”，并解释读者应如何自行核对。

## 5. 系列结构

### 第一阶段：建立 PCIe 接口模型

#### 01 拓扑、Link 与 TLP

- 从 CPU 访问一个 Endpoint 寄存器的问题开始。
- 区分 Root Complex、Root Port、Switch、Endpoint 和 Function。
- 用一次 Memory Read/Completion 解释 Requester、Completer、路由和链路。
- 把 Lane、Link Width、Generation、编码和带宽放到事务模型之后。
- 结尾留下问题：系统如何发现目标 Function。

#### 02 枚举与配置空间

- 从 `0000:01:00.0` 的 BDF 含义开始。
- 逐字节认识 Type 0/Type 1 Header，不先罗列全部字段。
- 用配置读请求解释 ECAM 和控制器配置访问。
- 追踪 Bus Number 分配、VID/DID 读取和桥后扫描。
- 使用 Realtek 网卡的标准配置结果作局部观察案例。

#### 03 BAR、Resource、ATU 与 MMIO

- 从“驱动为何不能直接使用 BAR 寄存器中的数字”开始。
- 依次区分 BAR 需求、PCI Bus Address、桥窗口、CPU Physical Address 和 Kernel Virtual Address。
- 使用一组明确标记的代表性数值完成一次端到端地址换算。
- 再解释 32/64-bit、Prefetchable BAR、Resizable BAR 和 ATU。

### 第二阶段：进入 Linux PCI Core

#### 04 PCI Core 对象模型

- 从枚举结果如何落入 Linux 对象开始。
- 按创建顺序介绍 `pci_host_bridge`、`pci_bus`、`pci_dev` 和 `resource[]`。
- `pci_ops` 只在解释配置访问来源时出现。
- Capability、AER、PM、IOMMU 字段放到对象总览之后。

#### 05 PCI Driver 生命周期与 API

- 沿 `pci_register_driver()` 到 `probe()` 的实际路径讲解匹配。
- 以一个最小通用驱动逐步增加 Enable、Region、Map、DMA、IRQ。
- 每个资源获取动作紧跟失败回滚和对称释放。
- 使用 API 状态表统一解释接口，不堆砌函数清单。

#### 06 PCI Explorer

- 先完成一次只读配置头、Capability 和 BAR Resource 观察。
- 把输出字段逐项对应到 02～05 的知识。
- 再讨论未知设备写配置空间、读写 BAR 和抢占真实驱动的风险。
- Explorer 保持只读，不把 Realtek 私有寄存器纳入通用解析。

### 第三阶段：中断与数据搬运

#### 07 INTx、MSI、MSI-X 与线程化中断

- 从设备如何通知 CPU 开始，而不是从 API 列表开始。
- 先解释 INTx 电平语义，再说明 MSI 为什么是写事务。
- 用 MSI-X Table/PBA 和向量分配建立多队列基础。
- 最后进入 Linux vector API、hard IRQ、threaded IRQ 和清理竞态。

#### 08 DMA API 与内存顺序

- 从“设备看到的地址为什么不一定是 CPU 物理地址”开始。
- 依次解释 coherent、streaming、map/unmap、sync 和 mask。
- 用单个 TX Buffer 完成 CPU 到 Device 的所有权交接。
- 在所有权模型建立后再引入 barrier、cache coherency 和 SWIOTLB。

#### 09 DMA Descriptor Ring

- 从一个描述符的生产、消费和回收开始。
- 再扩展到环形索引、Doorbell、Completion、Wrap 和 Backpressure。
- 教学 Ring 使用原创通用协议；`rtw88`/NVMe 只用于说明真实设备会怎样具体化字段。
- 明确区分 CPU 内存顺序、DMA 可见性和 MMIO 顺序。

#### 10 IOMMU、ATS、PRI、PASID 与 SVA

- 从 08 的 DMA Address 延伸到 IOVA。
- 先讲 IOMMU 映射与 Fault，再讲高级地址共享能力。
- ATS、PRI、PASID、SVA 按依赖顺序引入，不并列定义。

### 第四阶段：生命周期、可靠性与性能

#### 11 PM、ASPM、CLKREQ 与 Runtime PM

- 分开 Device Power State 和 Link Power State。
- 从一次 Runtime Suspend/Resume 状态变化讲解保存、停 DMA、关 IRQ、恢复。
- ASPM、L1SS、CLKREQ 作为链路节能机制单独建立因果关系。

#### 12 AER、FLR、Hot Reset 与 Recovery

- 从一次可恢复错误开始建立错误上报路径。
- 区分错误检测、隔离、复位和驱动恢复回调。
- 再比较 FLR、Secondary Bus Reset 和 Hot Reset 的影响范围。

#### 13 TLP、MPS、MRRS、Tag 与 Credit 性能

- 从一个大块传输拆成多个 TLP 的计算开始。
- 用代表性参数计算 Payload 效率、Outstanding Request 和带宽上限。
- 区分理论链路带宽、协议效率、设备处理能力和尾延迟。

#### 14 真实网络驱动数据路径

- 固定使用 Linux 6.12 `rtw88` PCI Glue 作为案例，并以 RTL8822CE 对应的匹配与数据路径说明为主。
- 只承担“把前面机制组合成真实驱动”的职责。
- 按 TX、RX、IRQ/NAPI、DMA Ring、PM/Remove 路径追踪源码。
- 明确哪些细节属于设备协议，哪些属于 PCIe/Linux 通用机制。

### 第五阶段：控制器、Endpoint 与产品化

#### 15 RC/EP 硬件与 Link Bring-up

- 使用 RK356x 作为局部平台案例。
- 按电源、Clock、Reset、PHY、LTSSM、ATU、枚举的顺序排查。
- 区分控制器私有寄存器和 PCIe 标准配置空间。

#### 16 Linux PCI Endpoint Framework

- 围绕 EPC、EPF、ConfigFS 和 Host Driver 的协作关系展开。
- 使用 `pci_epf_test` 展示 BAR、IRQ 和 DMA 测试如何连接。
- 教学 EPF 代码保持原创并明确硬件前提。

#### 17 Multi-queue、DMA 与 MSI-X 吞吐设计

- 从单队列瓶颈扩展到 Queue/Vector/CPU Affinity。
- 对照网卡和 NVMe，强调架构模式而非设备寄存器。
- 将锁、缓存行、NUMA、批处理和中断调节放在数据路径之后。

#### 18 系统化调试

- 按 Link、Enumeration、Resource、Driver、IRQ、DMA、IOMMU、AER 分层。
- 每层给出观察命令、预期证据和下一步分支。
- 不用命令清单替代故障推理。

## 6. 配套源码设计

现有 Linux 6.12 配套模块保留职责边界：

- `pci_explorer.c`：只读观察标准配置和 Linux Resource。
- `pci_irq_demo.c`：演示通用 IRQ 生命周期，不冒充 Realtek 驱动。
- `pci_dma_ring.c`：演示原创教学协议的 DMA Ring 与所有权。
- `pci_epf_teaching.c`：演示 Endpoint Framework 协作。

源码调整遵守以下规则：

- 虚构 VID/DID 和寄存器 ABI 必须显著标为教学协议。
- 文章不得暗示模块能够直接绑定 RTL8822CE/RTL8821CE。
- Realtek 设备案例通过标准工具和主线 `rtw88` 源码分析完成。
- 代码中的资源获取、失败回滚、并发停止和 remove 对称性必须与正文一致。
- 所有模块继续以 Linux 6.12、`W=1` 编译为最低验证要求。

## 7. 单篇文章模板

每篇按需要使用以下结构，不强制机械保留标题名称：

1. 本篇解决什么问题。
2. 上一篇已经知道什么。
3. 一个可观察例子或代表性场景。
4. 从例子推导通用机制。
5. 对应到 Linux 6.12 对象、API 和调用路径。
6. 代码或命令结果逐项解释。
7. 失败、并发、恢复和安全边界。
8. 常见误解及其原因。
9. 本篇检查点。
10. 下一篇需要解决的问题。

文章不得通过重复摘要、无关实验或大量同义图示填充篇幅。新增内容必须承担概念解释、因果推导、用法说明或证据分析中的至少一项职责。

## 8. 验收标准

每篇文章必须满足：

- 开头用普通语言提出一个具体问题，不以结构体字段或 API 清单开场。
- 首次出现的关键术语在同节给出含义和上下文。
- 至少有一条从现象到 PCIe 机制再到 Linux 实现的完整推导链。
- 重要 API 至少说明前提、状态变化、失败结果和清理责任。
- 主流程可以独立读懂，高级异常内容不会阻断首次阅读。
- 设备案例明确标注用途和可迁移结论。
- 实际值、代表性示例值和教学协议不混淆。
- 结尾能回答开头的问题，并自然引出下一篇。

系列整体必须满足：

- 01～18 的公开 URL 不变，Frontmatter、导航和交叉链接有效。
- 从 01 到 18 形成连续且闭合的 PCIe/Linux 学习路径。
- 删除 19～22 的 Markdown 文件，并清理框架、README、导航和站内链接中的对应入口。
- Markdown、Mermaid、站内链接和 Astro 构建通过。
- Linux 6.12 配套模块以 `W=1` 编译通过。
- 不提交与 PCIe 系列无关的现有工作区改动。

## 9. 实施顺序

按认知依赖分五批实施和检查：

1. 01～03：接口、枚举和地址模型。
2. 04～06：PCI Core、Driver 和只读观察。
3. 07～10：IRQ、DMA Ring 和 IOMMU。
4. 11～14：PM、AER、性能和真实驱动组合。
5. 15～18：RC/EP、Endpoint、高吞吐、系统调试和全系列交叉链接。

每批完成后检查术语依赖、案例边界、前后篇衔接和构建结果，避免在全部重写后才发现系列级结构问题。
