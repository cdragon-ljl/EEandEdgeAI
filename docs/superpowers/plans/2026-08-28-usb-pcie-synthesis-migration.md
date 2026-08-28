# USB/PCIe Synthesis and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PCIe articles 19–22, migrate all USB/PCIe URLs and metadata, and prove the 14/22 series build and render correctly end to end.

**Architecture:** This plan runs only after the USB and PCIe core plans pass. It rewrites the four cross-bus synthesis articles from the completed terminology models, then performs redirects, README/count updates, Mermaid validation, full tests, production build, and representative page QA.

**Tech Stack:** Markdown, Mermaid, Astro static redirects, Node.js test runner, Pagefind.

**Spec:** `docs/superpowers/specs/2026-08-28-usb-pcie-reference-rewrite-design.md`

## Global Constraints

- USB 01–14 and PCIe 01–18 must already satisfy their reference rewrite contracts.
- Synthesis articles introduce no new prerequisite mechanisms; they compare already-defined objects and state machines.
- All old USB, PCIe, and `/usb-pcie/` URLs resolve to exactly one new canonical URL.
- README and site metadata use measured published counts, never hard-coded assumptions.
- GitHub Pages deployment is not triggered until all local verification passes.

---

### Task 1: Rewrite cross-bus synthesis articles 19–22

**Files:**
- Create: `docs/articles/pcie/pci-19-usb-pcie-bus-model-comparison.md`
- Create: `docs/articles/pcie/pci-20-usb-pcie-driver-framework-comparison.md`
- Create: `docs/articles/pcie/pci-21-usb-pcie-debug-evidence-comparison.md`
- Create: `docs/articles/pcie/pci-22-usb-pcie-interview-design.md`
- Remove after redirect creation: old `usb-pcie-01` through `usb-pcie-04` files
- Modify: `tests/pcie-reference-rewrite.test.mjs`

**Interfaces:**
- Consumes: final USB and PCIe object names, ownership rules, PM/reset models, and diagnostic tools.
- Produces: four synthesis articles and final 22-file PCIe sequence.

- [ ] **Step 1: Write article 19 as an equivalent-question matrix**

Compare root ownership, topology, discovery input, addressing, resources, transaction scheduling, transfer/request objects, bandwidth, hotplug, power, errors, and device fit. Every row links back to the defining USB and PCIe articles.

- [ ] **Step 2: Write article 20 around lifecycle and ownership**

Compare `usb_interface`/`usb_driver`/URB with `pci_dev`/`pci_driver`/BAR/DMA queue; probe prerequisites, publication, open-fd references, disconnect/remove, reset, PM, and reverse-order teardown.

- [ ] **Step 3: Write article 21 as a proof-oriented diagnostic matrix**

Compare sysfs, usbmon, Wireshark, lspci, setpci, AER, IOMMU fault, dynamic debug, tracepoints, protocol analyzers, oscilloscopes, and what each observation can and cannot prove.

- [ ] **Step 4: Write article 22 as engineering scenarios**

For each scenario include context, tempting wrong answer, object/state-machine reasoning, evidence collection, correct answer, tradeoff, and follow-up. Cover enumeration, descriptors/config space, URB/DMA, MSI-X, IOMMU, disconnect/reset, PM, throughput, and recovery.

- [ ] **Step 5: Validate and commit synthesis**

Run: `node --test --test-name-pattern "PCIe.*(19|20|21|22)" tests/pcie-reference-rewrite.test.mjs`

```bash
git add docs/articles/pcie tests/pcie-reference-rewrite.test.mjs
git commit -m "docs: rebuild USB and PCIe synthesis guides"
```

### Task 2: Finish URL migration, frameworks, and site metadata

**Files:**
- Modify: `src/pages/usb/[...legacy].astro`
- Modify: `src/pages/pcie/[...legacy].astro`
- Modify: `src/pages/usb-pcie/[...slug].astro`
- Modify: `docs/articles/usb/usb-framework.md`
- Modify: `docs/articles/pcie/pcie-framework.md`
- Modify: `README.md`
- Modify: `tests/site-content-config.test.mjs`
- Modify: `tests/legacy-usb-pcie-routes.test.mjs`

**Interfaces:**
- Consumes: final 14 USB and 22 PCIe filenames.
- Produces: canonical routes, exact redirects, measured README counts, and framework tables.

- [ ] **Step 1: Generate explicit redirect maps**

Keep literal old/new slug pairs in source so tests can assert every route. `getStaticPaths()` must define the map inside its own function to remain visible after Astro hoisting. Each page includes meta refresh, canonical link, `location.replace`, and a fallback anchor.

- [ ] **Step 2: Rewrite both framework documents from final frontmatter**

Generate ordered topic/file tables from actual `order` metadata; document learning phases, source policy, Linux 6.12 baseline, and prerequisites.

- [ ] **Step 3: Update counts from filesystem evidence**

Count `draft: false` articles line-by-line. Update README and tests to USB 14, PCIe 22, and the recalculated total site count.

- [ ] **Step 4: Run route and metadata tests**

Run: `node --test tests/usb-reference-rewrite.test.mjs tests/pcie-reference-rewrite.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs`

Expected: all route, count, order, title, and framework assertions PASS.

### Task 3: Full editorial and build verification

**Files:**
- Verify: `docs/articles/usb/*.md`
- Verify: `docs/articles/pcie/*.md`
- Verify: `docs/articles/usb/src/linux-6.12/*`
- Verify: `docs/articles/pcie/src/linux-6.12/*`
- Verify: all affected tests and redirect pages
- Create: `scripts/validate-article-mermaid.mjs`

**Interfaces:**
- Consumes: all rewritten content, source examples, and redirects.
- Produces: a release-ready, evidence-backed USB/PCIe content migration.

- [ ] **Step 1: Scan editorial and source red lines**

Run:

```bash
rg -n "TBD|TODO|待补|初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环" docs/articles/usb docs/articles/pcie
```

Expected: no matches.

- [ ] **Step 2: Check content depth and source links**

For each formal article assert five Mermaid diagrams, required object/API markers, two official primary sources, Linux 6.12 declaration, error/teardown coverage, and a topic-specific conclusion.

- [ ] **Step 3: Compile new Linux examples**

In a Linux shell or WSL, require `LINUX_612_TREE` to be an absolute Linux 6.12 source-tree path, verify it with `test -f "$LINUX_612_TREE/Makefile"`, then run:

```bash
make -C "$LINUX_612_TREE" M="$PWD/docs/articles/usb/src/linux-6.12" modules W=1
make -C "$LINUX_612_TREE" M="$PWD/docs/articles/pcie/src/linux-6.12" modules W=1
```

Record the exact kernel commit, compiler, architecture, and warnings. No module is marked complete if it only passes Markdown tests.

- [ ] **Step 4: Run tracked and rewrite tests**

Run:

```bash
$trackedTests = git ls-files 'tests/*.test.mjs'
node --test $trackedTests tests/usb-reference-rewrite.test.mjs tests/pcie-reference-rewrite.test.mjs
```

Expected: all tracked and rewrite tests PASS; unrelated untracked test work is excluded and reported.

- [ ] **Step 5: Parse every Mermaid block and build the site**

Create `scripts/validate-article-mermaid.mjs` to extract every fenced `mermaid` block from the supplied directories, parse each block with the repository's installed Mermaid package, report the source file and block index on failure, and exit nonzero if any block fails. Then run:

```bash
node scripts/validate-article-mermaid.mjs docs/articles/usb docs/articles/pcie
npm run build
```

Expected: zero Mermaid parse failures, Astro diagnostics 0 errors, all 36 canonical article pages and every redirect page generated.

- [ ] **Step 6: Inspect representative built pages**

Inspect USB 02/05/09/13 and PCIe 04/06/09/14/16/21 at desktop and mobile widths. Verify tables, code wrapping, diagrams, title/order, canonical URLs, and no duplicated content template.

- [ ] **Step 7: Final scope and commit**

Run `git diff --check` and `git status --short`. Stage only USB/PCIe articles, source examples, redirects, README, frameworks, and tests.

```bash
git add -A -- docs/articles/usb docs/articles/pcie src/pages/usb src/pages/pcie src/pages/usb-pcie README.md scripts/validate-article-mermaid.mjs tests/usb-reference-rewrite.test.mjs tests/pcie-reference-rewrite.test.mjs tests/usb-pcie-articles.test.mjs tests/legacy-usb-pcie-routes.test.mjs tests/site-content-config.test.mjs
git commit -m "docs: complete USB and PCIe reference-quality rewrite"
```

- [ ] **Step 8: Push and verify deployment only when requested**

Push `main`, wait for the Pages workflow, require build and deploy jobs to conclude `success`, then fetch representative public routes and old redirects.
