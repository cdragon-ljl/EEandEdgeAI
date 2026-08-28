# USB Reference-Quality Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 10-article USB series with a 14-article Linux 6.12 LTS series that matches the approved framework depth while preserving every published USB URL.

**Architecture:** Rewrite in four content batches: protocol/enumeration, Linux USB Core, device/class/Gadget drivers, then HCD/debug/MCU extension. New source files live under `docs/articles/usb/src/linux-6.12/`; old article slugs redirect through `src/pages/usb/[...legacy].astro`.

**Tech Stack:** Markdown, Mermaid, Linux 6.12 LTS USB Core/HCD/Gadget APIs, Node.js test runner, Astro static routes.

**Spec:** `docs/superpowers/specs/2026-08-28-usb-pcie-reference-rewrite-design.md`

## Global Constraints

- Linux code and API signatures target Linux 6.12 LTS; Linux 6.18 differences are isolated notes.
- EmbedFire supplies teaching structure and experiment ideas only; prose, diagrams, and code are original.
- Each article contains at least five meaningful Mermaid diagrams and two official primary-source links.
- Framework/API/experiment articles target 450–700 substantive lines; mechanism articles target 300–500.
- Every asynchronous path defines ownership, cancellation, disconnect, PM, and teardown behavior.
- Existing `/usb/<old-slug>/` pages remain available as static redirects.
- Unrelated series and machine-learning worktree files are never staged.
- Kernel-module build steps run in a Linux shell or WSL with `LINUX_612_TREE` set to an absolute Linux 6.12 source-tree path; verify it first with `test -f "$LINUX_612_TREE/Makefile"`.

---

### Task 1: Lock the 14-article USB sequence and migration contract

**Files:**
- Create: `tests/usb-reference-rewrite.test.mjs`
- Modify: `tests/site-content-config.test.mjs`
- Modify: `tests/usb-pcie-articles.test.mjs`

**Interfaces:**
- Consumes: the approved 14-topic USB table from the spec.
- Produces: `usbFiles`, `usbDepthContracts`, and `usbLegacyRedirects` used by all later tasks.

- [ ] **Step 1: Write the failing sequence test**

Define this exact published file sequence:

```js
const usbFiles = [
  'usb-01-topology-speed-transfers.md',
  'usb-02-enumeration-state-machine.md',
  'usb-03-descriptor-hierarchy.md',
  'usb-04-linux-usb-subsystem-architecture.md',
  'usb-05-core-objects-interface-altsetting-endpoint.md',
  'usb-06-core-api-pipes-dma.md',
  'usb-07-urb-lifecycle-concurrency.md',
  'usb-08-interface-driver-lifecycle-pm.md',
  'usb-09-hid-keyboard-mouse-input.md',
  'usb-10-vendor-bulk-character-driver.md',
  'usb-11-class-drivers-hid-msc-cdc-uvc-uac.md',
  'usb-12-gadget-composite-configfs-functionfs.md',
  'usb-13-host-controller-dwc3-xhci-devicetree.md',
  'usb-14-debugging-usbmon-cherryusb.md',
];
```

For every file assert `series: usb`, contiguous `order`, `draft: false`, title number, at least five Mermaid blocks, at least two official links, and no appended generic exercise/summary template.

- [ ] **Step 2: Define old-to-new URL expectations**

```js
const usbLegacyRedirects = {
  'usb-01-usb-architecture-enumeration': 'usb-01-topology-speed-transfers',
  'usb-02-linux-usb-driver-framework': 'usb-04-linux-usb-subsystem-architecture',
  'usb-03-usb-descriptors-deep-dive': 'usb-03-descriptor-hierarchy',
  'usb-04-urb-and-data-transfer': 'usb-07-urb-lifecycle-concurrency',
  'usb-05-usb-device-driver-practice': 'usb-10-vendor-bulk-character-driver',
  'usb-06-usb-gadget-intro': 'usb-12-gadget-composite-configfs-functionfs',
  'usb-07-usb-class-drivers': 'usb-11-class-drivers-hid-msc-cdc-uvc-uac',
  'usb-08-usb-troubleshooting': 'usb-14-debugging-usbmon-cherryusb',
  'usb-09-usb-host-controller-device-tree-bring-up': 'usb-13-host-controller-dwc3-xhci-devicetree',
  'usb-10-mcu-usb-cherryusb-stack': 'usb-14-debugging-usbmon-cherryusb',
};
```

Assert every mapping appears in `src/pages/usb/[...legacy].astro`.

- [ ] **Step 3: Run the test and verify RED**

Run: `node --test tests/usb-reference-rewrite.test.mjs`

Expected: FAIL because the first new filename and redirect route do not exist.

- [ ] **Step 4: Commit the contract**

```bash
git add tests/usb-reference-rewrite.test.mjs tests/site-content-config.test.mjs tests/usb-pcie-articles.test.mjs
git commit -m "test(usb): define reference-quality rewrite contract"
```

### Task 2: Rewrite USB protocol foundations as articles 01–03

**Files:**
- Create: `docs/articles/usb/usb-01-topology-speed-transfers.md`
- Create: `docs/articles/usb/usb-02-enumeration-state-machine.md`
- Create: `docs/articles/usb/usb-03-descriptor-hierarchy.md`
- Remove after redirect creation: old USB 01 and old USB 03 files

**Interfaces:**
- Consumes: USB 2.0/3.x public specification material and Linux 6.12 `drivers/usb/core/hub.c`, `message.c`, `config.c`.
- Produces: shared vocabulary for Device/Configuration/Interface/Endpoint, transfer scheduling, and enumeration.

- [ ] **Step 1: Write article 01 around bus-time mechanics**

Cover Host/Device/Hub topology, speed generations, packet/transaction/transfer distinction, endpoint/pipe, Control/Bulk/Interrupt/Isochronous scheduling, frame/microframe timing, split transactions, bandwidth reservation, and error/retry units. Required source markers: `usb_calc_bus_time`, `usb_maxpacket`, `usb_endpoint_xfer_*`.

- [ ] **Step 2: Write article 02 as an enumeration state machine**

Trace connect debounce, port reset, EP0 max packet discovery, `SET_ADDRESS`, descriptor reads, configuration selection, `SET_CONFIGURATION`, interface creation, modalias, and driver binding. Required Linux paths: `hub_event()`, `hub_port_connect()`, `usb_new_device()`, `usb_enumerate_device()`, `usb_set_configuration()`.

- [ ] **Step 3: Rewrite article 03 as a descriptor parser's view**

Cover Device, Configuration, Interface, Alternate Setting, IAD, Endpoint, String, BOS, SuperSpeed companion, class-specific descriptors, TLV walking, malformed lengths, `wTotalLength`, `usb_host_config`, `usb_host_interface`, and `usb_get_extra_descriptor()`.

- [ ] **Step 4: Run foundation contracts**

Run: `node --test --test-name-pattern "USB.*01|USB.*02|USB.*03" tests/usb-reference-rewrite.test.mjs`

Expected: all three article contracts PASS.

- [ ] **Step 5: Commit the batch**

```bash
git add docs/articles/usb tests/usb-reference-rewrite.test.mjs
git commit -m "docs(usb): rebuild protocol and enumeration foundations"
```

### Task 3: Rewrite Linux USB Core as articles 04–08

**Files:**
- Create: `docs/articles/usb/usb-04-linux-usb-subsystem-architecture.md`
- Create: `docs/articles/usb/usb-05-core-objects-interface-altsetting-endpoint.md`
- Create: `docs/articles/usb/usb-06-core-api-pipes-dma.md`
- Create: `docs/articles/usb/usb-07-urb-lifecycle-concurrency.md`
- Create: `docs/articles/usb/usb-08-interface-driver-lifecycle-pm.md`
- Remove after redirect creation: old USB 02 and old USB 04 files

**Interfaces:**
- Consumes: foundation vocabulary from Task 2.
- Produces: Linux object/lifecycle model used by HID, Bulk, Class, Gadget, HCD, and debugging articles.

- [ ] **Step 1: Write article 04 as a layer and call-path map**

Explain HCD, Root Hub, usbcore, device model, interface driver, class driver, `usb_bus_type`, `usb_hcd`, `usb_device`, and `usb_interface`. Trace HCD registration to root-hub enumeration and interface driver match.

- [ ] **Step 2: Write article 05 as an object ownership reference**

Explain `usb_device`, active config, `usb_interface`, `usb_host_interface`, alternate settings, endpoint arrays, `usb_host_endpoint`, `usb_device_id`, interface association, references, sysfs, and composite-device multi-driver binding.

- [ ] **Step 3: Write article 06 as an API decision guide**

Cover driver register/deregister, interface data, endpoint helpers, `usb_find_common_endpoints`, `usb_maxpacket`, pipe helpers, synchronous control/bulk messages, coherent buffers, DMA flags, context-dependent GFP flags, and why synchronous helpers are forbidden in atomic context.

- [ ] **Step 4: Rewrite article 07 around complete URB state**

Cover `usb_alloc_urb`, fill helpers, setup packet, submit, HCD ownership, completion context, status/actual_length, anchor, unlink versus kill, poison, coherent DMA, Isochronous descriptors, callback resubmission, disconnect races, and PM references.

- [ ] **Step 5: Write article 08 around driver publication and teardown**

Trace id-table match, probe acquisition order, altsetting choice, endpoint discovery, user-interface publication, reset callbacks, autosuspend, remote wakeup, pre/post reset, disconnect, kref, open-file lifetime, and idempotent stop routines.

- [ ] **Step 6: Add compilable shared headers**

Create `docs/articles/usb/src/linux-6.12/usb_example_common.h` with endpoint-selection helpers and a private state enum used by later HID/Bulk examples. It must include no hardware-specific register definitions.

- [ ] **Step 7: Validate and commit USB Core**

Run: `node --test --test-name-pattern "USB.*0[4-8]" tests/usb-reference-rewrite.test.mjs`

```bash
git add docs/articles/usb tests/usb-reference-rewrite.test.mjs
git commit -m "docs(usb): rebuild Linux USB Core and lifecycle guides"
```

### Task 4: Build original HID and Bulk driver articles 09–10

**Files:**
- Create: `docs/articles/usb/usb-09-hid-keyboard-mouse-input.md`
- Create: `docs/articles/usb/usb-10-vendor-bulk-character-driver.md`
- Create: `docs/articles/usb/src/linux-6.12/usb_hid_boot.c`
- Create: `docs/articles/usb/src/linux-6.12/usb_bulk_char.c`
- Create: `docs/articles/usb/src/linux-6.12/Makefile`
- Remove after redirect creation: old USB 05 file

**Interfaces:**
- Consumes: endpoint/URB/lifecycle model from Tasks 2–3.
- Produces: two independently compilable Linux 6.12 modules used as the series' concrete driver examples.

- [ ] **Step 1: Implement the HID Boot module**

Use interface-class matching, verify Boot Keyboard/Mouse protocol, locate Interrupt IN, allocate coherent report buffer and URB, register `input_dev`, decode keyboard modifiers/keycodes or mouse buttons/deltas, resubmit in completion, and stop via anchored URB/disconnect. Explicitly document how to unbind/rebind `usbhid` without disabling unrelated HID devices.

- [ ] **Step 2: Implement the Bulk character module**

Use VID/PID teaching IDs, endpoint discovery, `usb_register_dev`, kref, anchored Bulk IN/OUT URBs, FIFO/wait queue, blocking/nonblocking read, poll, async write backpressure, disconnect visibility, autosuspend references, and complete failure unwind.

- [ ] **Step 3: Write article 09 from protocol to Input events**

Explain HID hierarchy, Boot Protocol versus Report Protocol, keyboard 8-byte report, mouse report, key rollover limits, Input event mapping, completion context, malformed report handling, and hotplug.

- [ ] **Step 4: Rewrite article 10 around the new Bulk module**

Trace open/read/write/poll, URB ownership, FIFO and wait queues, short packets, stalls, disconnect with open fds, reset recovery, PM, and stress validation.

- [ ] **Step 5: Build examples against Linux 6.12 headers**

Run: `test -f "$LINUX_612_TREE/Makefile" && make -C "$LINUX_612_TREE" M="$PWD/docs/articles/usb/src/linux-6.12" modules W=1`

Expected: both modules build without warnings; if local 6.12 headers are unavailable, validate in CI/container before marking complete.

- [ ] **Step 6: Validate and commit driver examples**

Run: `node --test --test-name-pattern "USB.*09|USB.*10" tests/usb-reference-rewrite.test.mjs`

```bash
git add docs/articles/usb tests/usb-reference-rewrite.test.mjs
git commit -m "docs(usb): add Linux 6.12 HID and Bulk driver guides"
```

### Task 5: Rewrite Class, Gadget, HCD, debugging, and MCU extension articles 11–14

**Files:**
- Create: `docs/articles/usb/usb-11-class-drivers-hid-msc-cdc-uvc-uac.md`
- Create: `docs/articles/usb/usb-12-gadget-composite-configfs-functionfs.md`
- Create: `docs/articles/usb/usb-13-host-controller-dwc3-xhci-devicetree.md`
- Create: `docs/articles/usb/usb-14-debugging-usbmon-cherryusb.md`
- Remove after redirect creation: old USB 06–10 files

**Interfaces:**
- Consumes: complete Host/Core/device-driver model.
- Produces: class/Gadget/HCD/debug coverage and a bounded MCU comparison without changing the Linux mainline.

- [ ] **Step 1: Rewrite article 11 around class-specific object boundaries**

For HID, MSC/UAS, CDC ACM, UVC, and UAC, explain descriptors, bound interfaces, control/data endpoints, Linux driver entry, runtime objects, transfer scheduling, teardown, and which protocol details belong above usbcore.

- [ ] **Step 2: Rewrite article 12 around Device-side ownership**

Cover UDC/Gadget Core, EP0 setup, `usb_request`, Composite Framework, configuration/function lifecycle, set_alt/disable, ConfigFS, FunctionFS, suspend/remote wakeup, role switch, and disconnect.

- [ ] **Step 3: Rewrite article 13 around HCD bring-up**

Cover `usb_create_hcd`, `usb_add_hcd`, root hub, xHCI rings, DWC3 Host/Device glue, PHY, clocks, reset, VBUS regulator, `dr_mode`, `usb-role-switch`, extcon/type-C inputs, probe defer, runtime PM, and board-level evidence.

- [ ] **Step 4: Rewrite article 14 as the debugging evidence map**

Cover dmesg/sysfs, usbmon text/binary API, Wireshark, dynamic debug, tracepoints, KASAN, IOMMU faults, protocol analyzers, power/PHY evidence, error-code interpretation, reset/recovery. End with a clearly separated CherryUSB architecture comparison pinned to its current official tag and commit.

- [ ] **Step 5: Create all USB legacy redirects and framework**

Create `src/pages/usb/[...legacy].astro` from `usbLegacyRedirects`; update `docs/articles/usb/usb-framework.md` to the 14-article sequence. Verify all old routes build to redirect pages.

- [ ] **Step 6: Run USB batch verification**

Run: `node --test tests/usb-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs`

Run: `npm run build`

Expected: 14 published USB routes, all old USB redirects, zero Astro errors.

- [ ] **Step 7: Commit completed USB series**

```bash
git add docs/articles/usb src/pages/usb tests/usb-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/site-content-config.test.mjs README.md
git commit -m "docs(usb): complete Linux 6.12 reference-quality series"
```
