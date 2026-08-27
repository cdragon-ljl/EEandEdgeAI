# USB and PCIe Foundational Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the complete USB and PCIe series so a first-time reader can progress from bus fundamentals to Linux source paths, driver implementation, performance, and troubleshooting.

**Architecture:** Preserve all existing frontmatter, slugs, order values, and URLs while replacing article bodies from a blank-page outline. Each batch follows a red-green editorial cycle: add beginner-flow and knowledge-map assertions, confirm the old body fails, rewrite from primary sources, validate diagrams and site rendering, then commit independently.

**Tech Stack:** Markdown, Astro content collections, Node.js `node:test`, Mermaid, Linux kernel documentation/source, USB-IF specifications, PCI-SIG public material, CherryUSB v1.6.1.

**Spec:** `docs/superpowers/specs/2026-08-27-usb-pcie-foundational-rewrite-design.md`

## Global Constraints

- Preserve `series`, `order`, slug, publication date, filename, and public URL for all 26 articles.
- Rewrite bodies from a blank outline; do not append extension sections to the old body.
- Define every acronym before relying on it, and introduce protocol/hardware concepts before Linux APIs that depend on them.
- Use only primary sources for technical claims: USB-IF, PCI-SIG public material, Linux documentation/source, and CherryUSB v1.6.1.
- Place diagrams where architecture, sequence, state, ownership, or troubleshooting cannot be understood efficiently from prose alone.
- Keep the final H2 as `小结`; place a compact official-source list before or inside the conclusion without creating a detached appendix.
- Do not fabricate benchmark values, hardware behavior, source call paths, or version-independent guarantees.

---

### Task 1: Replace quota-style checks with learning-flow contracts

**Files:**
- Modify: `tests/usb-pcie-articles.test.mjs`
- Create: `docs/technical-article-editorial-standard.md`

**Interfaces:**
- Consumes: article lists and frontmatter contracts already defined in `tests/usb-pcie-articles.test.mjs`.
- Produces: `introContracts`, `orderedTopicContracts`, `diagramContracts`, and source-reference checks used by every later task.

- [ ] **Step 1: Add failing beginner-entry and topic-order assertions**

Add contracts that check concepts appear in pedagogical order rather than merely somewhere in the body:

```js
const orderedTopicContracts = {
  'docs/articles/pcie/pci-01-pcie-architecture-basics.md': [
    'PCI Express', '点对点', 'Root Complex', 'Lane',
    'Transaction Layer', 'TLP', 'LTSSM', 'lspci',
  ],
  'docs/articles/usb/usb-01-usb-architecture-enumeration.md': [
    'Universal Serial Bus', 'Host', 'Device', 'Endpoint',
    'Control Transfer', '枚举', 'SET_ADDRESS', 'usb_new_device',
  ],
};

for (const [path, topics] of Object.entries(orderedTopicContracts)) {
  const body = articleBody(path);
  let previous = -1;
  for (const topic of topics) {
    const current = body.indexOf(topic);
    assert.ok(current > previous, `${path} must introduce ${topic} in learning order`);
    previous = current;
  }
}
```

- [ ] **Step 2: Run the focused test and verify the old PCIe opening fails**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Expected: FAIL because PCIe 01 uses advanced driver terms before defining PCI Express and its bus model.

- [ ] **Step 3: Add diagram and official-source contracts without character quotas**

Require article-specific diagram counts/types and at least two official references for each main article. Do not add minimum character or paragraph-count assertions.

- [ ] **Step 4: Write the durable editorial standard**

Document the approved progression `motivation -> model -> transaction/state path -> Linux objects/source -> verification`, title-use rules, diagram triggers, source hierarchy, and manual review questions from the spec.

- [ ] **Step 5: Run the focused tests and keep them red for the intended content gaps**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Expected: FAIL only on article content that later tasks will replace; test syntax and frontmatter checks must pass.

- [ ] **Step 6: Commit the contracts and standard**

```bash
git add tests/usb-pcie-articles.test.mjs docs/technical-article-editorial-standard.md
git commit -m "test: define USB and PCIe learning-flow contracts"
```

### Task 2: Rewrite USB foundations, enumeration, and descriptors

**Files:**
- Modify: `docs/articles/usb/usb-01-usb-architecture-enumeration.md`
- Modify: `docs/articles/usb/usb-02-linux-usb-driver-framework.md`
- Modify: `docs/articles/usb/usb-03-usb-descriptors-deep-dive.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: USB learning-flow, diagram, and primary-source contracts from Task 1.
- Produces: the Host/Device/Hub model, enumeration state path, Linux Host object model, and descriptor/object mapping required by USB 04-10.

- [ ] **Step 1: Rewrite USB 01 from the question “what problem does USB solve?”**

Cover physical/logical topology, Host ownership, speeds, endpoint zero, transfer types, control-transfer stages, full enumeration, Linux call-path mapping, observation commands, two explanatory diagrams, and official references.

- [ ] **Step 2: Run focused tests and inspect the rendered topic order**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Expected: USB 01 contracts PASS while later USB articles remain red where expected.

- [ ] **Step 3: Rewrite USB 02 around the Linux Host object lifecycle**

Explain HCD/usbcore/interface-driver boundaries, `usb_device` versus `usb_interface`, matching/probe, endpoint discovery, references, runtime PM, disconnect, and delayed completion teardown. Include stack and lifecycle diagrams.

- [ ] **Step 4: Rewrite USB 03 by decoding a descriptor byte stream into Linux objects**

Explain Device/Configuration/Interface/Endpoint/String/IAD/BOS/Class descriptors, `wTotalLength`, alternate settings, composite devices, `lsusb -v`, kernel structures, safe extra-descriptor parsing, and failure evidence. Include descriptor tree, read sequence, and object mapping diagrams.

- [ ] **Step 5: Run tests and manually read the three introductions consecutively**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Manual gate: USB 02 may assume only USB 01; USB 03 may assume only USB 01-02. No undefined acronym or forward dependency is allowed.

- [ ] **Step 6: Commit USB foundations**

```bash
git add docs/articles/usb/usb-01-usb-architecture-enumeration.md docs/articles/usb/usb-02-linux-usb-driver-framework.md docs/articles/usb/usb-03-usb-descriptors-deep-dive.md
git commit -m "docs: rebuild USB foundations and enumeration"
```

### Task 3: Rewrite USB transfers, Host driver practice, and Gadget

**Files:**
- Modify: `docs/articles/usb/usb-04-urb-and-data-transfer.md`
- Modify: `docs/articles/usb/usb-05-usb-device-driver-practice.md`
- Modify: `docs/articles/usb/usb-06-usb-gadget-intro.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: endpoint, descriptor, interface, and lifecycle models from Task 2.
- Produces: URB ownership rules, a complete hot-pluggable Host driver, and Gadget control/data paths used by USB 07-10.

- [ ] **Step 1: Rewrite USB 04 from USB transaction semantics to URB ownership**

Differentiate transaction/transfer/URB, cover four transfer types, `struct urb`, submit/completion/cancel paths, short packet/ZLP, isochronous packet status, anchor, multiple-URB pipelines, barriers/context, and teardown diagrams.

- [ ] **Step 2: Rewrite USB 05 as one complete vendor bulk-driver implementation**

Define a concrete device protocol and follow ID match, endpoint parse, private state, probe/unwind, async TX/RX, wait queue, poll, backpressure, disconnect concurrency, runtime PM, and validation. Code excerpts must compose into one coherent skeleton.

- [ ] **Step 3: Rewrite USB 06 from Device-role hardware to Composite functions**

Cover UDC/gadget/composite/configuration/function/request objects, EP0 setup dispatch, enumeration callbacks, endpoint request ownership, ConfigFS, FunctionFS, suspend/wakeup, disable/unbind, and bring-up evidence.

- [ ] **Step 4: Validate this batch**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Manual gate: every buffer has an explicit owner before submit, during hardware access, at completion, and during disconnect/reset.

- [ ] **Step 5: Commit USB data paths**

```bash
git add docs/articles/usb/usb-04-urb-and-data-transfer.md docs/articles/usb/usb-05-usb-device-driver-practice.md docs/articles/usb/usb-06-usb-gadget-intro.md
git commit -m "docs: rebuild USB transfer and Gadget guides"
```

### Task 4: Rewrite USB classes, troubleshooting, controller bring-up, and CherryUSB

**Files:**
- Modify: `docs/articles/usb/usb-07-usb-class-drivers.md`
- Modify: `docs/articles/usb/usb-08-usb-troubleshooting.md`
- Modify: `docs/articles/usb/usb-09-usb-host-controller-device-tree-bring-up.md`
- Modify: `docs/articles/usb/usb-10-mcu-usb-cherryusb-stack.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: Host, Gadget, descriptor, URB, and ownership models from Tasks 2-3.
- Produces: complete USB class, debug, board bring-up, and MCU stack coverage.

- [ ] **Step 1: Rewrite USB 07 with one analysis template applied deeply to five classes**

For HID, CDC ACM, MSC BOT/UAS, UVC, and UAC, explain descriptor organization, control negotiation, data endpoints, Linux driver binding, userspace API, and representative failure. Add class binding and control/data-plane comparison diagrams.

- [ ] **Step 2: Rewrite USB 08 as a layer-by-layer diagnostic decision process**

Start at power/role/PHY and end at userspace and PM. Explain exactly what dmesg, sysfs, usbmon, Wireshark, dynamic debug, tracepoints, KASAN, and IOMMU faults can prove. Include a decision tree and evidence table.

- [ ] **Step 3: Rewrite USB 09 across schematic, device tree, HCD, and root hub**

Cover VBUS, PHY, clocks/resets, role switch, EHCI/xHCI/DWC boundaries, platform probe, `usb_create_hcd()`, `usb_add_hcd()`, root-hub registration, DT properties, logs, and staged bring-up.

- [ ] **Step 4: Rewrite USB 10 against CherryUSB v1.6.1 official source**

Explain MCU controller constraints, DCD/HCD, core/class/port/OSAL, Device CDC and Host class paths, FIFO/DMA/cache, ISR/callback contexts, and layered acceptance. Pin every source link to tag v1.6.1 or the approved commit.

- [ ] **Step 5: Validate and commit the complete USB series**

Run: `node --test tests/usb-pcie-articles.test.mjs`

```bash
git add docs/articles/usb
git commit -m "docs: complete foundational USB series rewrite"
```

### Task 5: Rewrite PCIe foundations, enumeration, BAR, and MMIO

**Files:**
- Modify: `docs/articles/pcie/pci-01-pcie-architecture-basics.md`
- Modify: `docs/articles/pcie/pci-02-pcie-enumeration-config-space.md`
- Modify: `docs/articles/pcie/pci-03-bar-and-mmio.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: PCIe beginner-entry and ordered-topic contracts from Task 1.
- Produces: the topology, protocol-layer, transaction, enumeration, configuration-space, resource, and address models required by PCIe 04-12.

- [ ] **Step 1: Rewrite PCIe 01 from first principles**

Begin with the purpose of an I/O interconnect and the transition from PCI to PCI Express. Define every topology, lane, generation, encoding, bandwidth, layer, packet, flow-control, reliability, ordering, and LTSSM term before showing Linux. Include topology, packet encapsulation, transaction, and LTSSM diagrams.

- [ ] **Step 2: Verify PCIe 01 independently before writing later articles**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Manual gate: a reader unfamiliar with PCIe can explain what traverses a Link for CPU MMIO read, CPU MMIO write, and device DMA read.

- [ ] **Step 3: Rewrite PCIe 02 around “how can software discover an unconfigured device?”**

Explain config access/ECAM, BDF, header types, bridges, bus numbers, recursive scan, `pci_dev`, BAR sizing, resource assignment, bridge windows, capability lists, hotplug, and Linux evidence.

- [ ] **Step 4: Rewrite PCIe 03 as an end-to-end address path**

Cover BAR encoding/types/size, resource allocation, CPU virtual/physical and PCIe addresses, RC/Endpoint ATU, `pci_request_region()`, `pci_iomap()`, accessors, posted writes, ordering, and safe release.

- [ ] **Step 5: Validate and commit PCIe foundations**

Run: `node --test tests/usb-pcie-articles.test.mjs`

```bash
git add docs/articles/pcie/pci-01-pcie-architecture-basics.md docs/articles/pcie/pci-02-pcie-enumeration-config-space.md docs/articles/pcie/pci-03-bar-and-mmio.md
git commit -m "docs: rebuild PCIe foundations and enumeration"
```

### Task 6: Rewrite PCIe driver lifecycle, interrupts, DMA, and IOMMU

**Files:**
- Modify: `docs/articles/pcie/pci-04-linux-pci-driver-framework.md`
- Modify: `docs/articles/pcie/pci-05-pcie-interrupts-msi-msix.md`
- Modify: `docs/articles/pcie/pci-06-pcie-dma-data-movement.md`
- Modify: `docs/articles/pcie/pci-07-iommu-address-translation.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: PCIe topology, transaction, resource, and address models from Task 5.
- Produces: lifecycle, notification, data ownership, and isolation models used by PCIe 08-12.

- [ ] **Step 1: Rewrite PCIe 04 as a dependency-ordered state machine**

Explain each probe operation's state effect, reverse unwind, hardware start publication boundary, remove, runtime PM, FLR, AER recovery, and user-reference concurrency.

- [ ] **Step 2: Rewrite PCIe 05 from asynchronous notification to multi-queue MSI-X**

Explain INTx electrical/software semantics, MSI message writes, MSI-X Table/PBA, vector allocation, affinity, ordering, moderation, handler/threaded/NAPI division, and evidence for lost interrupts.

- [ ] **Step 3: Rewrite PCIe 06 around one descriptor-ring ownership protocol**

Explain DMA address spaces, mask, coherent/streaming/SG APIs, sync rules, barriers, producer/consumer, doorbell, completion, reset, user memory, and IOMMU boundary.

- [ ] **Step 4: Rewrite PCIe 07 from direct-DMA risk to IOMMU/VFIO**

Explain requester/domain/IOVA/page table/IOTLB/group/fault, DMA API map/unmap, SWIOTLB, ATS/PRI/PASID, VFIO, stale DMA after reset, and performance/security tradeoffs.

- [ ] **Step 5: Validate and commit core PCIe driver mechanisms**

Run: `node --test tests/usb-pcie-articles.test.mjs`

```bash
git add docs/articles/pcie/pci-04-linux-pci-driver-framework.md docs/articles/pcie/pci-05-pcie-interrupts-msi-msix.md docs/articles/pcie/pci-06-pcie-dma-data-movement.md docs/articles/pcie/pci-07-iommu-address-translation.md
git commit -m "docs: rebuild PCIe driver core mechanisms"
```

### Task 7: Rewrite PCIe practice, performance, troubleshooting, Endpoint, and multi-queue design

**Files:**
- Modify: `docs/articles/pcie/pci-08-pcie-device-driver-practice.md`
- Modify: `docs/articles/pcie/pci-09-pcie-performance-stability.md`
- Modify: `docs/articles/pcie/pci-10-pcie-troubleshooting.md`
- Modify: `docs/articles/pcie/pci-11-pcie-endpoint-hardware-link-bring-up.md`
- Modify: `docs/articles/pcie/pci-12-pcie-dma-ring-msix-high-throughput.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: all PCIe models from Tasks 5-6.
- Produces: a complete driver, performance model, diagnostic method, Endpoint bring-up path, and production queue protocol.

- [ ] **Step 1: Rewrite PCIe 08 around a fully specified example Endpoint**

Define registers and descriptor/completion/reset protocol first, then present composable probe, BAR, ring, MSI-X, ioctl/poll/mmap, timeout, generation, reset, remove, and unwind code.

- [ ] **Step 2: Rewrite PCIe 09 as a layered performance equation and measurement loop**

Relate Link/encoding/TLP/MPS/MRRS/RCB/tag/credit to DMA/memory/IOMMU/NUMA/IRQ/software queue limits. Explain throughput/latency/P99 tradeoffs and stability/resource-conservation tests without invented results.

- [ ] **Step 3: Rewrite PCIe 10 as a gated troubleshooting decision tree**

For every layer from power to AER, state entry evidence, checks, possible outcomes, and the condition for advancing to the next layer.

- [ ] **Step 4: Rewrite PCIe 11 from both RC and Endpoint perspectives**

Cover electrical signals, LTSSM, config/BAR/ATU, MSI-X, DMA, Linux Endpoint Framework EPC/EPF/configfs, test function, and staged acceptance.

- [ ] **Step 5: Rewrite PCIe 12 as a shared hardware/software queue protocol**

Define SQ/CQ entries, phase/generation, barriers, doorbells, MSI-X, poll budget, backpressure, reset, late completion, metrics, and pseudocode for both sides.

- [ ] **Step 6: Validate and commit advanced PCIe articles**

Run: `node --test tests/usb-pcie-articles.test.mjs`

```bash
git add docs/articles/pcie/pci-08-pcie-device-driver-practice.md docs/articles/pcie/pci-09-pcie-performance-stability.md docs/articles/pcie/pci-10-pcie-troubleshooting.md docs/articles/pcie/pci-11-pcie-endpoint-hardware-link-bring-up.md docs/articles/pcie/pci-12-pcie-dma-ring-msix-high-throughput.md
git commit -m "docs: rebuild advanced PCIe engineering guides"
```

### Task 8: Rewrite comparison and interview专题

**Files:**
- Modify: `docs/articles/pcie/usb-pcie-01-bus-model-comparison.md`
- Modify: `docs/articles/pcie/usb-pcie-02-driver-framework-comparison.md`
- Modify: `docs/articles/pcie/usb-pcie-03-debug-tools-comparison.md`
- Modify: `docs/articles/pcie/usb-pcie-04-interview-questions.md`
- Test: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: completed USB and PCIe terminology, object, ownership, and diagnostic models.
- Produces: cross-bus synthesis and engineering interview material without introducing new prerequisites.

- [ ] **Step 1: Rewrite the bus-model comparison around equivalent questions**

Compare root/controller, discovery, addressing, transfer scheduling, bandwidth, power, hotplug, error recovery, and device fit in a side-by-side evidence-based structure.

- [ ] **Step 2: Rewrite the driver-framework comparison around object and ownership transitions**

Compare match/probe, URB versus descriptor, disconnect versus remove/reset, PM, references, userspace APIs, and teardown ordering.

- [ ] **Step 3: Rewrite the debugging comparison around what each tool proves**

Build an evidence matrix for bus discovery, description/config, transactions, interrupts, DMA/IOMMU, recovery, software tracing, and protocol analyzers.

- [ ] **Step 4: Rewrite interview scenarios with complete answer anatomy**

Each scenario contains context, common wrong answer, source/protocol reasoning, evidence to collect, correct answer, and engineering tradeoff. Cover both core source understanding and realistic deployment failures.

- [ ] **Step 5: Validate and commit专题 articles**

Run: `node --test tests/usb-pcie-articles.test.mjs`

```bash
git add docs/articles/pcie/usb-pcie-*.md
git commit -m "docs: rebuild USB and PCIe synthesis articles"
```

### Task 9: Full editorial, Mermaid, site, and deployment verification

**Files:**
- Verify: `docs/articles/usb/*.md`
- Verify: `docs/articles/pcie/*.md`
- Verify: `tests/usb-pcie-articles.test.mjs`
- Verify: `docs/technical-article-editorial-standard.md`

**Interfaces:**
- Consumes: all rewritten content and tests from Tasks 1-8.
- Produces: deployable GitHub Pages output and public evidence that the rewrite is live.

- [ ] **Step 1: Scan for old template fragments, undefined references, and heading artifacts**

Run: `rg -n "初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环|TBD|TODO|^# " docs/articles/usb docs/articles/pcie`

Expected: no template fragments, placeholders, or duplicate body H1 headings.

- [ ] **Step 2: Run focused and full test suites**

Run: `node --test tests/usb-pcie-articles.test.mjs`

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Parse every Mermaid block and fix syntax errors**

Use the project's Mermaid version in a DOM-capable temporary validation environment. Report total diagram count and zero parse failures.

- [ ] **Step 4: Run Astro diagnostics and production build**

Run: `npx astro check`

Run: `npm run build`

Expected: Astro reports 0 errors; the build includes USB 10, PCIe 16, legacy redirects, and Pagefind output.

- [ ] **Step 5: Preview representative beginner and advanced pages**

Inspect USB 01, USB 04, USB 10, PCIe 01, PCIe 06, PCIe 08, and PCIe 12 on desktop and mobile. Verify Mermaid SVG output, table/code wrapping, TOC flow, no text overlap, and meaningful introductions.

- [ ] **Step 6: Perform final diff and source audit**

Run: `git diff --check main...HEAD`

Run: `git status --short`

Expected: only intended tracked files differ; generated dependencies and temporary validators are not committed.

- [ ] **Step 7: Merge, push, and verify GitHub Pages**

Merge the isolated branch into `main` without touching unrelated main-worktree files, push `origin main`, wait for `Deploy to GitHub Pages`, and fetch representative public pages to verify beginner definitions and new diagrams.
