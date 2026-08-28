# Linux Driver Learning Path Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder and restructure all 28 Linux driver articles into a coherent beginner-to-advanced learning manual while preserving every existing public URL.

**Architecture:** Keep every historical Markdown filename as the canonical slug, but update frontmatter `order` and title `#NN` to define the new reading order. Rewrite each article around its own technical problem, remove the shared five-step template, enforce overlap boundaries from the spec, and verify each batch with content contracts plus manual editorial review.

**Tech Stack:** Markdown, Astro content collections, Node.js `node:test`, Mermaid, Linux kernel documentation/source, Device Tree bindings, EmbedFire RK356x driver guide as a pedagogical reference.

**Spec:** `docs/superpowers/specs/2026-08-28-linux-driver-learning-path-redesign.md`

## Global Constraints

- Preserve all 28 existing filenames and public slugs; do not create replacement canonical URLs or redirects.
- Set frontmatter `order` to contiguous 1..28 and title `#NN` to the same new order.
- Treat filename number prefixes as legacy identifiers only.
- Remove the repeated five-H2 “先确定/第一步/第二步/第三步/第四步” template from every rewritten article.
- Use Linux official documentation/source and bindings for technical truth; use the EmbedFire guide only for teaching sequence, labs, and beginner phrasing.
- Define concepts before APIs, explain object/resource ownership, and include remove/PM/error paths.
- Add Mermaid only for architecture, sequence, state, ownership, or diagnostic relationships that benefit from visualization.
- Do not use character counts, heading counts, or keyword totals as proof of article quality.
- After all batches pass, commit, merge, push, and deploy without requiring another publication confirmation.

---

### Task 1: Create the new order contract and rewrite the Framework roadmap

**Files:**
- Create: `tests/linux-driver-learning-path.test.mjs`
- Modify: `docs/articles/linux-driver/linux-driver-framework.md`
- Modify frontmatter only: all `docs/articles/linux-driver/linux-driver-*.md`

**Interfaces:**
- Consumes: the exact 28-file mapping in the design spec.
- Produces: `learningPath` order metadata and a valid Framework roadmap consumed by every later batch.

- [ ] **Step 1: Write failing file/order/title tests**

Create a fixed mapping instead of deriving order from legacy filenames:

```js
const learningPath = [
  ['linux-driver-02-first-kernel-module-and-char-device.md', 1, '内核模块与字符设备'],
  ['linux-driver-14-linux-device-model-lifecycle.md', 2, 'Linux 设备模型'],
  ['linux-driver-01-platform-device-model-and-probe.md', 3, 'platform'],
  ['linux-driver-15-driver-memory-io-mapping.md', 4, '内存'],
  ['linux-driver-03-misc-sysfs-procfs-debugfs.md', 5, 'misc'],
  ['linux-driver-06-timers-workqueues-delayed-work.md', 6, 'workqueue'],
  ['linux-driver-07-kernel-synchronization-primitives.md', 7, '同步'],
  ['linux-driver-13-driver-debugging-methodology.md', 8, '调试'],
  ['linux-driver-16-pinctrl-gpio-irq-subsystem.md', 9, 'pinctrl'],
  ['linux-driver-04-gpio-led-subsystem.md', 10, 'LED'],
  ['linux-driver-05-keys-interrupt-input-subsystem.md', 11, 'Input'],
  ['linux-driver-17-clock-reset-regulator-power-sequence.md', 12, 'clock'],
  ['linux-driver-08-i2c-regmap-sensor-driver.md', 13, 'I2C'],
  ['linux-driver-09-spi-driver-transfers.md', 14, 'SPI'],
  ['linux-driver-10-uart-tty-console-driver.md', 15, 'UART'],
  ['linux-driver-11-pwm-adc-watchdog.md', 16, 'PWM'],
  ['linux-driver-12-dma-cache-coherency.md', 17, 'DMA'],
  ['linux-driver-18-iommu-dma-address-translation.md', 18, 'IOMMU'],
  ['linux-driver-19-firmware-remoteproc-rpmsg.md', 19, 'remoteproc'],
  ['linux-driver-20-rtc-nvmem-eeprom-efuse.md', 20, 'NVMEM'],
  ['linux-driver-21-block-storage-emmc-sd.md', 21, '块设备'],
  ['linux-driver-22-mtd-ubi-nor-nand.md', 22, 'MTD'],
  ['linux-driver-23-ethernet-mac-phy-netdev.md', 23, 'Ethernet'],
  ['linux-driver-24-usb-host-device-otg.md', 24, 'USB'],
  ['linux-driver-25-v4l2-imx415-mipi-csi.md', 25, 'V4L2'],
  ['linux-driver-26-alsa-asoc-i2s-audio.md', 26, 'ASoC'],
  ['linux-driver-27-thermal-cpufreq-devfreq-pm.md', 27, 'thermal'],
  ['linux-driver-28-reliability-performance-debug.md', 28, '可靠性'],
];
```

Assert exact filenames are unchanged, each frontmatter order matches, title contains padded `#NN`, and orders are contiguous/unique.

- [ ] **Step 2: Run the new test and verify current metadata fails**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Expected: FAIL because current frontmatter follows legacy filename order.

- [ ] **Step 3: Update frontmatter order/title numbers without renaming files**

Only update `order` and title `#NN`; preserve description/date/series/tags/draft and all article bodies in this task.

- [ ] **Step 4: Rewrite `linux-driver-framework.md`**

Use a valid fenced Mermaid roadmap, explain historical filenames, list the exact new order, define four learning stages and cross-series boundaries, and state the capability gained after each stage.

- [ ] **Step 5: Verify order, Framework, redirects, and full baseline**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Run: `npm test`

Expected: PASS; old URLs remain because filenames are unchanged.

- [ ] **Step 6: Commit roadmap and metadata**

```bash
git add tests/linux-driver-learning-path.test.mjs docs/articles/linux-driver
git commit -m "docs: reorder Linux driver learning path"
```

### Task 2: Rewrite foundations 1-4

**Files:**
- Modify: `linux-driver-02-first-kernel-module-and-char-device.md` (new #01)
- Modify: `linux-driver-14-linux-device-model-lifecycle.md` (new #02)
- Modify: `linux-driver-01-platform-device-model-and-probe.md` (new #03)
- Modify: `linux-driver-15-driver-memory-io-mapping.md` (new #04)
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: new frontmatter order and Framework from Task 1.
- Produces: module/ABI, Driver Core, platform/DT, memory/MMIO concepts required by every later article.

- [ ] **Step 1: Add these four files to `qualityContractFiles` and verify red**

The quality test rejects all five legacy step headings, requires at least two official-source links, checks article-specific diagrams, and checks ordered introductions:

```js
const introOrder = {
  'linux-driver-02-first-kernel-module-and-char-device.md': ['内核空间', '模块', 'Kbuild', '字符设备', 'file_operations'],
  'linux-driver-14-linux-device-model-lifecycle.md': ['struct device', 'struct device_driver', 'struct bus_type', 'match', 'probe'],
  'linux-driver-01-platform-device-model-and-probe.md': ['Device Tree', 'platform_device', 'of_match_table', 'probe', 'devm_'],
  'linux-driver-15-driver-memory-io-mapping.md': ['虚拟地址', 'kmalloc', 'copy_to_user', 'resource', 'ioremap', 'readl'],
};
```

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Expected: FAIL on legacy template/source/introduction contracts.

- [ ] **Step 2: Rewrite article #01 as a true first driver lab**

Begin with kernel/user-space differences, module/Kbuild/load/unload, then build a minimal character device ABI. Explain module reference/lifetime and make the next Device Model article necessary; do not assume platform/DT.

- [ ] **Step 3: Rewrite article #02 around Driver Core object relationships**

Cover bus/device/driver/class/kobject, registration/match/probe/remove, sysfs topology, references and devres. Do not introduce platform-specific DT resources.

- [ ] **Step 4: Rewrite article #03 as the DT-to-probe concrete path**

Follow DTS node -> OF population -> platform_device -> OF match -> resources -> probe/deferred probe -> remove. Reuse Device Model terms without redefining them.

- [ ] **Step 5: Rewrite article #04 around address and access boundaries**

Distinguish CPU virtual/physical/I/O address; compare kmalloc/vmalloc/pages; usercopy; resource request; devm_ioremap_resource; readl/writel and mmap safety. Explicitly defer DMA address to #17.

- [ ] **Step 6: Run tests, read articles in order, and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Manual gate: each article may assume only prior articles; no undefined Device Model/MMIO term.

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild Linux driver foundations"
```

### Task 3: Rewrite interfaces, execution contexts, synchronization, and debugging 5-8

**Files:**
- Modify: `linux-driver-03-misc-sysfs-procfs-debugfs.md`
- Modify: `linux-driver-06-timers-workqueues-delayed-work.md`
- Modify: `linux-driver-07-kernel-synchronization-primitives.md`
- Modify: `linux-driver-13-driver-debugging-methodology.md`
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: object, memory, ABI, MMIO, probe/remove foundations.
- Produces: stable interface, context, locking and diagnostic rules used by all subsystem articles.

- [ ] **Step 1: Extend batch quality contracts and verify red**

Require ordered topic maps for cdev/misc/sysfs/debugfs, process/IRQ/timer/work contexts, lock selection, and hypothesis/evidence debugging. Require the debugging article to distinguish dynamic_debug, ftrace, tracepoint, perf, KASAN and hardware evidence.

- [ ] **Step 2: Rewrite #05 around ABI ownership**

Compare cdev/misc for file operations, sysfs one-value attributes, debugfs diagnostics, and narrowly justified procfs. Include permissions, usercopy, poll, offline/unbind and ABI stability.

- [ ] **Step 3: Rewrite #06 around execution-context transitions**

Define what may sleep, hard IRQ/softirq/process context, timer callback, workqueue/delayed work, cancellation and remove/suspend races.

- [ ] **Step 4: Rewrite #07 around shared-state invariants**

Choose mutex/spinlock/atomic/refcount/completion/waitqueue/RCU by access pattern; explain lock ordering, memory ordering, IRQ variants and teardown.

- [ ] **Step 5: Rewrite #08 as a repeatable diagnostic method**

Use a concrete device failure to move from symptom -> layer -> hypothesis -> minimum observation -> hardware correlation -> fix -> regression. Do not repeat the final long-term reliability article.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild Linux driver interfaces and concurrency"
```

### Task 4: Rewrite hardware resources and GPIO practices 9-12

**Files:**
- Modify: `linux-driver-16-pinctrl-gpio-irq-subsystem.md`
- Modify: `linux-driver-04-gpio-led-subsystem.md`
- Modify: `linux-driver-05-keys-interrupt-input-subsystem.md`
- Modify: `linux-driver-17-clock-reset-regulator-power-sequence.md`
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: Device Model, platform resources, context and synchronization.
- Produces: pin, GPIO, interrupt, wakeup and power sequencing models needed by bus/subsystem drivers.

- [ ] **Step 1: Extend contracts and verify legacy overlap fails**

Contracts require #09 to own pinctrl/gpiolib/irqchip/irq_domain theory, #10 to own LED practice, #11 to own Input/debounce/wakeup practice, and #12 to own clock/reset/regulator sequencing. Reject duplicated multi-paragraph framework definitions in practice articles.

- [ ] **Step 2: Rewrite #09 as the framework article**

Follow DT pin state -> pinctrl consumer -> GPIO descriptor -> gpiochip -> IRQ mapping -> irqchip/domain -> request_threaded_irq, including suspend state and cascaded interrupts.

- [ ] **Step 3: Rewrite #10 as one complete LED implementation**

Use gpio-leds first, then a minimal custom consumer only when needed. Validate logical active-low semantics, ownership, LED class, triggers, suspend/remove and physical voltage.

- [ ] **Step 4: Rewrite #11 as one complete input-key implementation**

Use gpio-keys, threaded IRQ/debounce, input event, poll/evtest, wakeup and repeat/bounce diagnostics without re-teaching irq_domain.

- [ ] **Step 5: Rewrite #12 as rollback-safe power sequencing**

Order regulator/clock/reset/pinctrl/GPIO, handle probe defer, ID read, unwind, runtime PM and repeated cold-start tests.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild Linux driver hardware resource guides"
```

### Task 5: Rewrite common peripheral buses and small subsystems 13-16

**Files:**
- Modify: `linux-driver-08-i2c-regmap-sensor-driver.md`
- Modify: `linux-driver-09-spi-driver-transfers.md`
- Modify: `linux-driver-10-uart-tty-console-driver.md`
- Modify: `linux-driver-11-pwm-adc-watchdog.md`
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: resources, power, synchronization and debugging foundations.
- Produces: reusable bus/controller/client/transfer models before advanced DMA/subsystems.

- [ ] **Step 1: Add bus-specific contracts and verify red**

Require I2C adapter/client/message/regmap; SPI controller/device/message/transfer/CS; UART hardware/serial core/TTY/console; PWM, IIO ADC and watchdog framework boundaries. Include official bindings/docs and real observation commands.

- [ ] **Step 2: Rewrite I2C/regmap sensor article**

Explain electrical addressing and repeated-start, Linux objects, DT, regmap config/cache/endian, IRQ/PM, IIO/hwmon choice and bus trace.

- [ ] **Step 3: Rewrite SPI article**

Explain mode/clock/CS/full duplex, object model, message atomicity, transfer lifetime, DMA threshold and logic-analyzer validation.

- [ ] **Step 4: Rewrite UART/TTY/console article**

Separate earlycon/console/TTY/serial core, implement startup/shutdown/IRQ/DMA/termios/flow-control and test console handoff/recovery.

- [ ] **Step 5: Rewrite PWM/IIO/watchdog article**

Use one shared resource/lifecycle introduction, then three substantial framework sections. Avoid presenting unrelated mini-tutorials as one flat list.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild Linux peripheral driver guides"
```

### Task 6: Rewrite DMA, IOMMU, remote processors, and NVMEM 17-20

**Files:**
- Modify: `linux-driver-12-dma-cache-coherency.md`
- Modify: `linux-driver-18-iommu-dma-address-translation.md`
- Modify: `linux-driver-19-firmware-remoteproc-rpmsg.md`
- Modify: `linux-driver-20-rtc-nvmem-eeprom-efuse.md`
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: address, ownership, synchronization, PM and bus foundations.
- Produces: safe data movement, cross-processor messaging and persistent board-data models.

- [ ] **Step 1: Add accuracy contracts and verify red**

Explicitly distinguish DMA mapping API from DMAengine; reject claims that coherent memory guarantees CPU/Device ordering or physical continuity; require IOVA/domain/group/fault and DMA-BUF/fence boundaries.

- [ ] **Step 2: Rewrite DMA article against official DMA API semantics**

Cover mask, coherent/streaming/SG map/sync/unmap, barriers and ownership; separately explain DMAengine channel/descriptor/callback. Include non-coherent and teardown examples.

- [ ] **Step 3: Rewrite IOMMU article**

Explain device DMA address -> IOVA -> PA, domain/group/IOTLB/fault, stale DMA, DMA-BUF attachment/map/fence and multi-device ownership. Correct third-party simplifications.

- [ ] **Step 4: Rewrite firmware/remoteproc/rpmsg article**

Follow firmware request -> resource table -> remoteproc boot/stop -> virtio/rpmsg channel -> endpoint protocol -> crash/recovery, with versioned messages and lifetime rules.

- [ ] **Step 5: Rewrite RTC/NVMEM article**

Separate timekeeping from named board-data cells; cover provider/consumer, EEPROM write policy, eFuse irreversible operations, validation and upgrade provenance.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild Linux DMA and platform-data guides"
```

### Task 7: Rewrite advanced storage, networking, multimedia, and power 21-28

**Files:**
- Modify: `linux-driver-21-block-storage-emmc-sd.md`
- Modify: `linux-driver-22-mtd-ubi-nor-nand.md`
- Modify: `linux-driver-23-ethernet-mac-phy-netdev.md`
- Modify: `linux-driver-24-usb-host-device-otg.md`
- Modify: `linux-driver-25-v4l2-imx415-mipi-csi.md`
- Modify: `linux-driver-26-alsa-asoc-i2s-audio.md`
- Modify: `linux-driver-27-thermal-cpufreq-devfreq-pm.md`
- Modify: `linux-driver-28-reliability-performance-debug.md`
- Test: `tests/linux-driver-learning-path.test.mjs`

**Interfaces:**
- Consumes: all core driver models and infrastructure from Tasks 2-6.
- Produces: subsystem entry guides and final system-level validation without duplicating dedicated USB/video/audio series.

- [ ] **Step 1: Add subsystem boundary contracts and verify red**

Require each article to name its kernel objects, data path, userspace evidence, PM/remove path and dedicated-series handoff where applicable.

- [ ] **Step 2: Rewrite block and MTD storage articles**

Block: request/bio/MMC host/card/CQE/partition/filesystem/error recovery. MTD: raw flash/ECC/bad block/partition/UBI/UBIFS/power loss. Keep their semantics distinct.

- [ ] **Step 3: Rewrite Ethernet article**

Follow PHY/MDIO/phylink/netdev/NAPI/DMA ring to socket-visible behavior, counters, link changes, PM and reset.

- [ ] **Step 4: Rewrite USB, V4L2 and ASoC integration articles**

USB focuses controller/PHY/role/HCD/UDC and links the USB series. V4L2 focuses subdev/media graph/format/buffer/CSI and links video-audio. ASoC focuses component/DAI/machine/DAPM/PCM/clock and links audio articles.

- [ ] **Step 5: Rewrite thermal/power and reliability articles**

Thermal article relates sensors, zones, cooling, CPUFreq/Devfreq and runtime/system PM. Reliability article builds reproducible baseline, trace/perf, fault injection, suspend/resume, remove/rebind and resource-conservation release gates without repeating Task 3 tools.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

```bash
git add docs/articles/linux-driver tests/linux-driver-learning-path.test.mjs
git commit -m "docs: rebuild advanced Linux driver subsystem guides"
```

### Task 8: Full editorial, Mermaid, site, and deployment verification

**Files:**
- Verify: `docs/articles/linux-driver/*.md`
- Verify: `tests/linux-driver-learning-path.test.mjs`
- Verify: site routes and legacy URLs

**Interfaces:**
- Consumes: all rewritten batches.
- Produces: the deployable, publicly verified Linux driver series.

- [ ] **Step 1: Run structural and source audits**

Run: `rg -n "初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环|TBD|TODO" docs/articles/linux-driver`

Verify no article contains all four legacy step-H2 headings; manually review introductions, overlap boundaries and references.

- [ ] **Step 2: Run focused and full test suites**

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Parse every Linux driver Mermaid block**

Use the project Mermaid version in a DOM-capable temporary validator. Report total diagrams and zero parse failures.

- [ ] **Step 4: Run Astro diagnostics and production build**

Run: `npx astro check`

Run: `npm run build`

Expected: 0 Astro errors; all 28 canonical legacy URLs and new displayed order build successfully.

- [ ] **Step 5: Preview representative pages**

Inspect new #01, #02, #03, #09, #17, #21, #24, #25 and #28. Verify learning prerequisites, TOC, Mermaid, code/table wrapping, series next/previous order and dedicated-series links.

- [ ] **Step 6: Merge, push, and deploy**

Rebase onto latest `main`, rerun full tests/build, fast-forward merge without touching unrelated main-worktree changes, push `origin main`, wait for GitHub Pages success and fetch representative public pages to verify order/title/content.
