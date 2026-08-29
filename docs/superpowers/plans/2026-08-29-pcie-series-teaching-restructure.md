# PCIe Series Teaching Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 PCIe 系列从 22 篇收缩为 18 篇，并把 01～18 重写成以 PCIe 通用机制为主线、设备只作局部案例、正常路径先于高级约束的连续教程。

**Architecture:** 保留 01～18 的文件名、Frontmatter 顺序和公开 URL，删除 19～22 及其导航入口。先用内容契约约束文章数量、解释性段落、问题导向开篇、检查点和跨篇衔接，再按“接口模型、PCI Core、中断与 DMA、可靠性与真实驱动、RC/EP 与调试”五批重写；每批只扩展到本批文章的契约，保证提交点可独立验证。

**Tech Stack:** Markdown、Mermaid、Linux 6.12 PCI 文档与源码、Astro 4、Node.js 20 `node:test`

**Spec:** `docs/superpowers/specs/2026-08-29-pcie-series-teaching-restructure-design.md`

## Global Constraints

- PCIe 通用机制是主线，RTL8822CE/RTL8821CE、NVMe、RK356x 和 `pci_epf_test` 只作局部案例。
- Linux API、结构体和源码路径固定到 Linux 6.12。
- 不复制野火正文、图示或实验源码；只参考其教学层次和案例组织。
- 不伪造实机日志、寄存器值或性能结果；代表性数值必须明确标注。
- 不直接操作未知 Realtek 私有 BAR，不暗示教学模块可绑定真实网卡。
- 保留 01～18 的文件名和 URL；删除 19～22 及其站内入口。
- 图示按教学需要保留，不再强制每篇至少五张 Mermaid。
- 不提交 `.gitignore`、`docs/articles/machine-learning/` 或其他现有无关改动。
- 当前 `npm test` 基线为 135 项、132 项通过、3 项机器学习测试失败；PCIe 改写不得新增失败。

---

### Task 1: 收缩为 18 篇并修正内容契约

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `tests/usb-pcie-articles.test.mjs`
- Modify: `tests/legacy-usb-pcie-routes.test.mjs`
- Modify: `tests/site-content-config.test.mjs`
- Modify: `src/pages/usb-pcie/[...slug].astro`
- Modify: `docs/articles/pcie/pcie-framework.md`
- Modify: `README.md`
- Delete: `docs/articles/pcie/pci-19-usb-pcie-bus-model-comparison.md`
- Delete: `docs/articles/pcie/pci-20-usb-pcie-driver-framework-comparison.md`
- Delete: `docs/articles/pcie/pci-21-usb-pcie-debug-evidence-comparison.md`
- Delete: `docs/articles/pcie/pci-22-usb-pcie-interview-design.md`

**Interfaces:**
- Consumes: 规格中的 18 篇序列和“取消 USB/PCIe 对比”决定。
- Produces: `pcieFiles` 恰好包含 01～18；旧 `usb-pcie-01`～`04` 路由统一落到 `/pcie/`；README 统计变为 309 篇。

- [ ] **Step 1: 先把测试期望改为 18 篇**

在 `tests/pcie-reference-rewrite.test.mjs` 删除 `pcieFiles` 与 `topicMarkers` 的 19～22 四项，并把测试名改为 `approved 18-article sequence`。在 `tests/usb-pcie-articles.test.mjs` 和 `tests/site-content-config.test.mjs` 将 PCIe 数量从 22 改为 18、总文章数从 313 改为 309。

在路由测试中使用以下取消后映射：

```js
const canceledComparisonRedirects = {
  'usb-pcie-01-bus-model-comparison': '/pcie/',
  'usb-pcie-02-driver-framework-comparison': '/pcie/',
  'usb-pcie-03-debug-tools-comparison': '/pcie/',
  'usb-pcie-04-interview-questions': '/pcie/',
};
```

- [ ] **Step 2: 运行测试并确认它们因旧文件仍存在而失败**

Run:

```powershell
node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs
```

Expected: PCIe 数量仍为 22、README 仍为 313、旧重定向仍指向 19～22，因此至少三个断言失败。

- [ ] **Step 3: 删除 19～22 并更新框架、README 和旧路由**

`pcie-framework.md` 的描述改为“18 篇学习顺序”，表格以第 18 篇系统调试收尾，并把第 14 篇写成 `rtw88 PCI Glue` 局部源码案例。README 中 PCIe 计数改为 18、总数改为 309。四条旧 USB/PCIe 对比 slug 保留重定向兼容，但目标统一为 `/pcie/`，避免已存在外链变成 404。

- [ ] **Step 4: 运行结构与路由测试**

Run:

```powershell
node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs
```

Expected: 这四个定向测试文件全部通过。三个既有机器学习失败位于另一个测试文件，不应出现在本命令中。

- [ ] **Step 5: 提交 18 篇结构调整**

```powershell
git add -- README.md docs/articles/pcie/pcie-framework.md docs/articles/pcie/pci-19-usb-pcie-bus-model-comparison.md docs/articles/pcie/pci-20-usb-pcie-driver-framework-comparison.md docs/articles/pcie/pci-21-usb-pcie-debug-evidence-comparison.md docs/articles/pcie/pci-22-usb-pcie-interview-design.md src/pages/usb-pcie/[...slug].astro tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs
git commit -m "docs: reduce PCIe series to 18 articles"
```

### Task 2: 重写 01～03，建立接口、枚举与地址模型

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `docs/articles/pcie/pci-01-topology-link-tlp.md`
- Modify: `docs/articles/pcie/pci-02-enumeration-config-space.md`
- Modify: `docs/articles/pcie/pci-03-bar-resource-atu-mmio.md`

**Interfaces:**
- Consumes: 18 篇 `pcieFiles` 序列、PCIe 标准术语、代表性 BDF `0000:01:00.0`。
- Produces: `assertTeachingStructure()` 内容契约；01 的事务模型供 02 使用，02 的枚举结果供 03 使用，03 的资源结果供 04 使用。

- [ ] **Step 1: 增加前三篇教学结构测试**

在 `tests/pcie-reference-rewrite.test.mjs` 增加以下辅助函数，并先只对 `pcieFiles.slice(0, 3)` 调用：

```js
function explanatoryParagraphs(body) {
  return body.split(/\r?\n\s*\r?\n/).filter((paragraph) => {
    const text = paragraph.replace(/`[^`]+`/g, '').trim();
    return text.length >= 80 && !/^(?:#|```|\||[-*] )/.test(text);
  });
}

function assertTeachingStructure(file, index) {
  const markdown = readFileSync(join('docs/articles/pcie', file), 'utf8');
  const body = articleBody(markdown);
  const h2 = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const opening = body.slice(0, 1800);

  assert.match(opening, /问题|为什么|如何|先看/, `${file} must open with a concrete question`);
  assert.ok(h2.length >= 8 && h2.length <= 18, `${file} must keep a readable section count`);
  assert.ok(explanatoryParagraphs(body).length >= 18, `${file} needs explanatory prose, not only lists`);
  assert.ok((body.match(/因为|所以|因此|这意味着/g) ?? []).length >= 8, `${file} needs causal explanation`);
  assert.match(body, /本篇检查点/);
  assert.match(body, index === 17 ? /系列收尾/ : /下一篇/);
}

test('PCIe teaching structure explains mechanisms before constraints', () => {
  pcieFiles.slice(0, 3).forEach(assertTeachingStructure);
});
```

- [ ] **Step 2: 运行前三篇契约并确认失败**

Run:

```powershell
node --test --test-name-pattern "PCIe teaching structure" tests/pcie-reference-rewrite.test.mjs
```

Expected: 01～03 因缺少“本篇检查点”、因果解释或章节数量超限而失败。

- [ ] **Step 3: 重写第 01 篇**

按以下推导顺序重组正文：

```text
CPU 为什么能访问插槽后的设备
-> RC/Root Port/Switch/Endpoint/Function 各自解决什么问题
-> 一次 Memory Read Request 如何产生 Completion
-> Transaction/Data Link/Physical 三层分别增加什么保证
-> Lane、Link Width、Generation 如何影响带宽
-> LTSSM、Credit、Tag、Ordering 作为第二层约束
-> 本篇检查点：能完整讲出一次请求
-> 下一篇：系统如何找到目标 Function
```

保留必要的事务时序图和拓扑图，合并重复的 Link/LTSSM 图。所有缩写在首次出现时解释。

- [ ] **Step 4: 重写第 02 篇**

以 `0000:01:00.0` 为入口，依次讲 Domain/Bus/Device/Function、Type 0 Header、VID/DID、ECAM 地址计算、桥后 Bus Number、递归扫描和 Capability 链。RTL8822CE 的 `10ec:c822` 只用于展示标准字段；若输出不是本机采集，标记为“代表性观察格式”。BAR sizing 只解释枚举阶段为何执行，具体地址模型留给 03。

- [ ] **Step 5: 重写第 03 篇**

使用以下代表性地址完成一条端到端推导，并显式标注它们不是实测值：

```text
BAR0 声明大小：128 KiB
PCI Bus Address：0x4000_0000
RC Outbound Window：PCI 0x4000_0000 -> CPU 0xF800_0000
Linux resource start：0xF800_0000
pci_iomap() 返回：仅表示内核虚拟映射，不给出伪造的固定地址
```

先解释 BAR sizing、桥窗口和地址域，再进入 `pci_request_regions()`、`pci_iomap()`、`readl()/writel()`、posted write 和用户映射安全边界。

- [ ] **Step 6: 验证并提交 01～03**

Run:

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: PCIe 契约与全部 Mermaid 语法通过。

```powershell
git add -- tests/pcie-reference-rewrite.test.mjs docs/articles/pcie/pci-01-topology-link-tlp.md docs/articles/pcie/pci-02-enumeration-config-space.md docs/articles/pcie/pci-03-bar-resource-atu-mmio.md
git commit -m "docs: rebuild PCIe interface foundations"
```

### Task 3: 重写 04～06，建立 PCI Core 与驱动生命周期

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `docs/articles/pcie/pci-04-linux-pci-core-bus-dev-ops.md`
- Modify: `docs/articles/pcie/pci-05-pci-driver-lifecycle-api.md`
- Modify: `docs/articles/pcie/pci-06-pci-explorer-capability-bar-sysfs.md`

**Interfaces:**
- Consumes: 03 产生的枚举、BAR 和 Linux Resource 模型。
- Produces: `pci_dev` 创建顺序、`probe()` 资源状态机和只读 Explorer 证据，供 IRQ/DMA 文章复用。

- [ ] **Step 1: 将教学结构检查扩展到前六篇并确认失败**

把测试调用范围从 `pcieFiles.slice(0, 3)` 改为 `pcieFiles.slice(0, 6)`。

Run:

```powershell
node --test --test-name-pattern "PCIe teaching structure" tests/pcie-reference-rewrite.test.mjs
```

Expected: 04～06 失败，01～03 继续通过。

- [ ] **Step 2: 重写第 04 篇**

从“02 枚举出的 Function 在 Linux 中变成什么”开始，按创建顺序解释 `pci_host_bridge -> pci_bus -> pci_dev -> resource[] -> struct device`。把 `pci_ops` 放回配置访问来源，把 Capability、PM、AER、DMA/IOMMU 字段移到对象模型建立之后。将现有 24 个 H2 合并为不超过 16 个有因果关系的章节。

- [ ] **Step 3: 重写第 05 篇**

沿 `pci_register_driver() -> match -> probe()` 讲解，使用一个最小通用驱动逐步加入 Enable、Region、Map、DMA Mask、IRQ 和业务发布。为 `pci_enable_device_mem()`、`pci_request_regions()`、`pci_iomap()`、`pci_set_master()`、`pci_alloc_irq_vectors()` 分别给出调用前提、状态变化、失败结果和对称清理表；用单一 `goto` 回滚链解释逆序释放。

- [ ] **Step 4: 重写第 06 篇**

先展示只读 Explorer 能得到的配置头、标准/扩展 Capability 和 BAR Resource，再逐字段映射到 02～05。安全限制、`pci_cfg_access_lock()`、D3cold、reset 并发和驱动抢占放在正常读取路径之后。RTL8822CE/RTL8821CE 只作为 `lspci` 标准字段观察例子，不读取私有 BAR。

- [ ] **Step 5: 验证并提交 04～06**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
git add -- tests/pcie-reference-rewrite.test.mjs docs/articles/pcie/pci-04-linux-pci-core-bus-dev-ops.md docs/articles/pcie/pci-05-pci-driver-lifecycle-api.md docs/articles/pcie/pci-06-pci-explorer-capability-bar-sysfs.md
git commit -m "docs: rebuild PCI Core learning path"
```

### Task 4: 重写 07～10，建立 IRQ、DMA 与地址转换链

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `docs/articles/pcie/pci-07-intx-msi-msix-threaded-irq.md`
- Modify: `docs/articles/pcie/pci-08-dma-api-memory-order.md`
- Modify: `docs/articles/pcie/pci-09-dma-descriptor-ring.md`
- Modify: `docs/articles/pcie/pci-10-iommu-swiotlb-ats-pasid-sva.md`

**Interfaces:**
- Consumes: 05 的资源生命周期和 06 的 Capability 观察。
- Produces: vector、DMA ownership、Ring 和 IOVA 模型，供 PM、Recovery、性能和真实驱动案例使用。

- [ ] **Step 1: 将教学结构检查扩展到前十篇并确认失败**

把范围改为 `pcieFiles.slice(0, 10)`，运行定向测试，预期 07～10 失败而 01～06 通过。

- [ ] **Step 2: 重写第 07 篇**

从“设备完成工作后如何通知 CPU”开始，先解释 INTx 的电平与撤销，再解释 MSI 是 Memory Write、MSI-X 的 Table/PBA 和每队列向量。最后进入 `pci_alloc_irq_vectors()`、`pci_irq_vector()`、`request_threaded_irq()`、affinity、mask/synchronize/free 的状态变化和 remove 竞态。

- [ ] **Step 3: 重写第 08 篇**

用一个 TX Buffer 完成 `kmalloc -> dma_map_single -> owner=DEVICE -> device completion -> dma_unmap_single` 的完整交接。区分 CPU Virtual、CPU Physical、DMA Address 和 IOVA；在正常所有权路径之后再讲 coherent/streaming、SG、cache sync、`dma_wmb()`、SWIOTLB 和错误证据。

- [ ] **Step 4: 重写第 09 篇**

先追踪一个描述符从 FREE、CPU_PREPARED、DEVICE_OWNED、COMPLETED 回到 FREE，再扩展到 producer/consumer、wrap、phase bit、doorbell、CQ、backpressure、generation 和 reset。教学协议始终标记为原创模型；`rtw88`/NVMe 只作字段具体化旁证。

- [ ] **Step 5: 重写第 10 篇**

从 08 的 DMA Address 推导 IOVA 和 IOMMU 页表，先解释 Domain、Group、map/unmap、IOTLB 和 Fault，再按“设备缓存翻译 -> 缺页请求 -> 进程身份 -> 地址共享”顺序引入 ATS、PRI、PASID 和 SVA。VFIO 放到隔离模型之后。

- [ ] **Step 6: 验证并提交 07～10**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
git add -- tests/pcie-reference-rewrite.test.mjs docs/articles/pcie/pci-07-intx-msi-msix-threaded-irq.md docs/articles/pcie/pci-08-dma-api-memory-order.md docs/articles/pcie/pci-09-dma-descriptor-ring.md docs/articles/pcie/pci-10-iommu-swiotlb-ats-pasid-sva.md
git commit -m "docs: rebuild PCIe interrupt and DMA path"
```

### Task 5: 重写 11～14，建立 PM、Recovery、性能与真实驱动组合

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `docs/articles/pcie/pci-11-power-aspm-clkreq-runtime-pm.md`
- Modify: `docs/articles/pcie/pci-12-aer-flr-hot-reset-recovery.md`
- Modify: `docs/articles/pcie/pci-13-performance-tlp-mps-mrrs-credit.md`
- Modify: `docs/articles/pcie/pci-14-network-driver-ring-napi-msix.md`

**Interfaces:**
- Consumes: 07～10 的 IRQ、DMA、Ring 和 IOMMU 状态。
- Produces: suspend/recovery/performance 状态机和 Linux 6.12 `rtw88` PCI Glue 局部源码案例。

- [ ] **Step 1: 将教学结构检查扩展到前十四篇并确认失败**

把范围改为 `pcieFiles.slice(0, 14)`，运行定向测试，预期 11～14 失败。同时把第 14 篇 `topicMarkers` 从 `igc/NAPI/MSI-X` 改为 `rtw88`、`rtw_pci_probe`、`descriptor ring` 和 `PCI Glue`，防止旧案例约束回流。

- [ ] **Step 2: 重写第 11 篇**

先分开 Function Power State 与 Link Power State，再沿一次 Runtime Suspend/Resume 解释停止提交、排空 DMA、mask IRQ、保存状态、进入低功耗和逆序恢复。D3cold、PME、ASPM、L1SS、CLKREQ# 和 System Suspend 在主状态机后展开。

- [ ] **Step 3: 重写第 12 篇**

从一个 Correctable/Non-Fatal/Fatal 错误的上报现象开始，沿 AER Root Port、`pci_error_handlers`、quiesce、reset、resume 建立恢复链。最后比较 FLR、PM Reset、Secondary Bus Reset 和 Hot Reset 的作用范围，不在开头并列术语。

- [ ] **Step 4: 重写第 13 篇**

用一笔 4096-byte 传输在 MPS=256 与 MPS=512 下拆分 TLP，计算 Header/Link 开销和 Outstanding Read 需求，再解释 MRRS、Tag、Credit、RCB、Queue Depth、Batch 和 P99。所有计算标为理论示例，实测章节只提供测量方法。

- [ ] **Step 5: 将第 14 篇改为 `rtw88` 局部源码案例**

以 Linux 6.12 `drivers/net/wireless/realtek/rtw88/pci.c` 为主路径，依次说明 PCI ID 匹配、`rtw_pci_probe()`、BAR/IRQ/DMA Ring 建立、TX/RX 描述符、IRQ 后半部、PM/Remove。开篇明确：本篇用于证明前面机制如何组合，不把 Realtek 私有寄存器推广成 PCIe 规范；NAPI/MSI-X 等并非 `rtw88` 当前路径的机制时，改为对照说明并留到第 17 篇。

- [ ] **Step 6: 验证并提交 11～14**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
git add -- tests/pcie-reference-rewrite.test.mjs docs/articles/pcie/pci-11-power-aspm-clkreq-runtime-pm.md docs/articles/pcie/pci-12-aer-flr-hot-reset-recovery.md docs/articles/pcie/pci-13-performance-tlp-mps-mrrs-credit.md docs/articles/pcie/pci-14-network-driver-ring-napi-msix.md
git commit -m "docs: rebuild PCIe reliability and driver case study"
```

### Task 6: 重写 15～18，以 RC/EP 和系统调试收尾

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `docs/articles/pcie/pci-15-rc-ep-hardware-link-bring-up.md`
- Modify: `docs/articles/pcie/pci-16-linux-pci-endpoint-framework.md`
- Modify: `docs/articles/pcie/pci-17-multiqueue-dma-msix-throughput.md`
- Modify: `docs/articles/pcie/pci-18-system-debug-lspci-aer-iommu.md`

**Interfaces:**
- Consumes: 01～14 的完整机制链。
- Produces: RK356x RC Bring-up、`pci_epf_test` 协作、多队列产品化和最终分层调试闭环。

- [ ] **Step 1: 将教学结构检查扩展到全部十八篇并确认失败**

把范围改为 `pcieFiles`，并让第 18 篇匹配“系列收尾”而不是“下一篇”。运行定向测试，预期 15～18 失败。

- [ ] **Step 2: 重写第 15 篇**

以 RK356x 为局部平台案例，严格按供电、REFCLK、PERST#、Reset/Clock、PHY、LTSSM、ATU、配置访问、枚举顺序讲解。每一步给出“观察到什么才能进入下一层”，并区分 DesignWare/Rockchip 私有寄存器与 PCIe 标准空间。

- [ ] **Step 3: 重写第 16 篇**

从“Linux 设备如何扮演 Endpoint”开始，按 EPC、EPF、EPF Driver、ConfigFS、Host Driver 的协作顺序讲解。使用主线 `pci_epf_test` 展示 BAR backing memory、Inbound/Outbound、MSI/MSI-X 和 DMA 测试，不把教学 EPF 说成任意硬件可运行。

- [ ] **Step 4: 重写第 17 篇**

从单队列瓶颈扩展到 Queue/Vector/CPU Affinity，分别用网卡和 NVMe 说明相同架构模式。沿一次批量提交解释 descriptor、doorbell、completion、interrupt moderation、NAPI/poll、backpressure、cache line 和 NUMA，避免再次重复第 09 篇基础 Ring。

- [ ] **Step 5: 重写第 18 篇**

以“设备完全看不到、能看到但 BAR 失败、驱动不绑定、IRQ 不增长、DMA 超时、IOMMU Fault、AER 恢复失败”七个入口组织决策树。每层都给出命令、要证明的事实、正面/负面证据边界和下一分支；结尾用“系列收尾”回收拓扑、资源、驱动、IRQ、DMA、PM 和恢复链。

- [ ] **Step 6: 验证并提交 15～18**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
git add -- tests/pcie-reference-rewrite.test.mjs docs/articles/pcie/pci-15-rc-ep-hardware-link-bring-up.md docs/articles/pcie/pci-16-linux-pci-endpoint-framework.md docs/articles/pcie/pci-17-multiqueue-dma-msix-throughput.md docs/articles/pcie/pci-18-system-debug-lspci-aer-iommu.md
git commit -m "docs: complete PCIe controller and debugging path"
```

### Task 7: 全系列验证与范围审计

**Files:**
- Verify: `docs/articles/pcie/`
- Verify: `tests/pcie-reference-rewrite.test.mjs`
- Verify: `README.md`
- Verify: `src/pages/usb-pcie/[...slug].astro`

**Interfaces:**
- Consumes: Task 1～6 的全部提交。
- Produces: 18 篇连续系列、有效 Markdown/Mermaid/路由和可部署 Astro 构建。

- [ ] **Step 1: 检查 19～22 和 USB/PCIe 对比引用已经清理**

Run:

```powershell
git grep -n -E "pci-(19|20|21|22)-usb-pcie|22 篇|跨总线综合" -- README.md docs/articles/pcie src tests
```

Expected: 无正文、导航或计数残留；只允许规格文档中出现“删除 19～22”的历史决策说明。

- [ ] **Step 2: 运行 PCIe 定向测试和 Mermaid 验证**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 0 failures；所有 PCIe Mermaid 块可解析。

- [ ] **Step 3: 运行站点构建**

先确认配套内核模块没有被本次纯文章重构修改：

```powershell
git diff --quiet 596ca04 -- docs/articles/pcie/src/linux-6.12
node --test --test-name-pattern "PCIe teaching modules" tests/pcie-reference-rewrite.test.mjs
```

Expected: 源码目录相对实施基线无差异，Linux 6.12 生命周期契约通过。本次不对未修改的 C 模块重复制造新的构建产物。

然后运行站点构建：

```powershell
npm run build
```

Expected: Astro 构建和 Pagefind 索引生成成功，退出码为 0。

- [ ] **Step 4: 运行全量测试并与基线比较**

```powershell
npm test
```

Expected: PCIe 相关测试全部通过；若机器学习工作仍未完成，允许保留基线中的同三项失败，但不得新增失败。

- [ ] **Step 5: 审计最终 Git 范围**

```powershell
git status --short
git diff --stat 596ca04..HEAD
```

Expected: PCIe 实施提交只包含计划列出的 PCIe 文章、测试、README 和旧路由；用户原有机器学习与 `.gitignore` 改动保持未提交且未修改。
