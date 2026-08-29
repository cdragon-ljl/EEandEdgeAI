# Linux Driver Textbook Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 28-article Linux Driver series with a smooth, beginner-oriented 30-article textbook path that covers every chapter in the EmbedFire guide, preserves historical URLs, and remains deployable on the existing Astro site.

**Architecture:** New articles are authored first under `docs/drafts/linux-driver-textbook/`, outside Astro's content collection, so the current published series stays intact while prose is reviewed. A shared test manifest records the 30 target files, the 38-topic EmbedFire coverage map, and legacy redirects. After all drafts pass editorial review, one cutover task moves them into `docs/articles/linux-driver/`, replaces the framework and tests, and adds static redirect routes.

**Tech Stack:** Markdown, Astro 4 content collections, Node.js test runner, Mermaid 11, PowerShell/Git, Linux 6.12 LTS documentation, RV1126 vendor kernel and device tree.

**Spec:** `docs/superpowers/specs/2026-08-29-linux-driver-textbook-rewrite-design.md`

## Global Constraints

- Publish exactly 30 core Linux Driver articles in the order defined by spec section 5.
- Cover all 38 EmbedFire directory topics through the explicit coverage map; merged topics may not silently disappear.
- Explain generic behavior against Linux 6.12 LTS and label RV1126 vendor-kernel differences separately.
- Assume readers know C, Makefile, and common Linux commands but have no driver-development experience.
- Use the teaching sequence: concrete problem, intuitive model, necessary kernel source, reproducible experiment, observed result, natural transition.
- Number every prose H2 and H3 hierarchically when it exists: `## 1. Descriptive title` and `### 1.1 Descriptive title`, with each H3 aligned to its parent H2. This is structural numbering, not a process-step template, and it does not impose a minimum heading count.
- Do not use article length, heading count, table count, code-block count, or diagram count as quality gates.
- Do not restore the shared four-step template, repeated acceptance-question sections, or appended expansion prose.
- Keep the current 28 published pages available until the final cutover.
- Stop after the first article sample and obtain explicit prose approval before drafting articles 02-30.
- Preserve all 28 historical Linux Driver slugs and update the older BSP redirect targets to avoid redirect chains.
- Do not include full V4L2, ASoC, Remoteproc/RPMsg, USB, or PCIe deep dives in the 30-article core path; link to their owning series.

---

### Task 1: Create the Curriculum Manifest and Draft Editorial Tests

**Files:**
- Create: `tests/fixtures/linux-driver-textbook-manifest.mjs`
- Create: `tests/linux-driver-textbook-drafts.test.mjs`

**Interfaces:**
- Produces: `plannedArticles: Array<{ file: string; order: number; titleToken: string }>`
- Produces: `wildfireTopics: string[]` containing the 38 official directory identifiers.
- Produces: `coverageByOrder: Record<number, string[]>`.
- Produces: `legacyRedirects: Record<string, string>` for the 28 current slugs.
- Consumed by: draft validation in Tasks 2-11 and final publication/redirect tests in Task 13.

- [ ] **Step 1: Write the shared 30-article manifest**

Use the exact 30 titles and order from spec section 5. Use these canonical filenames:

```js
export const plannedArticles = [
  { file: 'linux-driver-01-driver-environment-source-tree.md', order: 1, titleToken: '实验环境' },
  { file: 'linux-driver-02-kernel-module-first-experiment.md', order: 2, titleToken: '内核模块' },
  { file: 'linux-driver-03-vfs-character-device-cdev.md', order: 3, titleToken: '字符设备' },
  { file: 'linux-driver-04-character-led-driver-experiment.md', order: 4, titleToken: 'LED' },
  { file: 'linux-driver-05-device-model-kobject-class-sysfs.md', order: 5, titleToken: '设备模型' },
  { file: 'linux-driver-06-platform-bus-match-probe.md', order: 6, titleToken: 'platform' },
  { file: 'linux-driver-07-device-tree-dts-dtsi-compilation.md', order: 7, titleToken: '设备树' },
  { file: 'linux-driver-08-device-tree-led-overlay-experiment.md', order: 8, titleToken: 'Overlay' },
  { file: 'linux-driver-09-kernel-concurrency-lock-context.md', order: 9, titleToken: '并发' },
  { file: 'linux-driver-10-timer-hrtimer-workqueue.md', order: 10, titleToken: '定时器' },
  { file: 'linux-driver-11-pinctrl-gpio-descriptor.md', order: 11, titleToken: 'Pinctrl' },
  { file: 'linux-driver-12-interrupt-gic-irq-domain-layering.md', order: 12, titleToken: '中断' },
  { file: 'linux-driver-13-blocking-nonblocking-poll-async.md', order: 13, titleToken: '非阻塞' },
  { file: 'linux-driver-14-input-key-touchscreen.md', order: 14, titleToken: 'Input' },
  { file: 'linux-driver-15-i2c-regmap-driver.md', order: 15, titleToken: 'I2C' },
  { file: 'linux-driver-16-spi-message-transfer-driver.md', order: 16, titleToken: 'SPI' },
  { file: 'linux-driver-17-pwm-backlight-motor.md', order: 17, titleToken: 'PWM' },
  { file: 'linux-driver-18-power-management-runtime-pm-watchdog.md', order: 18, titleToken: '电源管理' },
  { file: 'linux-driver-19-iio-adc-driver.md', order: 19, titleToken: 'IIO' },
  { file: 'linux-driver-20-rtc-nvmem-eeprom.md', order: 20, titleToken: 'RTC' },
  { file: 'linux-driver-21-memory-dma-dmaengine-iommu-dmabuf.md', order: 21, titleToken: 'DMA' },
  { file: 'linux-driver-22-framebuffer-drm-kms-display.md', order: 22, titleToken: 'DRM' },
  { file: 'linux-driver-23-block-emmc-scsi-mtd-ubi-storage.md', order: 23, titleToken: '存储' },
  { file: 'linux-driver-24-usb-subsystem-overview.md', order: 24, titleToken: 'USB' },
  { file: 'linux-driver-25-uart-serial-core-tty-console.md', order: 25, titleToken: 'TTY' },
  { file: 'linux-driver-26-pci-pcie-enumeration-resource-irq.md', order: 26, titleToken: 'PCI' },
  { file: 'linux-driver-27-net-device-napi-mac-phy.md', order: 27, titleToken: '网络' },
  { file: 'linux-driver-28-smp-memory-barrier-percpu.md', order: 28, titleToken: 'SMP' },
  { file: 'linux-driver-29-driver-debug-dynamic-debug-ftrace.md', order: 29, titleToken: '驱动调试' },
  { file: 'linux-driver-30-driver-engineering-remove-recovery-soak.md', order: 30, titleToken: '驱动工程化' },
];
```

- [ ] **Step 2: Encode the 38-topic coverage map**

Use stable identifiers derived from the official RST paths, for example `base_exper_env`, `base_linuxkernel_module`, `subsystem_interrupt_layering`, and `advance_smp`. Assign them exactly according to spec section 5. The coverage test must compare sets and report both missing and unknown topics.

```js
export const wildfireTopics = [
  'base_exper_env', 'base_linuxkernel_module', 'base_first_module',
  'base_character_device', 'base_led_character_device',
  'base_linux_device_model', 'base_platform_driver', 'base_driver_tree',
  'base_device_tree_rgb_led', 'base_dynamic_device_tree',
  'base_concurrency_competition', 'base_timer',
  'subsystem_pinctrl_gpio', 'subsystem_interrupt',
  'subsystem_interrupt_layering', 'subsystem_blockio_noblockio',
  'subsystem_asyncnoti', 'subsystem_input_subsystem',
  'subsystem_i2c_subsystem', 'subsystem_spi_subsystem',
  'subsystem_regmap_api', 'subsystem_pwm_subsystem',
  'subsystem_sysfs_system', 'subsystem_power_management',
  'subsystem_iio_subsystem', 'subsystem_adc_driver',
  'subsystem_rtc_subsystem', 'subsystem_touch_driver',
  'subsystem_dma_iommu', 'subsystem_frame_buffer', 'subsystem_drm',
  'subsystem_block_device', 'subsystem_usb_subsystem',
  'subsystem_tty_subsystem', 'subsystem_scsi_subsystem',
  'subsystem_pci_subsystem', 'subsystem_net_subsystem', 'advance_smp',
];

export const coverageByOrder = {
  1: ['base_exper_env'],
  2: ['base_linuxkernel_module', 'base_first_module'],
  3: ['base_character_device'],
  4: ['base_led_character_device'],
  5: ['base_linux_device_model', 'subsystem_sysfs_system'],
  6: ['base_platform_driver'],
  7: ['base_driver_tree'],
  8: ['base_device_tree_rgb_led', 'base_dynamic_device_tree'],
  9: ['base_concurrency_competition'],
  10: ['base_timer'],
  11: ['subsystem_pinctrl_gpio'],
  12: ['subsystem_interrupt', 'subsystem_interrupt_layering'],
  13: ['subsystem_blockio_noblockio', 'subsystem_asyncnoti'],
  14: ['subsystem_input_subsystem', 'subsystem_touch_driver'],
  15: ['subsystem_i2c_subsystem', 'subsystem_regmap_api'],
  16: ['subsystem_spi_subsystem'],
  17: ['subsystem_pwm_subsystem'],
  18: ['subsystem_power_management'],
  19: ['subsystem_iio_subsystem', 'subsystem_adc_driver'],
  20: ['subsystem_rtc_subsystem'],
  21: ['subsystem_dma_iommu'],
  22: ['subsystem_frame_buffer', 'subsystem_drm'],
  23: ['subsystem_block_device', 'subsystem_scsi_subsystem'],
  24: ['subsystem_usb_subsystem'],
  25: ['subsystem_tty_subsystem'],
  26: ['subsystem_pci_subsystem'],
  27: ['subsystem_net_subsystem'],
  28: ['advance_smp'],
  29: [],
  30: [],
};

const covered = new Set(Object.values(coverageByOrder).flat());
assert.deepEqual([...covered].sort(), [...wildfireTopics].sort());
assert.equal(wildfireTopics.length, 38);
```

- [ ] **Step 3: Encode all historical redirect targets**

Use this exact mapping. The redirect test must compare all keys and values, not only the count.

```js
export const legacyRedirects = {
  'linux-driver-01-platform-device-model-and-probe': '/linux-driver/linux-driver-06-platform-bus-match-probe/',
  'linux-driver-02-first-kernel-module-and-char-device': '/linux-driver/linux-driver-02-kernel-module-first-experiment/',
  'linux-driver-03-misc-sysfs-procfs-debugfs': '/linux-driver/linux-driver-05-device-model-kobject-class-sysfs/',
  'linux-driver-04-gpio-led-subsystem': '/linux-driver/linux-driver-04-character-led-driver-experiment/',
  'linux-driver-05-keys-interrupt-input-subsystem': '/linux-driver/linux-driver-14-input-key-touchscreen/',
  'linux-driver-06-timers-workqueues-delayed-work': '/linux-driver/linux-driver-10-timer-hrtimer-workqueue/',
  'linux-driver-07-kernel-synchronization-primitives': '/linux-driver/linux-driver-09-kernel-concurrency-lock-context/',
  'linux-driver-08-i2c-regmap-sensor-driver': '/linux-driver/linux-driver-15-i2c-regmap-driver/',
  'linux-driver-09-spi-driver-transfers': '/linux-driver/linux-driver-16-spi-message-transfer-driver/',
  'linux-driver-10-uart-tty-console-driver': '/linux-driver/linux-driver-25-uart-serial-core-tty-console/',
  'linux-driver-11-pwm-adc-watchdog': '/linux-driver/linux-driver-17-pwm-backlight-motor/',
  'linux-driver-12-dma-cache-coherency': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-13-driver-debugging-methodology': '/linux-driver/linux-driver-29-driver-debug-dynamic-debug-ftrace/',
  'linux-driver-14-linux-device-model-lifecycle': '/linux-driver/linux-driver-05-device-model-kobject-class-sysfs/',
  'linux-driver-15-driver-memory-io-mapping': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-16-pinctrl-gpio-irq-subsystem': '/linux-driver/linux-driver-11-pinctrl-gpio-descriptor/',
  'linux-driver-17-clock-reset-regulator-power-sequence': '/linux-driver/linux-driver-18-power-management-runtime-pm-watchdog/',
  'linux-driver-18-iommu-dma-address-translation': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-19-firmware-remoteproc-rpmsg': '/bsp/',
  'linux-driver-20-rtc-nvmem-eeprom-efuse': '/linux-driver/linux-driver-20-rtc-nvmem-eeprom/',
  'linux-driver-21-block-storage-emmc-sd': '/linux-driver/linux-driver-23-block-emmc-scsi-mtd-ubi-storage/',
  'linux-driver-22-mtd-ubi-nor-nand': '/linux-driver/linux-driver-23-block-emmc-scsi-mtd-ubi-storage/',
  'linux-driver-23-ethernet-mac-phy-netdev': '/linux-driver/linux-driver-27-net-device-napi-mac-phy/',
  'linux-driver-24-usb-host-device-otg': '/linux-driver/linux-driver-24-usb-subsystem-overview/',
  'linux-driver-25-v4l2-imx415-mipi-csi': '/video-audio/av-04-v4l2-media-controller-driver-framework/',
  'linux-driver-26-alsa-asoc-i2s-audio': '/video-audio/av-12-alsa-asoc-driver-framework/',
  'linux-driver-27-thermal-cpufreq-devfreq-pm': '/linux-driver/linux-driver-18-power-management-runtime-pm-watchdog/',
  'linux-driver-28-reliability-performance-debug': '/linux-driver/linux-driver-30-driver-engineering-remove-recovery-soak/',
};
```

- [ ] **Step 4: Write draft-folder editorial tests**

The test scans `docs/drafts/linux-driver-textbook/*.md` if the folder exists. Every existing draft must:

- match one manifest filename;
- contain `series: linux-driver`, its manifest order, and `draft: true`;
- avoid a duplicate H1 after frontmatter;
- avoid `TBD`, `TODO`, `初学者扩展讲解`, `本章验收`, `验收问题`, and `建议保留`;
- after fenced code is stripped, require each existing prose H2 to match `## <number>. <title>` and each existing prose H3 to match `### <parent>.<child> <title>`;
- ignore heading-like lines inside fenced code when enforcing the numbering rule;
- cite at least one Linux, kernel source, Devicetree, or official subsystem document.

Do not test minimum lines, words, headings, tables, code blocks, or diagrams. A draft with no H2 or H3 remains valid.

- [ ] **Step 5: Run the new tests**

Run: `node --test tests/linux-driver-textbook-drafts.test.mjs`

Expected: all curriculum and redirect-manifest tests pass with zero draft files.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/linux-driver-textbook-manifest.mjs tests/linux-driver-textbook-drafts.test.mjs
git commit -m "test: define Linux driver textbook contracts"
```

### Task 2: Write and Review the Article 01 Sample

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-01-driver-environment-source-tree.md`

**Interfaces:**
- Consumes: manifest order 1 and the reader/platform assumptions from the spec.
- Produces: the approved prose pattern used by articles 02-30.
- Review gate: no later article may be drafted before explicit user approval.

- [ ] **Step 1: Read the reference material**

Read EmbedFire `base_exper_env`, Linux 6.12 `Documentation/process/changes.rst`, Linux Kbuild external-module documentation, the repository's article conventions, and current RV1126 BSP environment material.

- [ ] **Step 2: Draft the opening and learning path**

Open with the practical question: why a module that compiles on the PC may still fail on the board. Explain host, kernel source/build tree, cross compiler, target rootfs, and running kernel as one environment relationship before introducing commands.

- [ ] **Step 3: Add the reproducible environment inspection**

Include safe commands and explain their output:

```sh
uname -a
uname -r
cat /proc/version
zcat /proc/config.gz | head
readlink -f /lib/modules/$(uname -r)/build
make -s kernelrelease
${CROSS_COMPILE}gcc --version
```

For SDKs without `/proc/config.gz`, explain how to use the build output `.config`. Do not claim the RV1126 target exposes a path without evidence.

- [ ] **Step 4: Explain the kernel source map**

Introduce only `Documentation/`, `drivers/`, `include/`, `arch/`, `scripts/`, and the build output. Include at most one environment relationship diagram if prose alone is insufficient.

- [ ] **Step 5: Add the experiment record**

Have the reader record kernel release, source commit, config path, compiler triplet/version, board image, DTB, and module deployment directory. Explain how each field helps diagnose a later mismatch.

- [ ] **Step 6: Close by leading into article 02**

Establish that the environment is reproducible and ask the next natural question: what exactly is loaded when `insmod` inserts a module?

- [ ] **Step 7: Run editorial checks and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook/linux-driver-01-driver-environment-source-tree.md
git commit -m "docs: draft Linux driver environment lesson"
```

- [ ] **Step 8: Open the sample and pause**

Open the Markdown file in Codex. Ask the user to judge continuity, terminology density, experiment clarity, and whether it reads closer to EmbedFire. Do not start Task 3 until the user explicitly approves the sample.

### Task 3: Draft Articles 02-04, Module to LED

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-02-kernel-module-first-experiment.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-03-vfs-character-device-cdev.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-04-character-led-driver-experiment.md`

**Interfaces:**
- Consumes: the environment record and prose style approved in Task 2.
- Produces: a loaded module, a virtual character device, and the first RV1126 LED hardware experiment.

- [ ] **Step 1: Write article 02**

Follow one module from source through Kbuild, `.ko`, `insmod`, init, live state, exit, and `rmmod`. Explain `module_init`, `module_exit`, license, symbols, `vermagic`, `modinfo`, `insmod` versus `modprobe`, and dmesg. End with a minimal module that builds against the recorded kernel.

- [ ] **Step 2: Write article 03**

Start from `open/read/write` in userspace and follow VFS to `inode`, `file`, and `file_operations`. Introduce device numbers, `alloc_chrdev_region`, `cdev_init`, `cdev_add`, `copy_to_user`, and `copy_from_user` only when the virtual device needs them. Keep blocking I/O, poll, async notification, production ABI versioning, and hot-unbind out of this article.

- [ ] **Step 3: Write article 04**

Move from the virtual device to one RV1126 LED. Explain schematic/DTS evidence, GPIO ownership, the intentionally simple character-driver implementation, userspace control, and cleanup. State that article 11 later replaces direct GPIO-number handling with the descriptor framework.

- [ ] **Step 4: Verify continuity, test, and commit**

Read articles 01-04 in one pass and remove duplicated environment/VFS explanations.

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux module and character-device lessons"
```

### Task 4: Draft Articles 05-08, Device Model and Device Tree

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-05-device-model-kobject-class-sysfs.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-06-platform-bus-match-probe.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-07-device-tree-dts-dtsi-compilation.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-08-device-tree-led-overlay-experiment.md`

**Interfaces:**
- Consumes: the manually registered LED from article 04.
- Produces: a device/driver split, a platform probe path, and a DT-described LED.

- [ ] **Step 1: Write article 05**

Use the duplication in article 04 to motivate device/driver separation. Explain `device`, `device_driver`, `bus_type`, `class`, kobject, and the resulting `/sys/devices`, `/sys/bus`, and `/sys/class` views. Exclude devres, PM, unbind matrices, and custom-bus implementation unless needed for matching.

- [ ] **Step 2: Write article 06**

Explain why devices without a discoverable physical bus use platform bus. Follow `platform_driver_register` through match to probe, then obtain one named resource. Show the relationship among `platform_device`, `platform_driver`, and the underlying device model.

- [ ] **Step 3: Write article 07**

Teach DTS/DTSI structure, nodes, properties, labels, phandles, `compatible`, `reg`, `interrupts`, include order, dtc/build output, and how the DTB reaches RV1126. Pair source snippets with live-tree inspection rather than listing every property type.

- [ ] **Step 4: Write article 08**

Convert the LED experiment to DT plus platform driver, then explain Overlay as a controlled extension of the same object model. Include base-DTB compatibility, overlay application/removal limits, and evidence from sysfs/dmesg. Do not present unsupported RV1126 overlay commands as universally available.

- [ ] **Step 5: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux device-model and device-tree lessons"
```

### Task 5: Draft Articles 09-10 and Review Stage One

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-09-kernel-concurrency-lock-context.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-10-timer-hrtimer-workqueue.md`

**Interfaces:**
- Consumes: shared state and probe lifecycle introduced in articles 03-08.
- Produces: the execution-context model required by interrupts and asynchronous frameworks.

- [ ] **Step 1: Write article 09**

Begin with two callers updating the same LED/device state. Explain race conditions, process/interrupt context, preemption, atomic operations, mutex, spinlock, completion, and wait queue through concrete access patterns. Present lock selection as reasoning from context and critical section, not as an inventory table.

- [ ] **Step 2: Write article 10**

Begin with the need to act later without busy-waiting. Explain jiffies/timer, hrtimer, workqueue, delayed work, cancellation, and teardown using one delayed LED/status example. Make callback context and object lifetime visible through the experiment.

- [ ] **Step 3: Review, test, and commit**

Read articles 01-10 continuously. Article 09 may not assume interrupt knowledge before article 12, and article 10 may not assume IRQ bottom-half knowledge.

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux concurrency and deferred-work lessons"
```

### Task 6: Draft Articles 11-13, GPIO Through Async I/O

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-11-pinctrl-gpio-descriptor.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-12-interrupt-gic-irq-domain-layering.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-13-blocking-nonblocking-poll-async.md`

**Interfaces:**
- Consumes: DT resources, execution contexts, wait queues, and deferred work.
- Produces: event-driven GPIO input and userspace notification.

- [ ] **Step 1: Write article 11**

Start from pin multiplexing, then distinguish pinctrl provider state, gpiochip, descriptor lookup, direction, active-low semantics, and consumer APIs. Rebuild the LED with `gpiod_*` and explain why global GPIO numbers are not the portable abstraction.

- [ ] **Step 2: Write article 12**

Follow a physical key edge through GPIO controller, GIC, irq_domain mapping, generic IRQ core, top half, threaded handler, and completion. Use the RV1126 interrupt topology only after the generic path is clear.

- [ ] **Step 3: Write article 13**

Use the key event to explain blocking read, `O_NONBLOCK`, wait queues, `poll/epoll`, SIGIO, and `fasync`. Tie all notification methods to one event state so readers can compare them with the same test application.

- [ ] **Step 4: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux GPIO interrupt and async-IO lessons"
```

### Task 7: Draft Articles 14-17, Input and Peripheral Buses

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-14-input-key-touchscreen.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-15-i2c-regmap-driver.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-16-spi-message-transfer-driver.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-17-pwm-backlight-motor.md`

**Interfaces:**
- Consumes: GPIO/IRQ event path, device model, DT, and platform resources.
- Produces: standard-subsystem alternatives to private character devices.

- [ ] **Step 1: Write article 14**

Explain why input events are better than a private key character protocol. Follow input device registration and `input_report_key` to `/dev/input/eventX`, then extend the event model to a touchscreen's absolute coordinates and slots.

- [ ] **Step 2: Write article 15**

Build the I2C map from controller/adapter to client/driver and transfer. Use a small register-based device to motivate Regmap, then explain readable/writeable/volatile register policy and cache behavior without turning the article into a complete sensor guide.

- [ ] **Step 3: Write article 16**

Explain controller, device, message, transfer, chip select, mode, bits per word, and full-duplex timing. Use one bounded transfer experiment and interpret logic-analyzer evidence.

- [ ] **Step 4: Write article 17**

Explain PWM period, duty cycle, polarity, state application, and consumer frameworks through backlight or a safe low-power output. Distinguish PWM control from motor power electronics.

- [ ] **Step 5: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux input and peripheral-bus lessons"
```

### Task 8: Draft Articles 18-20 and Review Stage Two

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-18-power-management-runtime-pm-watchdog.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-19-iio-adc-driver.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-20-rtc-nvmem-eeprom.md`

**Interfaces:**
- Consumes: device lifecycle and subsystem consumer/provider patterns.
- Produces: power-state, sampled-data, time, and persistent-cell models.

- [ ] **Step 1: Write article 18**

Explain system sleep versus runtime PM, callback ordering, usage counting, autosuspend, wakeup, and watchdog as distinct mechanisms. Use one idle-peripheral timeline and one suspend/resume observation.

- [ ] **Step 2: Write article 19**

Explain IIO device, channel, raw/scale, triggered buffer, and ADC conversion using a readable RV1126-supported path. Teach sysfs reads first, then buffered capture only if the actual driver supports it.

- [ ] **Step 3: Write article 20**

Separate RTC time/alarm from NVMEM provider/cell and EEPROM storage. Use named cells for serial/MAC/calibration and explain format validation. Keep irreversible eFuse programming out of the runnable experiment.

- [ ] **Step 4: Review, test, and commit**

Read articles 11-20 continuously and check that standard subsystem interfaces replace private character protocols where appropriate.

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux power IIO and persistent-data lessons"
```

### Task 9: Draft Articles 21-23, DMA, Display, and Storage

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-22-framebuffer-drm-kms-display.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-23-block-emmc-scsi-mtd-ubi-storage.md`

**Interfaces:**
- Consumes: memory, device, resource, synchronization, and bus concepts from articles 01-20.
- Produces: large-data and complex-subsystem models for later overview chapters.

- [ ] **Step 1: Write article 21**

Begin with CPU and device viewing the same buffer differently. Explain allocation, DMA mask, coherent versus streaming mappings, ownership transitions, DMAengine channels/descriptors, IOVA/IOMMU, and dma-buf sharing in that dependency order. Use separate small code extracts instead of presenting the stack as one API.

- [ ] **Step 2: Write article 22**

Start with scanout and explain why framebuffer exposes a memory-oriented legacy interface. Then introduce DRM device, CRTC, plane, encoder, connector, atomic state, GEM, and KMS. Use one display pipeline and avoid duplicating the video-processing series.

- [ ] **Step 3: Write article 23**

Build the storage hierarchy from VFS/page cache to block layer/request queue, MMC/eMMC, and SCSI command model. Contrast block devices with raw MTD eraseblocks and explain UBI/UBIFS. Make block-versus-raw-flash the organizing question.

- [ ] **Step 4: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux DMA display and storage lessons"
```

### Task 10: Draft Articles 24-28, Major Kernel Subsystems

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-24-usb-subsystem-overview.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-25-uart-serial-core-tty-console.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-26-pci-pcie-enumeration-resource-irq.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-27-net-device-napi-mac-phy.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-28-smp-memory-barrier-percpu.md`

**Interfaces:**
- Consumes: foundation abstractions and complex memory/data-path concepts.
- Produces: subsystem maps that direct readers to dedicated USB/PCIe material without duplicating it.

- [ ] **Step 1: Write article 24**

Explain USB host controller, root hub, device/interface/endpoint, descriptors, enumeration, driver matching, URB, and gadget boundary as one overview. End with direct links to the USB series.

- [ ] **Step 2: Write article 25**

Follow UART hardware through `uart_port`, serial_core, TTY, line discipline, device node, and console. Explain earlycon versus normal console and termios through observable configuration.

- [ ] **Step 3: Write article 26**

Explain PCI enumeration, configuration space, BAR resources, `pci_driver` matching/probe, DMA, INTx/MSI/MSI-X, and PCIe relationship. Link to the PCIe series for link/TLP/ATU and high-throughput design.

- [ ] **Step 4: Write article 27**

Follow a received Ethernet frame from PHY and MAC DMA ring through NAPI, `net_device`, protocol stack, and socket. Use `ip` and `ethtool` evidence without turning the chapter into network administration.

- [ ] **Step 5: Write article 28**

Explain why driver concurrency changes on SMP. Introduce cache coherence versus ordering, compiler/CPU barriers, acquire/release, atomics, per-CPU data, and lockless caution through one producer/consumer example.

- [ ] **Step 6: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: draft Linux USB TTY PCI network and SMP lessons"
```

### Task 11: Draft Articles 29-30 and Perform the Full Editorial Pass

**Files:**
- Create: `docs/drafts/linux-driver-textbook/linux-driver-29-driver-debug-dynamic-debug-ftrace.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-30-driver-engineering-remove-recovery-soak.md`
- Create: `docs/drafts/linux-driver-textbook/linux-driver-framework.md`
- Modify: all 30 draft articles when continuity fixes are needed.

**Interfaces:**
- Consumes: every previous lesson and the complete course order.
- Produces: a coherent 30-article draft set ready for publication cutover.

- [ ] **Step 1: Write article 29**

Teach one reproducible failure from symptom capture through layer isolation, hypothesis, dynamic debug, tracepoints, ftrace, and source inspection. Explain tool choice from the question being asked; do not list unrelated commands.

- [ ] **Step 2: Write article 30**

Bring back the engineering topics deferred earlier: probe rollback, managed/unmanaged resource ordering, remove and hot unbind, in-flight work/DMA cancellation, failure injection, recovery evidence, performance baseline, soak testing, and release criteria. Tie every requirement to mechanisms already learned.

- [ ] **Step 3: Write the draft framework**

List all 30 canonical filenames in order, explain the four phases, prerequisites, experiment platform, and dedicated-series boundaries. Use one learning-path diagram at most.

- [ ] **Step 4: Run a terminology and continuity audit**

```powershell
rg -n "第一步|第二步|第三步|第四步|本章验收|验收问题|建议保留|初学者扩展讲解" docs\drafts\linux-driver-textbook
rg -n "必须|不能|不要|边界|闭环" docs\drafts\linux-driver-textbook
```

The second search is an editorial review list, not a zero-occurrence test. Keep a restrictive term only where it conveys a real safety or API rule.

- [ ] **Step 5: Read transition groups**

Read and repair prerequisite or repetition problems in groups 01-04, 05-10, 11-15, 16-20, 21-24, and 25-30.

- [ ] **Step 6: Test and commit**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: complete Linux driver textbook drafts"
```

### Task 12: Validate Technical Sources and Reproduce Representative Experiments

**Files:**
- Modify: affected draft articles when verification finds inaccuracies.

**Interfaces:**
- Consumes: complete draft set from Task 11.
- Produces: technically reviewed drafts with source and experiment evidence.

- [ ] **Step 1: Check official links**

Extract external links from the drafts. Verify Linux/Devicetree/source links resolve and support the nearby claim. Replace versionless vendor guesses with actual RV1126 SDK paths or explicitly label them as structural examples.

- [ ] **Step 2: Verify kernel identifiers**

For every quoted structure, callback, or helper, confirm spelling and ownership in Linux 6.12 source. Prioritize `class_create`, GPIO descriptors, timer APIs, I2C probe callbacks, DMAengine, DRM atomic state, and runtime PM.

- [ ] **Step 3: Reproduce representative software-only experiments**

Reproduce article 02 external-module build, article 03 virtual character-device read/write, article 09 concurrency demonstration, and article 10 timer/delayed-work example. Record commands and observed output without inventing board results.

- [ ] **Step 4: Review board-dependent experiments**

Cross-check RV1126 DTS nodes, compatible strings, clocks, GPIOs, interrupts, I2C/SPI instances, ADC channels, and storage paths against repository or SDK evidence. Where hardware execution is unavailable, state the exact board prerequisite instead of claiming success.

- [ ] **Step 5: Test and commit corrections**

```bash
node --test tests/linux-driver-textbook-drafts.test.mjs
git diff --check
git add docs/drafts/linux-driver-textbook
git commit -m "docs: verify Linux driver textbook sources"
```

### Task 13: Cut Over to the 30-Article Series and Preserve URLs

**Files:**
- Delete: current 28 `docs/articles/linux-driver/linux-driver-*.md` article files, excluding the framework until replacement.
- Move: 30 files from `docs/drafts/linux-driver-textbook/` to `docs/articles/linux-driver/`.
- Replace: `docs/articles/linux-driver/linux-driver-framework.md`
- Create: `src/data/linux-driver-legacy.json`
- Create: `src/pages/linux-driver/[...legacy].astro`
- Modify: `src/pages/bsp/[...legacy].astro`
- Replace: `tests/linux-driver-learning-path.test.mjs`
- Create: `tests/linux-driver-legacy-routes.test.mjs`
- Delete: `tests/linux-driver-textbook-drafts.test.mjs`
- Keep: `tests/fixtures/linux-driver-textbook-manifest.mjs`

**Interfaces:**
- Consumes: approved and verified draft files plus manifest/redirect data.
- Produces: exactly 30 published articles and 28 functioning historical routes.

- [ ] **Step 1: Write failing final-publication tests**

Replace the old 28-file and diagram-quota tests. Assert the exact 30 filenames, contiguous order 1-30, `draft: false`, ordered framework links, the exact 38-topic coverage set, and absence of old template/expansion headings. Do not add minimum prose or diagram counts.

Run: `node --test tests/linux-driver-learning-path.test.mjs`

Expected: FAIL because drafts have not moved and old articles still exist.

- [ ] **Step 2: Add redirect data and route**

Write `src/data/linux-driver-legacy.json` from the manifest's `legacyRedirects`. Implement `src/pages/linux-driver/[...legacy].astro` with the same canonical, meta-refresh, and JavaScript redirect behavior as the BSP legacy route:

```ts
import redirects from '../../data/linux-driver-legacy.json';

return Object.entries(redirects).map(([legacy, targetPath]) => ({
  params: { legacy },
  props: { targetPath, title: '文章已迁移' },
}));
```

- [ ] **Step 3: Update BSP legacy targets**

Change BSP entries 15-42 that point to old Linux Driver slugs so they target new canonical pages or owning series directly. Keep unrelated BSP 43-48 mappings unchanged.

- [ ] **Step 4: Write redirect tests**

Compare the JSON with `legacyRedirects`, assert 28 keys, assert every internal target ends in `/`, assert the Astro route imports the JSON, and verify all BSP 15-42 mappings are direct.

- [ ] **Step 5: Move the approved drafts**

Change all 30 drafts to `draft: false`, move them to `docs/articles/linux-driver/`, remove the 28 superseded article files, replace the framework, and remove the empty draft directory. Use `git mv` for moves and `git rm` only for explicitly superseded files.

- [ ] **Step 6: Run publication tests and the full suite**

```bash
node --test tests/linux-driver-learning-path.test.mjs tests/linux-driver-legacy-routes.test.mjs
npm test
```

Expected: zero failures. Update unrelated tests only when they encode the old 28-file contract; do not weaken other series contracts.

- [ ] **Step 7: Commit the cutover**

```bash
git add docs/articles/linux-driver src/data/linux-driver-legacy.json src/pages/linux-driver src/pages/bsp tests
git commit -m "docs: publish Linux driver textbook series"
```

### Task 14: Parse Diagrams, Build, Preview, and Deploy

**Files:**
- Modify: article Markdown only if final verification reveals a real rendering or link defect.

**Interfaces:**
- Consumes: final 30-article published tree.
- Produces: verified static output and a successful GitHub Pages deployment.

- [ ] **Step 1: Parse every Linux Driver Mermaid block**

Use Mermaid 11 with a temporary jsdom environment. Report the number of parsed diagrams and fix only actual parser failures. Restore dependencies with `npm ci` afterward so no temporary package change remains.

- [ ] **Step 2: Run final local verification**

```bash
npm ci
npm test
npx astro check
npm run build
git diff --check
git status --short
```

Expected: zero test/diagnostic errors, all 30 routes generated, and a clean worktree after any final-fix commit.

- [ ] **Step 3: Preview representative pages**

Inspect desktop and mobile rendering for the series index and articles 01, 03, 12, 21, and 30. Check heading rhythm, paragraph width, code wrapping, Mermaid, previous/next links, and redirects.

- [ ] **Step 4: Commit verified final corrections**

```bash
git add docs/articles/linux-driver src tests
git commit -m "docs: polish Linux driver textbook rendering"
```

Skip this commit if verification made no tracked changes.

- [ ] **Step 5: Refresh and integrate safely**

Fetch `origin`, confirm fast-forward ancestry, and rebase only the Linux Driver commits when necessary. Do not include unrelated unfinished local-main work.

- [ ] **Step 6: Push and wait for Pages**

Push the verified commit to `origin/main`. Wait for GitHub Actions `build` and `deploy` jobs to conclude with `success`.

- [ ] **Step 7: Verify the public site**

Verify the series index, canonical articles 01 and 30, at least three old Linux Driver URLs, and one old BSP-to-Linux redirect. Confirm canonical pages return HTTP 200 with expected markers and redirects reach their declared destinations.
