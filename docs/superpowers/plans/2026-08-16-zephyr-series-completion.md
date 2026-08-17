# Zephyr Series Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Complete the 23 missing Zephyr practical articles while preserving a reproducible nRF52832 DK learning path for experienced FreeRTOS and bare-metal developers.

**Architecture:** Deliver the series in seven dependency-ordered content blocks. Every article is a self-contained Astro Markdown document with valid frontmatter, a buildable Zephyr application, at least two Mermaid diagrams, FreeRTOS/bare-metal comparisons, troubleshooting, exercises, and milestones. Zephyr 4.4.x documentation is the source of truth for APIs and configuration; nrf52dk/nrf52832 is the primary board target.

**Tech Stack:** Astro content collections, Markdown, Mermaid 11, Zephyr 4.4.x, CMake, Kconfig, Devicetree, west, Zephyr SDK, nRF52832 DK, Node test runner.

---

## File Structure

| Files | Responsibility |
| --- | --- |
| docs/articles/zephyr/zephyr-04-app-structure-west-module.md | Application layout, configuration layering, west workspace and modules. |
| docs/articles/zephyr/zephyr-05-thread-scheduling.md through zephyr-08-memory-management.md | Kernel API migration from FreeRTOS. |
| docs/articles/zephyr/zephyr-09-driver-model-device-api.md through zephyr-12-custom-driver-devicetree.md | Device model and device-tree-driven driver development. |
| docs/articles/zephyr/zephyr-13-ble-stack-gap-gatt.md through zephyr-16-ble-security-power.md | BLE host/controller, GATT, data flow, security and low power. |
| docs/articles/zephyr/zephyr-17-power-management.md and zephyr-18-logging-shell-debug.md | Product-readiness facilities. |
| docs/articles/zephyr/zephyr-19-settings-nvs-flash-partition.md through zephyr-21-dfu-smp-ble-ota.md | Persistent storage, MCUboot, and BLE DFU. |
| docs/articles/zephyr/zephyr-22-peripheral-advanced-pwm-adc-ppi.md through zephyr-26-testing-twister-ztest-engineering.md | Peripheral integration, board porting, final project, and tests. |
| tests/site-content-config.test.mjs | Existing frontmatter regression test; do not weaken it. |

Each article uses Astro frontmatter with a title, targeted Chinese description, serial pubDate, series: zephyr, its unique order, tags, and draft: false.

## Shared Content Acceptance Procedure

- [ ] Check the corresponding Zephyr 4.4.x documentation and headers before each article for API signatures, Kconfig symbols, Devicetree bindings, and command flags.
- [ ] Use west build -p always -b nrf52dk/nrf52832 <application-path> for nRF52832 DK samples unless sysbuild, MCUboot, or Twister needs a documented variant.
- [ ] Define every first-use Zephyr term and pair it with a concise FreeRTOS or bare-metal analogy.
- [ ] Include two or more Mermaid blocks, a Chinese figure placeholder, application tree, complete CMakeLists.txt, prj.conf, source, overlay when needed, common failures, exercises, and milestones.
- [ ] End with a summary and a final tag line. Exclude drafting language, article-number references in body text, future previews, total-series lists, and AI-image prompts.
- [ ] After each block, run the following commands.

    rg -n "等等|让我|不对|记错|嗯|哦|Hmm|草稿|思考|阶段一|下一篇|下一章|预告|后续|ZEP-NN" docs/articles/zephyr
    npm test
    npm run build

Expected: no prohibited wording in new bodies, passing Node tests, and a successful Astro production build.

### Task 1: Application Engineering

**Files:**
- Create: docs/articles/zephyr/zephyr-04-app-structure-west-module.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify application and module behavior**

Read Zephyr 4.4.x documentation for application development, configuration fragments, EXTRA_ZEPHYR_MODULES, modules, and west manifests. Confirm that board-specific application files use boards/nrf52dk_nrf52832.conf and boards/nrf52dk_nrf52832.overlay while the build target remains nrf52dk/nrf52832.

- [ ] **Step 2: Write the article and complete example**

Create order 4 with pubDate 2026-08-16 and tags for application structure, west, CMake, and Zephyr modules. Show an application tree with CMakeLists.txt, prj.conf, board config, board overlay, src/main.c, and modules/sensor_helper. Explain when an application target is sufficient and when an out-of-tree module needs zephyr/module.yml, CMakeLists.txt, and Kconfig.

- [ ] **Step 3: Validate the article**

Run the shared acceptance procedure. Verify that order 4 appears between the existing Devicetree article and later content in the production build.

### Task 2: Kernel Mechanisms

**Files:**
- Create: docs/articles/zephyr/zephyr-05-thread-scheduling.md
- Create: docs/articles/zephyr/zephyr-06-sync-ipc-semaphore-queue.md
- Create: docs/articles/zephyr/zephyr-07-timer-workqueue.md
- Create: docs/articles/zephyr/zephyr-08-memory-management.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify kernel APIs**

Check Zephyr 4.4.x documentation and headers for K_THREAD_DEFINE, K_THREAD_STACK_DEFINE, k_thread_create, k_sem_*, k_mutex_*, K_MSGQ_DEFINE, k_msgq_*, k_timer_*, K_WORK_DELAYABLE_DEFINE, k_work_schedule, k_malloc, K_HEAP_DEFINE, memory domains, and userspace. Record ISR-safe and blocking-context restrictions exactly.

- [ ] **Step 2: Write the four linked articles**

Create orders 5 through 8 with pubDates 2026-08-17 through 2026-08-20. Reuse a producer/consumer application: static threads for scheduling, message queue plus semaphore and mutex for communication, delayable work instead of timer callback work, and fixed heap/memory-pool comparison. Include stack sizing and RAM accounting for 64 KB RAM. Contrast xTaskCreate, FreeRTOS queues, timer service callbacks, and pvPortMalloc.

- [ ] **Step 3: Validate kernel consistency**

Ensure each article's application tree, CMakeLists.txt, prj.conf, and main.c agree. Run the shared acceptance procedure and inspect frontmatter orders 5 through 8.

### Task 3: Device-Tree-Driven Driver Development

**Files:**
- Create: docs/articles/zephyr/zephyr-09-driver-model-device-api.md
- Create: docs/articles/zephyr/zephyr-10-gpio-led-button-interrupt.md
- Create: docs/articles/zephyr/zephyr-11-uart-spi-i2c-sensor.md
- Create: docs/articles/zephyr/zephyr-12-custom-driver-devicetree.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify device model, bindings, and wiring**

Check the Zephyr device model and GPIO/I2C/SPI/UART API references, gpio-keys and gpio-leds bindings, and nRF52 DK Devicetree. Confirm LED aliases, button aliases, interrupt callback requirements, and every binding property. For a BME280 or LIS2DH12 example, provide an exact I2C wiring table and matching overlay.

- [ ] **Step 2: Write the four driver articles**

Create orders 9 through 12 with pubDates 2026-08-21 through 2026-08-24. Cover struct device, DEVICE_DT_GET, readiness checks, subsystem API vtables, GPIO interrupt offloading, gpio_dt_spec, i2c_dt_spec or spi_dt_spec, and a custom driver with a YAML binding, public API header, configuration/data structs, and DEVICE_DT_DEFINE. Use diagrams to connect compatible matching, generated macros, and initialization levels.

- [ ] **Step 3: Validate hardware assumptions**

Name every external pin and ensure interrupt handlers avoid blocking work. Run the shared acceptance procedure and inspect orders 9 through 12.

### Task 4: BLE Applications

**Files:**
- Create: docs/articles/zephyr/zephyr-13-ble-stack-gap-gatt.md
- Create: docs/articles/zephyr/zephyr-14-custom-gatt-service.md
- Create: docs/articles/zephyr/zephyr-15-ble-sensor-data-upload.md
- Create: docs/articles/zephyr/zephyr-16-ble-security-power.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify Bluetooth API and resources**

Read Zephyr Bluetooth documentation and headers for bt_enable, advertising parameter macros, BT_GATT_SERVICE_DEFINE, characteristics, CCC configuration, bt_gatt_notify, connection callbacks, security callbacks, bt_conn_set_security, and connection-parameter updates. Check the nRF52832 flash/RAM budget for the peripheral role and nRF Connect mobile application baseline.

- [ ] **Step 2: Write the four BLE articles**

Create orders 13 through 16 with pubDates 2026-08-25 through 2026-08-28. Start with GAP/ATT/GATT and host/controller split; then define a custom environmental-data service with CCC-controlled notifications. Connect sensor acquisition through a work queue, then add bonding, pairing, whitelist policy, advertising interval, connection interval, and RAM/power trade-offs. Include only verified prj.conf symbols.

- [ ] **Step 3: Validate mobile-observable behavior**

Specify the advertising name, service UUID, readable/notify behavior, pairing prompt, and reboot/reconnect outcome. Run the shared acceptance procedure and inspect orders 13 through 16.

### Task 5: Product-Readiness Facilities

**Files:**
- Create: docs/articles/zephyr/zephyr-17-power-management.md
- Create: docs/articles/zephyr/zephyr-18-logging-shell-debug.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify power and diagnostic procedures**

Check Zephyr documentation for system power states, device PM, logging backends and deferred logging, Shell registration, coredump backends, and J-Link/GDB runners. Distinguish nRF52832 DK functionality from options requiring a current meter or custom hardware.

- [ ] **Step 2: Write the two articles**

Create order 17 with pubDate 2026-08-29 and order 18 with pubDate 2026-08-30. Show a low-duty-cycle BLE sensor loop with baseline and measurement procedure, then an application with module log levels, runtime Shell inspection, an assert/fault workflow, and source-level debugging. Explain the timing and power cost of serial logging.

- [ ] **Step 3: Validate observability and safety**

Make serial and debugger observations specific, label optional measurement equipment, and keep every fault demonstration recoverable through reset. Run the shared acceptance procedure.

### Task 6: Persistent Storage, MCUboot, and DFU

**Files:**
- Create: docs/articles/zephyr/zephyr-19-settings-nvs-flash-partition.md
- Create: docs/articles/zephyr/zephyr-20-mcuboot-deep-dive-bootloader.md
- Create: docs/articles/zephyr/zephyr-21-dfu-smp-ble-ota.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify storage and secure-update details**

Check fixed-partitions, NVS, settings, sysbuild, MCUboot, MCUmgr, and SMP documentation. Calculate dual-image space for the nRF52832 before recommending image limits. Separate generic Zephyr partitioning from Nordic Partition Manager instead of treating pm_static.yml as mandatory. Verify signing, confirmation, rollback, and SMP Bluetooth configuration from the selected version samples.

- [ ] **Step 2: Write the three linked articles**

Create orders 19 through 21 with pubDates 2026-08-31 through 2026-09-02. Cover flash partitions, NVS records, settings handlers; then image headers, TLVs, signing keys, test/permanent confirmation, and swap/overwrite/direct-XIP/RAM-load applicability. Complete the block with a BLE SMP procedure: sysbuild, sign, inspect image state, transfer, reboot, confirm, and recover from a failed candidate.

- [ ] **Step 3: Validate upgrade safety**

Include a partition map whose byte ranges add up, a precise image-state transition diagram, and warnings about key custody, power loss, and recovery access. Run the shared acceptance procedure and inspect orders 19 through 21.

### Task 7: Peripheral Integration, Porting, Final Project, and Testing

**Files:**
- Create: docs/articles/zephyr/zephyr-22-peripheral-advanced-pwm-adc-ppi.md
- Create: docs/articles/zephyr/zephyr-23-board-porting-part1-bsp.md
- Create: docs/articles/zephyr/zephyr-24-board-porting-part2-peripherals.md
- Create: docs/articles/zephyr/zephyr-25-final-project-ble-sensor-node.md
- Create: docs/articles/zephyr/zephyr-26-testing-twister-ztest-engineering.md
- Test: tests/site-content-config.test.mjs

- [ ] **Step 1: Verify peripheral, porting, and test-system details**

Check PWM, ADC, pinctrl, Nordic PPI/DPPI support on nRF52832, board-porting, SoC-porting, linker, runner, ztest, and Twister documentation. State that PPI is Nordic-specific, DMA depends on the peripheral, and a real new-SoC port cannot be demonstrated on the existing DK.

- [ ] **Step 2: Write the five capstone articles**

Create orders 22 through 26 with pubDates 2026-09-03 through 2026-09-07. Build a PWM/ADC event pipeline, explain out-of-tree board directory plus startup/linker/runner contracts, cover pinctrl/clocks/peripheral driver adaptation, integrate sensor/BLE/low-power/settings/DFU into one environmental sensor node, then finish with ztest, testcase.yaml, west twister target selection, and hardware versus native simulation limits.

- [ ] **Step 3: Validate end-to-end continuity**

Audit that the final project relies only on concepts already introduced, porting examples are clearly illustrative when not buildable on nRF52, and Twister commands name valid platforms or suites. Run the shared acceptance procedure followed by a final production build.

## Final Verification Task

**Files:**
- Verify: docs/articles/zephyr/*.md
- Verify: tests/site-content-config.test.mjs

- [ ] **Step 1: Check inventory and frontmatter**

Run:

    Get-ChildItem docs/articles/zephyr -Filter 'zephyr-*.md' | Sort-Object Name | Select-Object -ExpandProperty Name
    node --test tests/site-content-config.test.mjs

Expected: all files from zephyr-01 through zephyr-26 exist and the Zephyr frontmatter test passes.

- [ ] **Step 2: Check long-form and diagram contract**

Run:

    Get-ChildItem docs/articles/zephyr -Filter 'zephyr-*.md' | ForEach-Object {
      $lines = (Get-Content $_.FullName).Count
      $diagrams = (Select-String -Path $_.FullName -Pattern 'mermaid').Count
      "{0}: {1} lines, {2} Mermaid markers" -f $_.Name, $lines, $diagrams
    }

Expected: every added article is substantial and has at least two Mermaid markers; expand any article that fails either condition.

- [ ] **Step 3: Run site regression checks**

Run:

    npm test
    npm run build
    git diff --check

Expected: all tests pass, Astro produces the static site, and Git reports no whitespace errors.
