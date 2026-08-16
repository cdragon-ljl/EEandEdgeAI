# Zephyr Series Completion Design

## Goal

Complete the Zephyr practical series from the application-structure article through the testing-and-engineering article. The series targets embedded software engineers who already have FreeRTOS or bare-metal experience and uses the nRF52832 DK as its primary hardware.

## Scope

- Add 23 Markdown articles under `docs/articles/zephyr`, following the planned filenames and order.
- Preserve the three published introductory articles and the framework document.
- Use Zephyr 4.4.x as the primary API baseline. Where an API or workflow differs in LTS 3.7.x, state the version boundary only when it changes the reproducible procedure.
- Use the canonical board target `nrf52dk/nrf52832` in commands and examples.

## Delivery Structure

The articles will be written in dependency order in seven content blocks:

1. Application engineering: application layout, board-specific configuration, reusable modules, and west workspace concepts.
2. Kernel mechanisms: threads, synchronization, deferred work, and memory, each contrasted with the corresponding FreeRTOS mechanism.
3. Device-tree-driven drivers: device model, GPIO, common serial buses, and a custom driver.
4. BLE applications: the Zephyr host/controller architecture, GATT, sensor data upload, security, and power trade-offs.
5. Product-readiness facilities: power management, logging, Shell, and debugging.
6. Persistent storage and update security: flash partitions, settings/NVS, MCUboot image lifecycle, and BLE SMP DFU.
7. Porting and integration: peripherals, board support, a complete sensor-node application, and automated testing.

This sequence prevents later examples from introducing concepts that have not yet been defined. Each block reuses the same board and application conventions, while its examples remain independently buildable.

## Article Contract

Every completed article will include:

- Astro-compatible frontmatter with the `zephyr` series ID, correct order, targeted Chinese description, tags, publication date, and `draft: false`.
- A concise FreeRTOS or bare-metal analogy when a Zephyr concept first appears.
- At least two Mermaid diagrams, with nearby Chinese image placeholders where the illustration improves reading.
- A complete, buildable code example with the required `CMakeLists.txt`, `prj.conf`, source, and overlay or board configuration when needed.
- A hands-on exercise section and an nRF52832 DK milestone checklist.
- A concise summary and a final tag line. Articles will not contain article-number references, future-article previews, total-series lists, drafting language, or AI-image prompts.

## Technical Validation

Before an article is written, its APIs, Kconfig names, device-tree properties, build flags, and tooling procedures will be checked against the official Zephyr documentation and source for the stated version. Nordic hardware details will be matched to the nRF52832 product specification. Examples that require hardware unavailable in the base DK will clearly identify the external connection and pin assignment.

The primary validation loop is:

```mermaid
flowchart LR
    A[Series framework] --> B[Official API and board verification]
    B --> C[Article with complete example]
    C --> D[Content-rule scan]
    D --> E[Site content validation]
    E --> F[Published article]
```

## Consistency and Error Handling

- Use a shared command style based on `west build -p always -b nrf52dk/nrf52832` and explicitly state the application path.
- Call out resource-sensitive settings when a feature competes for the nRF52832's 64 KB RAM.
- Explain expected build, flash, serial, and mobile-app observations, then provide likely causes and concrete inspection commands for common failures.
- Keep source paths and generated artifacts consistent with Zephyr 4.4.x conventions; do not present speculative Kconfig options or unverified APIs as facts.

## Verification

After each content block, scan new files for the framework's prohibited wording, validate frontmatter and series metadata through the existing content tests, and build the documentation site. Before completion, inspect the full Zephyr article list for order, filenames, frontmatter, internal consistency, and all required final tag lines.
