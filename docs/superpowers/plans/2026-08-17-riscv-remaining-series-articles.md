# Remaining RISC-V Series Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish every RISC-V article still missing from the repository, covering orders 04 through 30 in the approved series framework.

**Architecture:** Preserve the existing `riscv` Astro collection and add Markdown articles only under `docs/articles/riscv`. Each article owns one progression milestone, starts with valid frontmatter, uses CMake-oriented reproducibility where executable work is relevant, contains diagrams and checks, and ends with the project tag convention. A single regression test defines the complete expected file set and publication contract.

**Tech Stack:** Astro content collection, Markdown, Mermaid, CMake, QEMU, FreeRTOS, RISC-V ISA/psABI/privileged specifications, OpenSBI, Linux, Vivado, MicroBlaze V, RVV, Node.js test runner.

---

### Task 1: Define the complete remaining-series publication contract

**Files:**
- Modify: `tests/site-content-config.test.mjs`
- Create: `docs/articles/riscv/qemu-riscv-04-linker-startup.md`
- Create: `docs/articles/riscv/qemu-riscv-05-interrupt-clint-plic.md`
- Create: `docs/articles/riscv/qemu-riscv-06-timer-tick.md`
- Create: `docs/articles/riscv/qemu-riscv-07-freertos-port-p1.md`
- Create: `docs/articles/riscv/qemu-riscv-08-freertos-port-p2.md`
- Create: `docs/articles/riscv/qemu-riscv-09-debug-gdb-test.md`
- Create: `docs/articles/riscv/qemu-riscv-10-customize-virt-machine.md`
- Create: `docs/articles/riscv/riscv-11-instruction-encoding-qemu-internals.md`
- Create: `docs/articles/riscv/riscv-12-privilege-csr-trap.md`
- Create: `docs/articles/riscv/riscv-13-atomic-lrsc-amo-fence.md`
- Create: `docs/articles/riscv/riscv-14-datapath-pipeline.md`
- Create: `docs/articles/riscv/riscv-15-hazard-branch-prediction.md`
- Create: `docs/articles/riscv/riscv-16-cache-memory-hierarchy.md`
- Create: `docs/articles/riscv/riscv-17-picorv32-vexriscv-analysis.md`
- Create: `docs/articles/riscv/riscv-18-softcore-rv32-vs-rv64.md`
- Create: `docs/articles/riscv/riscv-19-sv39-mmu-page-table.md`
- Create: `docs/articles/riscv/riscv-20-opensbi-linux-boot-chain.md`
- Create: `docs/articles/riscv/riscv-21-zynq-xc7z020-vivado.md`
- Create: `docs/articles/riscv/riscv-22-microblaze-v-minimal-system.md`
- Create: `docs/articles/riscv/riscv-23-microblaze-v-baremetal-gpio-uart.md`
- Create: `docs/articles/riscv/riscv-24-microblaze-v-freertos.md`
- Create: `docs/articles/riscv/riscv-25-final-project-riscv-softcore-soc.md`
- Create: `docs/articles/riscv/riscv-26-sg2002-milkv-duo-npu-soc.md`
- Create: `docs/articles/riscv/riscv-27-rvv-vector-extension.md`
- Create: `docs/articles/riscv/riscv-28-rvv-matrix-mul-conv.md`
- Create: `docs/articles/riscv/riscv-29-edge-ai-deploy-riscv.md`
- Create: `docs/articles/riscv/riscv-30-final-project-riscv-edge-ai.md`

- [ ] **Step 1: Write the failing test**

Add a `remaining RISC-V articles meet the long-form publication contract` test. It must enumerate orders 04 through 30 with their exact filenames, require frontmatter, `series: riscv`, matching numeric `order`, `draft: false`, at least 300 lines, and at least five Mermaid blocks for each file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: the contract fails at order 04 because its Markdown file does not yet exist.

- [ ] **Step 3: Preserve article-independent scope**

Do not modify Astro routing, collection schema, existing article content, or unrelated series. The collection already discovers RISC-V Markdown files and generic routes already render all orders.

### Task 2: Publish the QEMU and FreeRTOS batch

**Files:**
- Create: `docs/articles/riscv/qemu-riscv-04-linker-startup.md`
- Create: `docs/articles/riscv/qemu-riscv-05-interrupt-clint-plic.md`
- Create: `docs/articles/riscv/qemu-riscv-06-timer-tick.md`
- Create: `docs/articles/riscv/qemu-riscv-07-freertos-port-p1.md`
- Create: `docs/articles/riscv/qemu-riscv-08-freertos-port-p2.md`
- Create: `docs/articles/riscv/qemu-riscv-09-debug-gdb-test.md`
- Create: `docs/articles/riscv/qemu-riscv-10-customize-virt-machine.md`

- [ ] **Step 1: Write orders 04 through 06**

Cover ELF sections/startup, QEMU virt CLINT/PLIC interrupt routing, and timer-driven ticks. Use validated QEMU machine boundaries, startup and trap examples, diagrams, experiments, troubleshooting and acceptance checks.

- [ ] **Step 2: Write orders 07 through 08**

Build an educational FreeRTOS port in two stages: context layout and trap-controlled switching, then task execution, synchronization and observable scheduling. Keep QEMU-specific assumptions explicit.

- [ ] **Step 3: Write orders 09 through 10**

Cover repeatable GDB/testing evidence, then QEMU machine customization with source-level device and board-model boundaries. Do not claim QEMU source builds or hardware experiments were run on this host.

- [ ] **Step 4: Verify the batch contract**

Run: `npm test`

Expected: the full contract still fails at the first missing architecture article, while orders 04 through 10 satisfy its individual checks.

### Task 3: Publish the architecture, OS and FPGA batch

**Files:**
- Create: `docs/articles/riscv/riscv-11-instruction-encoding-qemu-internals.md`
- Create: `docs/articles/riscv/riscv-12-privilege-csr-trap.md`
- Create: `docs/articles/riscv/riscv-13-atomic-lrsc-amo-fence.md`
- Create: `docs/articles/riscv/riscv-14-datapath-pipeline.md`
- Create: `docs/articles/riscv/riscv-15-hazard-branch-prediction.md`
- Create: `docs/articles/riscv/riscv-16-cache-memory-hierarchy.md`
- Create: `docs/articles/riscv/riscv-17-picorv32-vexriscv-analysis.md`
- Create: `docs/articles/riscv/riscv-18-softcore-rv32-vs-rv64.md`
- Create: `docs/articles/riscv/riscv-19-sv39-mmu-page-table.md`
- Create: `docs/articles/riscv/riscv-20-opensbi-linux-boot-chain.md`
- Create: `docs/articles/riscv/riscv-21-zynq-xc7z020-vivado.md`
- Create: `docs/articles/riscv/riscv-22-microblaze-v-minimal-system.md`
- Create: `docs/articles/riscv/riscv-23-microblaze-v-baremetal-gpio-uart.md`
- Create: `docs/articles/riscv/riscv-24-microblaze-v-freertos.md`
- Create: `docs/articles/riscv/riscv-25-final-project-riscv-softcore-soc.md`

- [ ] **Step 1: Write orders 11 through 18**

Explain instruction encoding, privilege/traps, atomics, pipeline dataflow, hazards, caches, source-level soft-core comparison and RV32/RV64 tradeoffs. Tie each concept to hardware-observable consequences and cite official specifications or upstream core sources.

- [ ] **Step 2: Write orders 19 through 20**

Explain Sv39 translation and the OpenSBI-to-Linux boot chain on QEMU, keeping privileged-state, device-tree and firmware responsibilities distinct.

- [ ] **Step 3: Write orders 21 through 25**

Move to the xc7z020/Vivado and MicroBlaze V path: PS/PL system composition, soft-core integration, bare-metal GPIO/UART, FreeRTOS adaptation, and a complete sensor-node class project. Mark board-specific parameter values as values to obtain from the generated Vivado design rather than invented constants.

### Task 4: Publish the RISC-V SoC and RVV extension batch

**Files:**
- Create: `docs/articles/riscv/riscv-26-sg2002-milkv-duo-npu-soc.md`
- Create: `docs/articles/riscv/riscv-27-rvv-vector-extension.md`
- Create: `docs/articles/riscv/riscv-28-rvv-matrix-mul-conv.md`
- Create: `docs/articles/riscv/riscv-29-edge-ai-deploy-riscv.md`
- Create: `docs/articles/riscv/riscv-30-final-project-riscv-edge-ai.md`

- [ ] **Step 1: Write orders 26 through 28**

Describe a real RISC-V SoC/NPU boundary and RVV's vector-length-agnostic model before presenting vectorized matrix or convolution kernels. Preserve the series focus on architecture rather than making AI the primary topic.

- [ ] **Step 2: Write orders 29 through 30**

Describe an end-to-end deployment workflow and a complete application architecture with CPU, RVV and NPU responsibilities, model validation and observability. Treat vendor SDK releases and accelerator APIs as hardware- and version-dependent.

- [ ] **Step 3: Verify the full contract and site output**

Run: `npm test`

Expected: all tests pass, including all orders 04 through 30.

Run: `npm run build`

Expected: Astro emits every RISC-V article route with zero Astro diagnostics.

Run:

```powershell
rg -n '等等|让我|不对|记错|Hmm|草稿|思考|Part A|Part B|Part C|下一篇|下一章|预告|后续|RV-[0-9]+' 'docs\articles\riscv'
```

Expected: no prose red-line matches in published article files.

- [ ] **Step 4: Commit**

The user requested direct edits in the shared workspace. Do not stage or commit unrelated changes; leave all authored articles and tests in place for review.
