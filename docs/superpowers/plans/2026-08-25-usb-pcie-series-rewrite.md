# USB and PCIe Series Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 25 existing USB/PCIe articles with coherent learning-manual versions and add one MCU USB + CherryUSB article.

**Architecture:** Preserve every existing filename, URL, order and theme while rewriting each body around one continuous engineering question. Add a tenth USB article pinned to CherryUSB v1.6.1, and enforce article-specific content contracts instead of length quotas or repeated beginner appendices.

**Tech Stack:** Markdown, Mermaid, Linux USB/PCI core APIs, CherryUSB v1.6.1, Node test runner, Astro.

---

### Task 1: Add Rewrite Quality Contracts

**Files:**
- Create: `tests/usb-pcie-articles.test.mjs`
- Modify: `tests/site-content-config.test.mjs`

- [ ] Assert USB contains orders 1-10 and PCIe contains orders 1-16, with complete frontmatter and no duplicate body H1.
- [ ] Assert no article contains `初学者扩展讲解`, and no heading appears after the final `小结`.
- [ ] Add article-specific mechanism markers for all 26 files rather than line-count or heading-count quotas.
- [ ] Add CherryUSB v1.6.1, fixed commit, Device/Host, DCD/HCD, OSAL and class/example markers.
- [ ] Run focused tests and confirm they fail on the old duplicated appendices and missing USB article 10.
- [ ] Commit with `test: define USB and PCIe rewrite contracts`.

### Task 2: Rewrite USB Architecture Through URB

**Files:**
- Rewrite: `docs/articles/usb/usb-01-usb-architecture-enumeration.md`
- Rewrite: `docs/articles/usb/usb-02-linux-usb-driver-framework.md`
- Rewrite: `docs/articles/usb/usb-03-usb-descriptors-deep-dive.md`
- Rewrite: `docs/articles/usb/usb-04-urb-and-data-transfer.md`

- [ ] Rewrite enumeration as EP0 control-transfer states mapped to Linux `usb_device`, `usb_interface` and hub behavior.
- [ ] Rewrite framework around usbcore/HCD/hub/interface driver matching and disconnect-safe ownership.
- [ ] Rewrite descriptors from byte layout through IAD/BOS/class descriptors and Linux parsing failures.
- [ ] Rewrite URB around pipe, setup packet, submit/complete/unlink/kill, short packet, zero packet and anchors.
- [ ] Run focused tests and commit with `docs(usb): rewrite architecture descriptors and URB guides`.

### Task 3: Rewrite USB Driver, Gadget, Class, Debug and HCD Guides

**Files:**
- Rewrite: `docs/articles/usb/usb-05-usb-device-driver-practice.md`
- Rewrite: `docs/articles/usb/usb-06-usb-gadget-intro.md`
- Rewrite: `docs/articles/usb/usb-07-usb-class-drivers.md`
- Rewrite: `docs/articles/usb/usb-08-usb-troubleshooting.md`
- Rewrite: `docs/articles/usb/usb-09-usb-host-controller-device-tree-bring-up.md`
- Create: `docs/articles/usb/usb-10-mcu-usb-cherryusb-stack.md`

- [ ] Rewrite the Linux device-driver walkthrough with endpoint discovery, async I/O, disconnect and error unwind.
- [ ] Rewrite Gadget around UDC, Function/Configuration, ConfigFS/FunctionFS, EP0 setup and composite devices.
- [ ] Rewrite HID/MSC/CDC/UVC/UAC class behavior and Linux binding/data-path differences.
- [ ] Rewrite troubleshooting as a physical-to-URB/class evidence chain using usbmon, Wireshark and tracepoints.
- [ ] Rewrite controller bring-up around root hub, PHY, clocks, reset, regulators, role switch and DWC2/DWC3/xHCI boundaries.
- [ ] Write USB article 10 with MCU controller/FIFO/DMA/cache basics and CherryUSB v1.6.1 core/class/port/OSAL, DCD/HCD, Device/Host initialization, CDC/MSC/HID examples and debugging.
- [ ] Run focused tests and commit with `docs(usb): rewrite Linux guides and add CherryUSB`.

### Task 4: Rewrite PCIe Architecture Through Driver Framework

**Files:**
- Rewrite: `docs/articles/pcie/pci-01-pcie-architecture-basics.md`
- Rewrite: `docs/articles/pcie/pci-02-pcie-enumeration-config-space.md`
- Rewrite: `docs/articles/pcie/pci-03-bar-and-mmio.md`
- Rewrite: `docs/articles/pcie/pci-04-linux-pci-driver-framework.md`

- [ ] Rewrite topology, LTSSM, protocol layers and TLP concepts as the prerequisite for Linux objects.
- [ ] Rewrite enumeration through BDF, headers, capabilities, bridge recursion and resource assignment.
- [ ] Rewrite BAR sizing/allocation/iomap and MMIO access ordering with concrete examples.
- [ ] Rewrite the Linux driver lifecycle including enable, regions, DMA mask, bus mastering and reverse-order unwind.
- [ ] Run focused tests and commit with `docs(pcie): rewrite architecture and Linux framework guides`.

### Task 5: Rewrite PCIe Interrupt, DMA, IOMMU and Driver Practice

**Files:**
- Rewrite: `docs/articles/pcie/pci-05-pcie-interrupts-msi-msix.md`
- Rewrite: `docs/articles/pcie/pci-06-pcie-dma-data-movement.md`
- Rewrite: `docs/articles/pcie/pci-07-iommu-address-translation.md`
- Rewrite: `docs/articles/pcie/pci-08-pcie-device-driver-practice.md`

- [ ] Rewrite INTx/MSI/MSI-X vector allocation, masking, affinity and interrupt-loss diagnosis.
- [ ] Rewrite DMA addressing, coherent/streaming mapping, ownership, barriers and descriptor rings.
- [ ] Rewrite IOMMU domains, IOVA mapping, faults, SWIOTLB and virtualization boundaries.
- [ ] Rewrite the practical driver as one control/data/completion/lifecycle path with reset and removal safety.
- [ ] Run focused tests and commit with `docs(pcie): rewrite interrupt DMA and IOMMU guides`.

### Task 6: Rewrite PCIe Performance, Debug and Endpoint Guides

**Files:**
- Rewrite: `docs/articles/pcie/pci-09-pcie-performance-stability.md`
- Rewrite: `docs/articles/pcie/pci-10-pcie-troubleshooting.md`
- Rewrite: `docs/articles/pcie/pci-11-pcie-endpoint-hardware-link-bring-up.md`
- Rewrite: `docs/articles/pcie/pci-12-pcie-dma-ring-msix-high-throughput.md`

- [ ] Rewrite performance around link capability, payload/read request, queue depth, interrupts, NUMA and AER.
- [ ] Rewrite troubleshooting as PERST#/REFCLK/LTSSM/config/BAR/IRQ/DMA/IOMMU evidence stages.
- [ ] Rewrite Endpoint bring-up around FPGA/SoC configuration, BAR/address translation and host validation.
- [ ] Rewrite high-throughput rings around ownership, producer/consumer, doorbells, MSI-X, backpressure and recovery.
- [ ] Run focused tests and commit with `docs(pcie): rewrite performance debug and endpoint guides`.

### Task 7: Rewrite Comparisons and Verify Site

**Files:**
- Rewrite: `docs/articles/pcie/usb-pcie-01-bus-model-comparison.md`
- Rewrite: `docs/articles/pcie/usb-pcie-02-driver-framework-comparison.md`
- Rewrite: `docs/articles/pcie/usb-pcie-03-debug-tools-comparison.md`
- Rewrite: `docs/articles/pcie/usb-pcie-04-interview-questions.md`

- [ ] Rewrite comparison articles around actual object/lifecycle differences without repeating main-series tutorials.
- [ ] Rewrite interview questions as engineering scenarios with evidence, incorrect answers and source/API boundaries.
- [ ] Scan all 26 articles for duplicated extension headings, repeated template blocks and invalid source claims.
- [ ] Run `npm test`, Astro check and production build; require all 26 routes.
- [ ] Inspect representative desktop/mobile pages and Mermaid diagrams for overflow and rendering errors.
- [ ] Commit with `docs: complete USB and PCIe series rewrite`, merge to `main`, push and verify GitHub Pages.
