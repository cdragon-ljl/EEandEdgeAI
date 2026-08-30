# PCIe Wildfire-Aligned Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按野火 PCI 子系统的学习骨架重新组织 18 篇 PCIe 文章，补齐概念前置、整体架构、核心结构/API、真实驱动、Explorer、DMA、IRQ，并为非简单代码块添加辅助阅读的中文注释。

**Architecture:** 前 10 篇按“基础 → 枚举/BAR → 子系统架构 → 核心结构/API → rtw88 → Explorer → DMA → IRQ”组织，11～18 保留高级主题但修正术语前置和代码注释。主题移动时创建新 Canonical Filename，所有已上线旧 Slug 通过 `src/pages/pcie/[...legacy].astro` 重定向，保证旧链接不失效。

**Tech Stack:** Markdown、Mermaid、Astro 4、Node.js 20 `node:test`、Linux 6.12 PCI/rtw88 官方源码

**Spec:** `docs/superpowers/specs/2026-08-30-pcie-wildfire-aligned-learning-path-design.md`

## Global Constraints

- 野火 PCI 子系统章节是主要教学框架参考，Linux 6.12 官方源码和文档是 API/代码事实基线。
- 深度借鉴野火的顺序、覆盖和案例组织，正文重新表达并明确引用，不大段复制原文。
- 代码重新编写或使用明确标注的 Linux 6.12 简化注释版源码。
- 所有非简单 C/C++/Shell/PowerShell 代码块必须包含中文注释，解释关键状态、所有权、错误路径或命令目的。
- 不用逐行同义注释、篇幅、图数、连接词数量或统一标题模板衡量质量。
- 设备私有寄存器、BAR 编号和 Workaround 必须标为设备案例，不推广为 PCIe 标准。
- 实际输出、参考格式、理论演算和教学协议必须区分。
- 18 篇新 Canonical Filename、标题编号和 `order` 连续；所有当前旧 Slug 保留重定向。
- 不提交 `.gitignore`、`docs/articles/machine-learning/`、`tests/machine-learning-articles.test.mjs` 或其他无关工作区改动。
- 本地全量 `npm test` 会读取用户未提交的机器学习测试；最终 CI 等价验证使用 Git 已跟踪测试文件。

---

### Task 1: 建立新课程清单、语义顺序与代码注释契约

**Files:**
- Modify: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `tests/usb-pcie-articles.test.mjs`
- Modify: `tests/legacy-usb-pcie-routes.test.mjs`
- Modify: `src/pages/pcie/[...legacy].astro`
- Modify: `docs/articles/pcie/pcie-framework.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 18 篇新顺序和当前已上线 Slug。
- Produces: `pcieFiles` 新 Canonical 清单、`pcieLegacyRedirects` 完整重定向、概念顺序测试、代码块注释测试。

- [ ] **Step 1: 把测试清单改为新 Canonical 文件**

在 `tests/pcie-reference-rewrite.test.mjs` 使用以下顺序：

```js
export const pcieFiles = [
  'pci-01-topology-link-tlp.md',
  'pci-02-enumeration-config-space.md',
  'pci-03-bar-resource-atu-mmio.md',
  'pci-04-linux-pci-subsystem-architecture.md',
  'pci-05-core-structures-pci-dev-driver-bus-ops.md',
  'pci-06-core-api-driver-lifecycle.md',
  'pci-07-rtw88-pci-driver-source-analysis.md',
  'pci-08-pci-explorer-capability-bar-sysfs.md',
  'pci-09-dma-descriptor-ring.md',
  'pci-10-intx-msi-msix-threaded-irq.md',
  'pci-11-iommu-swiotlb-ats-pasid-sva.md',
  'pci-12-power-aspm-clkreq-runtime-pm.md',
  'pci-13-aer-flr-hot-reset-recovery.md',
  'pci-14-performance-tlp-mps-mrrs-credit.md',
  'pci-15-rc-ep-hardware-link-bring-up.md',
  'pci-16-linux-pci-endpoint-framework.md',
  'pci-17-multiqueue-dma-msix-throughput.md',
  'pci-18-system-debug-lspci-aer-iommu.md',
];
```

- [ ] **Step 2: 删除机械模板断言并加入概念顺序 Helper**

删除 `assertTeachingStructure()` 中对开头问题词、H2 数量、长段落数、因果词数、“本篇检查点”和“下一篇”的检查。加入以下 Helper：

```js
function assertAppearsBefore(body, earlier, later, message) {
  const earlierIndex = body.indexOf(earlier);
  const laterIndex = body.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${message}: missing ${earlier}`);
  assert.notEqual(laterIndex, -1, `${message}: missing ${later}`);
  assert.ok(earlierIndex < laterIndex, `${message}: ${earlier} must appear before ${later}`);
}

function codeBlocks(markdown) {
  return [...markdown.matchAll(/^```([^\r\n]*)\r?\n([\s\S]*?)^```$/gm)]
    .map((match) => ({ language: match[1].trim().toLowerCase(), code: match[2] }));
}

function assertAnnotatedCodeBlocks(file, body) {
  const languages = new Set(['c', 'cpp', 'bash', 'sh', 'shell', 'powershell']);
  for (const block of codeBlocks(body)) {
    const lines = block.code.split(/\r?\n/).filter((line) => line.trim());
    if (!languages.has(block.language) || lines.length < 6) continue;
    assert.match(block.code, /(^|\n)\s*(?:\/\*|\/\/|\*|#)/m,
      `${file}: non-trivial ${block.language} block needs an explanatory comment`);
  }
}
```

- [ ] **Step 3: 增加逐篇语义契约**

```js
test('PCIe concepts are introduced before dependent APIs and examples', () => {
  const read = (file) => articleBody(readFileSync(join('docs/articles/pcie', file), 'utf8'));

  const first = read(pcieFiles[0]);
  assert.match(first.slice(0, 1200), /PCI Express（PCIe）是|PCIe 是/);
  assertAppearsBefore(first, 'PCI Express', 'readl(', 'PCIe foundation');

  const bar = read(pcieFiles[2]);
  assertAppearsBefore(bar, 'BAR（Base Address Register）', 'pci_iomap(', 'BAR foundation');

  const architecture = read(pcieFiles[3]);
  assertAppearsBefore(architecture, '硬件适配层', 'struct pci_dev', 'PCI subsystem architecture');

  const dma = read(pcieFiles[8]);
  assertAppearsBefore(dma, 'DMA（Direct Memory Access', 'dma_map_single(', 'DMA foundation');
  assertAppearsBefore(dma, 'Descriptor（描述符）', 'Producer', 'descriptor foundation');

  const irq = read(pcieFiles[9]);
  assertAppearsBefore(irq, '中断', 'DMA Completion', 'IRQ foundation');
});

test('PCIe non-trivial code examples are annotated', () => {
  for (const file of pcieFiles) {
    const body = articleBody(readFileSync(join('docs/articles/pcie', file), 'utf8'));
    assertAnnotatedCodeBlocks(file, body);
  }
});
```

- [ ] **Step 4: 更新主题覆盖矩阵**

前 10 篇最低标记：

```js
const topicMarkers = [
  ['PCI Express', '传统 PCI', 'Root Complex', 'Endpoint', 'Link', 'Lane', 'TLP'],
  ['Configuration Space', 'BDF', 'Type 0', 'Type 1', 'ECAM', 'pci_scan_child_bus'],
  ['BAR', 'Configuration Space', 'Memory Space', 'I/O Space', 'ATU', 'DBI', 'pci_iomap'],
  ['硬件适配层', 'PCI Bus Core', '功能驱动层', '用户交互层'],
  ['pci_dev', 'pci_driver', 'pci_bus', 'pci_device_id', 'pci_ops', 'pci_host_bridge'],
  ['pci_register_driver', 'pci_enable_device_mem', 'pci_request_regions', 'pci_iomap', 'pci_set_master', 'pci_save_state'],
  ['rtw88', 'rtw_pci_probe', 'BAR2', 'descriptor ring', 'NAPI', 'rtw_pci_remove'],
  ['pci_cfg_access_lock', 'Standard Capability', 'Extended Capability', 'sysfs', 'lspci'],
  ['Direct Memory Access', 'dma_set_mask_and_coherent', 'dma_map_single', 'Descriptor', 'Producer', 'Consumer', 'Doorbell'],
  ['INTx', 'MSI', 'MSI-X', 'pci_alloc_irq_vectors', 'request_threaded_irq'],
  ['IOMMU group', 'SWIOTLB', 'ATS', 'PRI', 'PASID', 'SVA'],
  ['D3hot', 'ASPM', 'CLKREQ#', 'runtime PM'],
  ['pci_error_handlers', 'error_detected', 'FLR', 'secondary bus reset'],
  ['MPS', 'MRRS', 'credit', 'P99'],
  ['PERST#', 'REFCLK', 'LTSSM', 'address translation'],
  ['pci_epc_set_bar', 'configfs', 'MSI-X', 'unbind'],
  ['multi-queue', 'doorbell', 'backpressure', 'generation'],
  ['lspci -vv', 'AER', 'IOMMU fault', 'FLR'],
];
```

- [ ] **Step 5: 更新旧 Slug 重定向契约**

新增当前线上 Slug 到新 Canonical 的映射：

```js
const currentCanonicalRedirects = {
  'pci-04-linux-pci-core-bus-dev-ops': 'pci-05-core-structures-pci-dev-driver-bus-ops',
  'pci-05-pci-driver-lifecycle-api': 'pci-06-core-api-driver-lifecycle',
  'pci-06-pci-explorer-capability-bar-sysfs': 'pci-08-pci-explorer-capability-bar-sysfs',
  'pci-07-intx-msi-msix-threaded-irq': 'pci-10-intx-msi-msix-threaded-irq',
  'pci-08-dma-api-memory-order': 'pci-09-dma-descriptor-ring',
  'pci-10-iommu-swiotlb-ats-pasid-sva': 'pci-11-iommu-swiotlb-ats-pasid-sva',
  'pci-11-power-aspm-clkreq-runtime-pm': 'pci-12-power-aspm-clkreq-runtime-pm',
  'pci-12-aer-flr-hot-reset-recovery': 'pci-13-aer-flr-hot-reset-recovery',
  'pci-13-performance-tlp-mps-mrrs-credit': 'pci-14-performance-tlp-mps-mrrs-credit',
  'pci-14-network-driver-ring-napi-msix': 'pci-07-rtw88-pci-driver-source-analysis',
};
```

同时更新更早的 12 个 Legacy Slug，使它们最终指向新 Canonical，而不是经过多跳重定向。

- [ ] **Step 6: 运行红灯测试**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs
```

Expected: 新 Canonical 文件不存在、概念顺序和代码注释不满足，因此测试失败。

### Task 2: 重写 01～03 基础层

**Files:**
- Modify: `docs/articles/pcie/pci-01-topology-link-tlp.md`
- Modify: `docs/articles/pcie/pci-02-enumeration-config-space.md`
- Modify: `docs/articles/pcie/pci-03-bar-resource-atu-mmio.md`

**Interfaces:**
- Consumes: 野火 8.1 基础概念、PCI-SIG 公开术语。
- Produces: 定义、拓扑、配置和地址模型，供 Linux PCI 子系统文章使用。

- [ ] **Step 1: 重写第 01 篇为真正的入门总览**

固定章节依赖：

```text
PCI Express 定义与用途
-> PCI 到 PCIe 的演进
-> 与 USB/片上总线的边界
-> RC/Root Port/Switch/EP/Function
-> Link/Lane/Generation/全双工
-> Configuration/Memory/I/O 三类空间
-> 配置/BAR/DMA/IRQ/ASPM/AER 全景图
-> TLP/三层协议/LTSSM 入门
-> 最后用 CPU 寄存器访问串联
```

第一次 `readl()` 代码块放在概念地图之后，并加入中文注释：

```c
/* BAR 已由后续文章介绍的流程映射；这里只观察一次访问如何进入 PCIe。 */
u32 status = readl(bar0 + DEMO_STATUS);
```

- [ ] **Step 2: 深化第 02 篇**

先定义 Configuration Space，再进入 BDF/Header/ECAM/Bridge Scan。代码块注释说明不存在 Function 返回全 1、每次读取检查状态，以及 `pci_scan_child_bus` 的递归边界。

- [ ] **Step 3: 重写第 03 篇开头和三类空间**

第一节定义 BAR，第二节说明 Configuration/Memory/I/O Space，随后才讲 Sizing、Resource、ATU、DBI 和 Linux Mapping。所有 MMIO 示例注释 Read-Clear/W1C/Posted Write 风险。

- [ ] **Step 4: 验证基础层**

```powershell
node --test --test-name-pattern "PCIe concepts|approved 18-article" tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 01/03 概念顺序通过；Canonical 清单仍因 04～14 尚未迁移而失败。

### Task 3: 创建 04～06 子系统架构、核心结构与核心函数

**Files:**
- Create: `docs/articles/pcie/pci-04-linux-pci-subsystem-architecture.md`
- Create: `docs/articles/pcie/pci-05-core-structures-pci-dev-driver-bus-ops.md`
- Create: `docs/articles/pcie/pci-06-core-api-driver-lifecycle.md`
- Delete after migration: `docs/articles/pcie/pci-04-linux-pci-core-bus-dev-ops.md`
- Delete after migration: `docs/articles/pcie/pci-05-pci-driver-lifecycle-api.md`

**Interfaces:**
- Consumes: 01～03 的协议、枚举和资源模型。
- Produces: 野火 8.2～8.4 的完整 Linux PCI 子系统知识层。

- [ ] **Step 1: 创建第 04 篇整体架构**

覆盖硬件适配层、PCI Bus Core、功能驱动层和用户交互层。每层说明输入、输出、拥有者和典型源码目录；在四层讲完前不展开结构体字段。

- [ ] **Step 2: 创建第 05 篇核心结构**

逐项覆盖 `pci_dev`、`pci_driver`、`pci_bus`、`pci_device_id`、`pci_ops`，补充 `pci_host_bridge`、`struct device` 和 `struct resource`。结构体简化代码块必须标“Linux 6.12 简化注释版”，并在字段旁注释来源和职责。

- [ ] **Step 3: 创建第 06 篇核心函数**

按注册、Enable、Config、Resource、Mapping、Driver Data、Capability、Bus Master、PM 分类。每个函数至少包含：原型、参数、返回值、前提、成功状态、失败状态、对称清理。Probe 代码块用中文注释标出每个 `goto` 对应的资源边界。

- [ ] **Step 4: 删除被取代的 04/05 文件并验证**

```powershell
node --test --test-name-pattern "approved 18-article|concepts|legacy" tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 01～06 文件和语义契约通过；07～14 仍等待迁移。

### Task 4: 创建 07～10 驱动、Explorer、DMA 与 IRQ 主干

**Files:**
- Create: `docs/articles/pcie/pci-07-rtw88-pci-driver-source-analysis.md`
- Create: `docs/articles/pcie/pci-08-pci-explorer-capability-bar-sysfs.md`
- Modify: `docs/articles/pcie/pci-09-dma-descriptor-ring.md`
- Create: `docs/articles/pcie/pci-10-intx-msi-msix-threaded-irq.md`
- Delete after migration: `docs/articles/pcie/pci-06-pci-explorer-capability-bar-sysfs.md`
- Delete after migration: `docs/articles/pcie/pci-07-intx-msi-msix-threaded-irq.md`
- Delete after migration: `docs/articles/pcie/pci-08-dma-api-memory-order.md`
- Delete after migration: `docs/articles/pcie/pci-14-network-driver-ring-napi-msix.md`

**Interfaces:**
- Consumes: 04～06 的架构、结构和 API。
- Produces: 野火 8.5～8.8 对应的源码、Explorer、DMA、IRQ 实践主干。

- [ ] **Step 1: 创建第 07 篇 rtw88 源码分析**

严格依据 Linux 6.12 `rtw8822ce.c` 和 `rtw88/pci.c`，按 ID、Probe、BAR2、Ring、IRQ/NAPI、PM、Remove 分析。源码块使用简化注释版，不复制长段源码；明确该版本单 MSI/INTx Vector、不使用 MSI-X。

- [ ] **Step 2: 创建第 08 篇 Explorer**

从 `lspci`/sysfs 观察开始，按 Header、Standard Capability、Extended Capability、BAR Resource、Probe/Remove、输出边界展开。命令块注释 BDF 占位符和只读范围。

- [ ] **Step 3: 合并重写第 09 篇 DMA/Ring**

先解释 DMA 与 CPU 搬运，再解释地址域和 API；之后定义 Descriptor 并进入 Ring。保留 coherent/streaming、SG、Barrier、Doorbell、Completion、Phase、Backpressure、Generation。C 代码注释所有权转换和清理。

- [ ] **Step 4: 创建第 10 篇 IRQ**

先用通用“设备事件”定义中断，再解释 INTx/MSI/MSI-X，最后用 DMA Completion 作为案例。Handler/Threaded IRQ/NAPI/Remove 代码块注释 Mask、W1C、Synchronize 和 Free 顺序。

- [ ] **Step 5: 删除被取代文件并验证前 10 篇**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 前 10 篇文件、概念顺序、主题覆盖、代码注释和来源检查通过。

### Task 5: 迁移并审校 11～14 高级机制

**Files:**
- Create: `docs/articles/pcie/pci-11-iommu-swiotlb-ats-pasid-sva.md`
- Create: `docs/articles/pcie/pci-12-power-aspm-clkreq-runtime-pm.md`
- Create: `docs/articles/pcie/pci-13-aer-flr-hot-reset-recovery.md`
- Create: `docs/articles/pcie/pci-14-performance-tlp-mps-mrrs-credit.md`
- Delete after migration: `docs/articles/pcie/pci-10-iommu-swiotlb-ats-pasid-sva.md`
- Delete after migration: `docs/articles/pcie/pci-11-power-aspm-clkreq-runtime-pm.md`
- Delete after migration: `docs/articles/pcie/pci-12-aer-flr-hot-reset-recovery.md`
- Delete after migration: `docs/articles/pcie/pci-13-performance-tlp-mps-mrrs-credit.md`

**Interfaces:**
- Consumes: DMA/IRQ 主干。
- Produces: 不阻断基础学习的 Linux 6.12 高级扩展。

- [ ] **Step 1: 迁移 IOMMU 为第 11 篇**

保留 Domain/Group/IOTLB/Fault/ATS/PRI/PASID/SVA 顺序，补充 DMA 主干过渡；所有 API/命令块添加用途与安全边界注释。

- [ ] **Step 2: 迁移 PM 为第 12 篇**

先定义 Function D-State、Link State 和 Runtime PM，再进入 Suspend/Resume。C 代码注释停止新提交、排空 DMA、Mask IRQ、保存/恢复和重新开放顺序。

- [ ] **Step 3: 迁移 AER 为第 13 篇**

先定义 AER 与错误分类，再进入 `pci_error_handlers`、FLR/Bus/Hot Reset。Recovery 代码注释 Channel State、返回值、Reset 后重建和 Generation。

- [ ] **Step 4: 迁移性能为第 14 篇**

保留 Link 上限、MPS/MRRS/Tag/Credit/Queue/P99 理论计算，Shell 命令注明只读观察和 BDF 替换，理论数值显式标注非实测。

- [ ] **Step 5: 删除旧文件并验证 11～14**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 18 篇 Canonical 清单完整且 11～14 高级主题契约通过。

### Task 6: 审校 15～18、完善重定向和导航

**Files:**
- Modify: `docs/articles/pcie/pci-15-rc-ep-hardware-link-bring-up.md`
- Modify: `docs/articles/pcie/pci-16-linux-pci-endpoint-framework.md`
- Modify: `docs/articles/pcie/pci-17-multiqueue-dma-msix-throughput.md`
- Modify: `docs/articles/pcie/pci-18-system-debug-lspci-aer-iommu.md`
- Modify: `src/pages/pcie/[...legacy].astro`
- Modify: `tests/legacy-usb-pcie-routes.test.mjs`
- Modify: `tests/usb-pcie-articles.test.mjs`
- Modify: `docs/articles/pcie/pcie-framework.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 最终 Canonical 文件名和主题顺序。
- Produces: 无断链的 18 篇导航、旧 URL 兼容和完整高级主题。

- [ ] **Step 1: 审校 15～18 概念前置和代码注释**

第 15 篇先定义 RC/EP 再讲 RK356x；第 16 篇先定义 EPC/EPF 再讲 ConfigFS；第 17 篇先定义 Multi-Queue 再比较网卡/NVMe；第 18 篇先给出分层调试模型再列命令。所有长代码/命令块补中文注释。

- [ ] **Step 2: 实现当前和历史 Slug 直接重定向**

`src/pages/pcie/[...legacy].astro` 同时包含原 12 个历史 Slug 和 Task 1 的 10 个当前 Slug，所有目标直接指向最终 Canonical，禁止重定向链。

- [ ] **Step 3: 更新框架和 README**

Framework 列出新的 18 篇顺序，明确前 10 篇对齐野火 8.1～8.8。README 数量保持当前仓库实际统计，PCIe 描述改为“基础、架构、核心结构/API、rtw88、Explorer、DMA/IRQ、IOMMU/PM/AER、RC/EP”。

- [ ] **Step 4: 运行内容、重定向和 Mermaid 验证**

```powershell
node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs
node scripts/validate-article-mermaid.mjs docs/articles/pcie
```

Expected: 0 failures，所有 Mermaid 块可解析。

### Task 7: 最终构建、范围审计与提交

**Files:**
- Verify: `docs/articles/pcie/`
- Verify: `src/pages/pcie/[...legacy].astro`
- Verify: `README.md`
- Verify: `tests/pcie-reference-rewrite.test.mjs`

**Interfaces:**
- Consumes: Task 1～6 全部内容。
- Produces: 可部署、可回退、旧 URL 可用的最终 PCIe 系列。

- [ ] **Step 1: 检查 Canonical 和旧 Slug**

```powershell
git ls-files docs/articles/pcie/pci-*.md
git grep -n -E "pci-0[4-8]-(linux-pci-core|pci-driver-lifecycle|pci-explorer|intx|dma-api)|pci-1[0-4]-(iommu|power|aer|performance|network-driver)" -- docs/articles/pcie README.md
```

Expected: 只有 18 个新 Canonical；旧名称只出现在重定向测试/映射中，不出现在导航正文。

- [ ] **Step 2: 运行 Git 已跟踪测试**

```powershell
$trackedTests = git ls-files 'tests/*.test.mjs'
node --test $trackedTests
```

Expected: 0 failures。用户未提交的机器学习测试不会进入该命令。

- [ ] **Step 3: 运行生产构建**

```powershell
npm run build
```

Expected: Astro 0 errors，Pagefind 索引数量与 README 发布统计一致。

- [ ] **Step 4: 范围和空白审计**

```powershell
git diff --check
git status --short
```

Expected: 只出现计划内 PCIe/README/测试/重定向文件；`.gitignore` 和机器学习文件保持用户原状。

- [ ] **Step 5: 创建最终原子提交**

```powershell
git add -A -- docs/articles/pcie
git add -- README.md src/pages/pcie/[...legacy].astro tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs
git diff --cached --check
git commit -m "docs: align PCIe series with Wildfire learning path"
```
