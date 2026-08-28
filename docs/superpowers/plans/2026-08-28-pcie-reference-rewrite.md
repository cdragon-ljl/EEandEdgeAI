# PCIe Reference-Quality Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 16-article PCIe series with 18 Linux 6.12 core articles while preserving every published core PCIe URL; cross-bus synthesis is completed in the separate synthesis plan.

**Architecture:** Build the series from protocol/resources to PCI Core, then interrupts/DMA/addressing, power/errors/performance, and finally RC/EP/high-throughput/debugging. Original Linux 6.12 Explorer, DMA-ring, network-source, and Endpoint examples anchor the practical articles.

**Tech Stack:** Markdown, Mermaid, Linux 6.12 LTS PCI Core/DMA/IOMMU/MSI/Endpoint APIs, Node.js test runner, Astro redirects.

**Spec:** `docs/superpowers/specs/2026-08-28-usb-pcie-reference-rewrite-design.md`

## Global Constraints

- Linux 6.12 LTS is the only code/API baseline; 6.18 differences are isolated notes.
- EmbedFire is a structural and experiment-design reference, not a source for copied prose or code.
- Every core article has at least five meaningful Mermaid diagrams and two official primary-source links.
- Probe, error unwind, remove, reset, hotplug, PM, DMA ownership, and synchronization are explicit.
- Existing `/pcie/<old-slug>/` routes remain as static redirects.
- Teaching hardware protocols are explicitly fictional when no public register specification exists.
- Kernel-module build steps run in a Linux shell or WSL with `LINUX_612_TREE` set to an absolute Linux 6.12 source-tree path; verify it first with `test -f "$LINUX_612_TREE/Makefile"`.

---

### Task 1: Lock the 18-article PCIe core sequence and redirects

**Files:**
- Create: `tests/pcie-reference-rewrite.test.mjs`
- Modify: `tests/site-content-config.test.mjs`
- Modify: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: approved PCIe topics 01–18.
- Produces: `pcieCoreFiles`, `pcieDepthContracts`, and `pcieLegacyRedirects`.

- [ ] **Step 1: Define the exact 18-file sequence**

```js
const pcieCoreFiles = [
  'pci-01-topology-link-tlp.md',
  'pci-02-enumeration-config-space.md',
  'pci-03-bar-resource-atu-mmio.md',
  'pci-04-linux-pci-core-bus-dev-ops.md',
  'pci-05-pci-driver-lifecycle-api.md',
  'pci-06-pci-explorer-capability-bar-sysfs.md',
  'pci-07-intx-msi-msix-threaded-irq.md',
  'pci-08-dma-api-memory-order.md',
  'pci-09-dma-descriptor-ring.md',
  'pci-10-iommu-swiotlb-ats-pasid-sva.md',
  'pci-11-power-aspm-clkreq-runtime-pm.md',
  'pci-12-aer-flr-hot-reset-recovery.md',
  'pci-13-performance-tlp-mps-mrrs-credit.md',
  'pci-14-network-driver-ring-napi-msix.md',
  'pci-15-rc-ep-hardware-link-bring-up.md',
  'pci-16-linux-pci-endpoint-framework.md',
  'pci-17-multiqueue-dma-msix-throughput.md',
  'pci-18-system-debug-lspci-aer-iommu.md',
];
```

Assert frontmatter, title number, five Mermaid blocks, official sources, Linux 6.12 marker, long-form depth, and topic-specific objects/APIs.

- [ ] **Step 2: Define core old-to-new redirects**

```js
const pcieLegacyRedirects = {
  'pci-01-pcie-architecture-basics': 'pci-01-topology-link-tlp',
  'pci-02-pcie-enumeration-config-space': 'pci-02-enumeration-config-space',
  'pci-03-bar-and-mmio': 'pci-03-bar-resource-atu-mmio',
  'pci-04-linux-pci-driver-framework': 'pci-05-pci-driver-lifecycle-api',
  'pci-05-pcie-interrupts-msi-msix': 'pci-07-intx-msi-msix-threaded-irq',
  'pci-06-pcie-dma-data-movement': 'pci-08-dma-api-memory-order',
  'pci-07-iommu-address-translation': 'pci-10-iommu-swiotlb-ats-pasid-sva',
  'pci-08-pcie-device-driver-practice': 'pci-06-pci-explorer-capability-bar-sysfs',
  'pci-09-pcie-performance-stability': 'pci-13-performance-tlp-mps-mrrs-credit',
  'pci-10-pcie-troubleshooting': 'pci-18-system-debug-lspci-aer-iommu',
  'pci-11-pcie-endpoint-hardware-link-bring-up': 'pci-15-rc-ep-hardware-link-bring-up',
  'pci-12-pcie-dma-ring-msix-high-throughput': 'pci-17-multiqueue-dma-msix-throughput',
};
```

- [ ] **Step 3: Run RED and commit the contract**

Run: `node --test tests/pcie-reference-rewrite.test.mjs`

Expected: FAIL because the new PCI Core file and redirect sequence do not exist.

```bash
git add tests/pcie-reference-rewrite.test.mjs tests/site-content-config.test.mjs tests/usb-pcie-articles.test.mjs
git commit -m "test(pcie): define reference-quality rewrite contract"
```

### Task 2: Rewrite PCIe foundations as articles 01–03

**Files:**
- Create: `docs/articles/pcie/pci-01-topology-link-tlp.md`
- Create: `docs/articles/pcie/pci-02-enumeration-config-space.md`
- Create: `docs/articles/pcie/pci-03-bar-resource-atu-mmio.md`

**Interfaces:**
- Consumes: PCIe public architecture concepts and Linux 6.12 enumeration/resource code.
- Produces: BDF, config, TLP, BAR, resource, bridge-window, and ATU vocabulary.

- [ ] **Step 1: Write article 01 from topology to transactions**

Cover RC/Root Port/Switch/Endpoint, lane/link generations, LTSSM, Transaction/Data Link/Physical layers, TLP/DLLP, credit, ordering, completion, replay, LCRC, and AER relationship.

- [ ] **Step 2: Rewrite article 02 around recursive enumeration**

Cover BDF, Type 0/1 headers, ECAM/config access, `pci_scan_child_bus`, bridge bus numbers, BAR probing, capability chains, Extended Capabilities, class code, driver modalias, and hotplug rescan.

- [ ] **Step 3: Rewrite article 03 around resource ownership**

Cover BAR type/sizing, 64-bit/prefetchable windows, resource tree, bridge windows, `pci_request_regions`, `pci_iomap`, MMIO accessors, posted writes, outbound/inbound ATU, mmap boundaries, and teardown.

- [ ] **Step 4: Validate and commit foundations**

Run: `node --test --test-name-pattern "PCIe.*0[1-3]" tests/pcie-reference-rewrite.test.mjs`

```bash
git add docs/articles/pcie tests/pcie-reference-rewrite.test.mjs
git commit -m "docs(pcie): rebuild topology enumeration and BAR guides"
```

### Task 3: Build PCI Core and Explorer articles 04–06

**Files:**
- Create: `docs/articles/pcie/pci-04-linux-pci-core-bus-dev-ops.md`
- Create: `docs/articles/pcie/pci-05-pci-driver-lifecycle-api.md`
- Create: `docs/articles/pcie/pci-06-pci-explorer-capability-bar-sysfs.md`
- Create: `docs/articles/pcie/src/linux-6.12/pci_explorer.c`
- Create: `docs/articles/pcie/src/linux-6.12/Makefile`

**Interfaces:**
- Consumes: foundation resource model.
- Produces: `pci_bus`/`pci_dev`/`pci_ops` framework model and a safe read-only Explorer module.

- [ ] **Step 1: Write article 04 around PCI Core objects**

Explain `pci_bus`, `pci_dev`, `pci_ops`, device model embedding, bus topology lists, resource arrays, config access, capability offsets, DMA/PM/error state, sysfs, and architecture-specific host-controller boundaries.

- [ ] **Step 2: Write article 05 as the complete driver lifecycle**

Cover ID matching, register/unregister, enable/disable, regions, iomap, DMA mask, bus mastering, drvdata, capability discovery, IRQ setup, userspace publication, runtime/system PM, save/restore, AER callbacks, shutdown, remove, and reverse-order unwind.

- [ ] **Step 3: Implement original `pci_explorer.c`**

Register a whitelist-limited `pci_driver`; parse standard header, standard and extended capability chains with bounds/loop checks; enumerate BAR start/length/flags; optionally map a read-only teaching BAR region; expose read-only sysfs attributes; support PM/remove without writes to unknown hardware.

- [ ] **Step 4: Write article 06 around Explorer safety and evidence**

Explain why config/BAR writes are dangerous, how capability pointers are validated, sysfs lifetime, `pci_cfg_access_lock`, power state, BAR mapping, and what lspci proves versus the module.

- [ ] **Step 5: Build, validate, and commit**

Run: `test -f "$LINUX_612_TREE/Makefile" && make -C "$LINUX_612_TREE" M="$PWD/docs/articles/pcie/src/linux-6.12" modules W=1`

Run: `node --test --test-name-pattern "PCIe.*0[4-6]" tests/pcie-reference-rewrite.test.mjs`

```bash
git add docs/articles/pcie tests/pcie-reference-rewrite.test.mjs
git commit -m "docs(pcie): add Linux 6.12 PCI Core and Explorer guides"
```

### Task 4: Rewrite interrupts and DMA as articles 07–09

**Files:**
- Create: `docs/articles/pcie/pci-07-intx-msi-msix-threaded-irq.md`
- Create: `docs/articles/pcie/pci-08-dma-api-memory-order.md`
- Create: `docs/articles/pcie/pci-09-dma-descriptor-ring.md`
- Create: `docs/articles/pcie/src/linux-6.12/pci_irq_demo.c`
- Create: `docs/articles/pcie/src/linux-6.12/pci_dma_ring.c`

**Interfaces:**
- Consumes: probe/resource framework.
- Produces: interrupt, DMA ownership, descriptor publication, cancellation, and reset protocols.

- [ ] **Step 1: Write article 07 across INTx/MSI/MSI-X**

Cover capability layout, vector allocation fallback, `pci_irq_vector`, request/free ordering, shared INTx acknowledgement, threaded IRQ, affinity, per-queue mapping, moderation, DMA visibility, remove/reset races, and lost interrupt evidence.

- [ ] **Step 2: Write article 08 as a DMA API contract**

Cover mask negotiation, coherent/streaming mapping, SG, sync APIs, direction, ownership, memory barriers, MMIO doorbells, IOMMU/SWIOTLB, userspace memory, and teardown.

- [ ] **Step 3: Implement new IRQ and ring modules**

Use explicit teaching device IDs and a documented fictional descriptor/register protocol. `pci_irq_demo.c` demonstrates vector fallback and threaded cleanup; `pci_dma_ring.c` demonstrates coherent rings, streaming payload maps, phase/generation, doorbell ordering, timeout/reset, and complete unwind.

- [ ] **Step 4: Write article 09 around the ring state machine**

Explain producer/consumer indexes, phase bits, descriptor ownership, DMA barriers, completion consumption, queue-full backpressure, timeout, stale completion generation, reset, and remove.

- [ ] **Step 5: Build, validate, and commit**

Run kernel module builds with `W=1`, then:

Run: `node --test --test-name-pattern "PCIe.*0[7-9]" tests/pcie-reference-rewrite.test.mjs`

```bash
git add docs/articles/pcie tests/pcie-reference-rewrite.test.mjs
git commit -m "docs(pcie): rebuild IRQ DMA and descriptor-ring guides"
```

### Task 5: Rewrite addressing, PM, recovery, performance, and network source articles 10–14

**Files:**
- Create: `docs/articles/pcie/pci-10-iommu-swiotlb-ats-pasid-sva.md`
- Create: `docs/articles/pcie/pci-11-power-aspm-clkreq-runtime-pm.md`
- Create: `docs/articles/pcie/pci-12-aer-flr-hot-reset-recovery.md`
- Create: `docs/articles/pcie/pci-13-performance-tlp-mps-mrrs-credit.md`
- Create: `docs/articles/pcie/pci-14-network-driver-ring-napi-msix.md`

**Interfaces:**
- Consumes: PCI Core, interrupt, and DMA model.
- Produces: system-level address, power, recovery, performance, and real-driver synthesis.

- [ ] **Step 1: Rewrite article 10**

Cover IOVA/domain/group, direct DMA, SWIOTLB bounce, IOTLB, ATS, PRI, PASID, SVA, VFIO, page size, invalidation, fault evidence, security boundaries, and unmap lifetime.

- [ ] **Step 2: Write article 11**

Cover D0–D3hot/cold, PME, ASPM L0s/L1/L1 substates, CLKREQ#, runtime PM, `pci_save_state`, `pci_restore_state`, wakeup, link retraining, latency/power tradeoffs, and board evidence.

- [ ] **Step 3: Write article 12**

Cover correctable/nonfatal/fatal AER, `pci_error_handlers`, error_detected/mmio_enabled/slot_reset/resume, FLR, PM reset, secondary bus reset, hot reset, DMA quiesce, state reconstruction, and failure escalation.

- [ ] **Step 4: Rewrite article 13**

Derive effective throughput from link encoding and TLP overhead; explain MPS, MRRS, RCB, tags, credit, outstanding reads, queue depth, batching, doorbells, MSI-X moderation, NUMA, IOMMU, ASPM, and p50/p99 stability measurements.

- [ ] **Step 5: Write article 14 from Linux 6.12 network-driver source**

Select a well-maintained in-tree PCIe NIC driver and pin the exact source revision. Trace id table, probe, BAR, DMA rings, page/skb ownership, NAPI, MSI-X queues, netdev publish, PM, AER, remove, and shutdown. Explain what is driver-generic versus NIC-specific.

- [ ] **Step 6: Validate and commit**

Run: `node --test --test-name-pattern "PCIe.*(10|11|12|13|14)" tests/pcie-reference-rewrite.test.mjs`

```bash
git add docs/articles/pcie tests/pcie-reference-rewrite.test.mjs
git commit -m "docs(pcie): add addressing power recovery and NIC-source guides"
```

### Task 6: Rewrite RC/EP, Endpoint Framework, high-throughput, and debugging articles 15–18

**Files:**
- Create: `docs/articles/pcie/pci-15-rc-ep-hardware-link-bring-up.md`
- Create: `docs/articles/pcie/pci-16-linux-pci-endpoint-framework.md`
- Create: `docs/articles/pcie/pci-17-multiqueue-dma-msix-throughput.md`
- Create: `docs/articles/pcie/pci-18-system-debug-lspci-aer-iommu.md`
- Create: `docs/articles/pcie/src/linux-6.12/pci_epf_teaching.c`

**Interfaces:**
- Consumes: complete PCI Core/DMA/PM/error model.
- Produces: hardware bring-up, EP framework, product queue design, and complete diagnostic evidence chain.

- [ ] **Step 1: Rewrite article 15**

Cover RC/EP/Switch roles, power rails, REFCLK, PERST#, CLKREQ#, lane direction, LTSSM, link speed/width, config/BAR/ATU, RC device tree, cold-boot instability, signal-integrity boundaries, and hardware acceptance.

- [ ] **Step 2: Write article 16 and EPF source**

Explain EPC/EPF objects, configfs binding, BAR allocation, `pci_epc_set_bar`, MSI/MSI-X raise, inbound/outbound windows, host memory addresses, DMA ownership, linkup/unbind, and cleanup. Implement a Linux 6.12 teaching EPF using only public Endpoint APIs.

- [ ] **Step 3: Rewrite article 17**

Cover multi-queue descriptor/CQ design, MSI-X mapping, CPU affinity, batch/doorbell, NAPI/poll hybrid, backpressure, queue reset, generation, timeout, DMA/IOMMU, metrics, fault injection, and long-run gates.

- [ ] **Step 4: Rewrite article 18**

Build a layer-by-layer evidence tree using power/clock/reset/LTSSM, lspci/setpci, sysfs resource/config, driver binding, MSI-X/proc interrupts, tracepoints/dynamic debug, DMA/IOMMU faults, AER, reset, protocol analyzer, and regression capture.

- [ ] **Step 5: Create core PCIe redirects and framework**

Create `src/pages/pcie/[...legacy].astro` from `pcieLegacyRedirects`; rewrite `docs/articles/pcie/pcie-framework.md` for articles 01–18. Update current legacy `src/pages/usb-pcie/[...slug].astro` destinations after core renumbering.

- [ ] **Step 6: Verify and commit core PCIe**

Run: `node --test tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs`

Run: `npm run build`

```bash
git add docs/articles/pcie src/pages/pcie src/pages/usb-pcie tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs README.md
git commit -m "docs(pcie): complete Linux 6.12 core series rewrite"
```
