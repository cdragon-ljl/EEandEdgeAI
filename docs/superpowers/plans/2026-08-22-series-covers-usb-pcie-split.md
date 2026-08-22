# Series Covers and USB/PCIe Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish nine optimized series covers and split the combined USB/PCIe content into independent USB and PCIe series without breaking previously published URLs.

**Architecture:** Store web-ready cover assets under `public/covers` and describe each image in the central `SeriesMeta` registry so all pages consume one source of truth. Move Markdown into `usb` and `pcie` content directories, then generate static compatibility pages under the old `/usb-pcie/` route because GitHub Pages cannot perform server-side redirects.

**Tech Stack:** Astro 4 content collections, TypeScript, Tailwind CSS, Node test runner, WebP assets, Pagefind, GitHub Actions Pages deployment.

---

## File Map

- Modify `.gitignore`: keep local PNG design sources out of Git while preserving deployed WebP files.
- Create `public/covers/*.webp`: optimized deployable cover assets.
- Move `docs/articles/usb-pcie/usb-*.md` to `docs/articles/usb/`: USB series source.
- Move `docs/articles/usb-pcie/pci-*.md` and `usb-pcie-*.md` to `docs/articles/pcie/`: PCIe and comparison source.
- Modify `src/content/config.ts`: register `usb` and `pcie`, remove `usb-pcie`.
- Modify `src/lib/series.ts`: define nine series and their cover metadata.
- Modify `src/lib/articles.ts`: recognize the new series IDs.
- Modify `src/components/SeriesCard.astro`: render full-ratio cover art above card copy.
- Modify `src/pages/[series]/index.astro`: render the series cover as a wide, unframed banner.
- Create `src/pages/usb-pcie/index.astro`: old series landing redirect page.
- Create `src/pages/usb-pcie/[...slug].astro`: 25 old article redirect pages.
- Modify `tests/site-content-config.test.mjs`: enforce split-series content and metadata.
- Create `tests/series-covers.test.mjs`: enforce cover assets and page usage.
- Create `tests/legacy-usb-pcie-routes.test.mjs`: enforce compatibility-route implementation.

### Task 1: Define the split-series contract

**Files:**
- Modify: `tests/site-content-config.test.mjs`
- Create: `tests/series-covers.test.mjs`
- Create: `tests/legacy-usb-pcie-routes.test.mjs`

- [ ] **Step 1: Replace the combined-series tests with failing USB and PCIe tests**

Add assertions that require the loader, schema, type union, order list and type guard to contain `usb` and `pcie` but not `usb-pcie`. Require 9 USB files with orders 1–9 and 16 PCIe files with orders 1–16.

```js
test('usb and pcie are independent first-class series', () => {
  const contentConfig = readFileSync('src/content/config.ts', 'utf8');
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');
  const articlesLib = readFileSync('src/lib/articles.ts', 'utf8');

  assert.match(contentConfig, /usb/);
  assert.match(contentConfig, /pcie/);
  assert.doesNotMatch(contentConfig, /usb-pcie/);
  assert.match(seriesConfig, /usb:\s*\{/);
  assert.match(seriesConfig, /pcie:\s*\{/);
  assert.doesNotMatch(seriesConfig, /'usb-pcie':\s*\{/);
  assert.match(articlesLib, /value === 'usb'/);
  assert.match(articlesLib, /value === 'pcie'/);
});
```

- [ ] **Step 2: Add failing cover and compatibility-route tests**

Require all nine `SeriesMeta` entries to expose `/covers/<id>.webp`, require both display components to use `series.cover`, and require explicit static redirect pages.

```js
test('every registered series has a deployable webp cover', () => {
  const ids = ['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'usb', 'pcie', 'video-audio'];
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');

  for (const id of ids) {
    assert.match(seriesConfig, new RegExp(`src: '/covers/${id}\\.webp'`));
    assert.ok(existsSync(join('public/covers', `${id}.webp`)));
  }
});
```

```js
test('legacy usb-pcie routes generate static client redirects', () => {
  const landing = readFileSync('src/pages/usb-pcie/index.astro', 'utf8');
  const articles = readFileSync('src/pages/usb-pcie/[...slug].astro', 'utf8');

  assert.match(landing, /location\.replace/);
  assert.match(articles, /getStaticPaths/);
  assert.match(articles, /location\.replace/);
  assert.match(articles, /rel="canonical"/);
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/site-content-config.test.mjs tests/series-covers.test.mjs tests/legacy-usb-pcie-routes.test.mjs
```

Expected: failures report the missing `usb`/`pcie` registrations, missing WebP files, and missing legacy route pages.

### Task 2: Optimize and register cover assets

**Files:**
- Modify: `.gitignore`
- Create: `public/covers/bsp.webp`
- Create: `public/covers/cuda.webp`
- Create: `public/covers/ee-system.webp`
- Create: `public/covers/pcie.webp`
- Create: `public/covers/riscv.webp`
- Create: `public/covers/rknn.webp`
- Create: `public/covers/usb.webp`
- Create: `public/covers/video-audio.webp`
- Create: `public/covers/zephyr.webp`
- Modify: `src/lib/series.ts`
- Modify: `src/content/config.ts`
- Modify: `src/lib/articles.ts`

- [ ] **Step 1: Ignore local source covers and generate WebP deployment copies**

Append `covers/` to `.gitignore`. Run the installed compression script with quality 80 and keep the PNG originals, then place only generated WebP files under `public/covers`.

```powershell
npx -y bun C:\Users\cloong\.codex\skills\baoyu-compress-image\scripts\main.ts covers --recursive --quality 80 --keep
New-Item -ItemType Directory -Path public\covers -Force
Move-Item -LiteralPath covers\bsp.webp,covers\cuda.webp,covers\ee-system.webp,covers\pcie.webp,covers\riscv.webp,covers\rknn.webp,covers\usb.webp,covers\video-audio.webp,covers\zephyr.webp -Destination public\covers
```

- [ ] **Step 2: Replace `usb-pcie` with `usb` and `pcie` in the content schema**

Use this canonical order in the loader and enum:

```ts
['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'usb', 'pcie', 'video-audio']
```

- [ ] **Step 3: Add cover metadata and independent USB/PCIe series definitions**

Extend `SeriesMeta` with:

```ts
cover: {
  src: string;
  width: number;
  height: number;
  alt: string;
};
```

Each series uses the measured source dimensions. USB is `1919 × 820`; PCIe is `1919 × 820`. Define independent series entries:

```ts
usb: {
  id: 'usb',
  title: 'USB 驱动开发实战',
  shortTitle: 'USB',
  description: '从架构与枚举、描述符和 URB，到类驱动、Gadget、Host 控制器与故障排查。',
  accent: 'orange',
  href: '/usb/',
  label: '通用外设总线',
  cover: { src: '/covers/usb.webp', width: 1919, height: 820, alt: 'USB 驱动开发实战系列封面' },
},
pcie: {
  id: 'pcie',
  title: 'PCIe 驱动开发实战',
  shortTitle: 'PCIe',
  description: '从配置空间、BAR 与中断，到 DMA、IOMMU、Endpoint bring-up 和高吞吐设计。',
  accent: 'orange',
  href: '/pcie/',
  label: '高速设备互联',
  cover: { src: '/covers/pcie.webp', width: 1919, height: 820, alt: 'PCIe 驱动开发实战系列封面' },
},
```

- [ ] **Step 4: Update the series type guard**

Remove `value === 'usb-pcie'` and add `value === 'usb' || value === 'pcie'`.

- [ ] **Step 5: Run the registration and cover tests**

Run the focused test command from Task 1. Expected: registration and asset tests progress to content-directory and component failures only.

### Task 3: Move and renumber the articles

**Files:**
- Move: `docs/articles/usb-pcie/usb-*.md` → `docs/articles/usb/`
- Move: `docs/articles/usb-pcie/pci-*.md` → `docs/articles/pcie/`
- Move: `docs/articles/usb-pcie/usb-pcie-*.md` → `docs/articles/pcie/`

- [ ] **Step 1: Create the two destination directories and move the 25 files**

Use explicit source groups so unrelated `docs/articles/fpga` content remains untouched.

```powershell
New-Item -ItemType Directory -Path docs\articles\usb,docs\articles\pcie -Force
Move-Item docs\articles\usb-pcie\usb-[0-9][0-9]-*.md docs\articles\usb\
Move-Item docs\articles\usb-pcie\pci-[0-9][0-9]-*.md docs\articles\pcie\
Move-Item docs\articles\usb-pcie\usb-pcie-[0-9][0-9]-*.md docs\articles\pcie\
```

- [ ] **Step 2: Update USB and PCIe frontmatter**

Set all USB files to `series: usb` and preserve orders 1–9. Set all `pci-*` files to `series: pcie` with orders 1–12 instead of the old combined-series orders 10–21. Set comparison files to `series: pcie` with orders 13–16 instead of 22–25.

- [ ] **Step 3: Run the content tests and verify GREEN**

Run:

```powershell
node --test tests/site-content-config.test.mjs
```

Expected: all content registration, count, frontmatter and order tests pass.

### Task 4: Render covers in the selected layout

**Files:**
- Modify: `src/components/SeriesCard.astro`
- Modify: `src/pages/[series]/index.astro`

- [ ] **Step 1: Render the cover at the top of every series card**

Resolve the base path and render the image before the card copy:

```astro
<img
  src={withBase(series.cover.src)}
  width={series.cover.width}
  height={series.cover.height}
  alt={series.cover.alt}
  loading="lazy"
  decoding="async"
  class="block h-auto w-full border-b border-gray-100 object-contain transition-transform duration-300 group-hover:scale-[1.015] dark:border-white/[0.06]"
/>
```

Move existing padding from the outer link to the text body, keep card radius at 8px, and hide image overflow without cropping.

- [ ] **Step 2: Replace the decorative series hero with the real cover**

Render an unframed, constrained-width image followed by the label, title and description. Use the exact intrinsic dimensions and `h-auto w-full object-contain`; do not overlay text on the image.

- [ ] **Step 3: Run the cover tests**

Run:

```powershell
node --test tests/series-covers.test.mjs
```

Expected: all cover asset and component usage tests pass.

### Task 5: Preserve old published URLs

**Files:**
- Create: `src/pages/usb-pcie/index.astro`
- Create: `src/pages/usb-pcie/[...slug].astro`

- [ ] **Step 1: Create the old landing-page redirect**

Generate a static HTML page whose canonical target is `withBase('/usb/')`, includes immediate meta refresh, runs `window.location.replace(target)`, and displays a normal link for no-script users.

- [ ] **Step 2: Generate the 25 old article redirects**

Use `getCollection('articles')` and select `usb` plus `pcie`. For every article, use `slugFor(article)` as the old slug and `hrefFor(article)` as the new target. Emit canonical, meta refresh, `location.replace` and a visible fallback link.

- [ ] **Step 3: Run compatibility tests**

Run:

```powershell
node --test tests/legacy-usb-pcie-routes.test.mjs
```

Expected: route source tests pass.

### Task 6: Full verification, visual QA and deployment

**Files:**
- Verify all files above.

- [ ] **Step 1: Run all automated tests**

```powershell
npm test
```

Expected: zero failed tests.

- [ ] **Step 2: Build the production site**

```powershell
npm run build
```

Expected: Astro check reports zero errors, static routes include `/usb/`, `/pcie/`, all 25 new article routes and all 26 legacy compatibility routes, and Pagefind completes.

- [ ] **Step 3: Start the preview server and inspect desktop/mobile**

Use the production preview server. Verify the homepage, `/usb/`, `/pcie/`, one article per series, and one legacy URL at desktop and mobile widths. Confirm complete cover composition, no text overlap, no horizontal overflow, stable card dimensions, visible focus states and working redirect behavior.

- [ ] **Step 4: Check the staged diff**

```powershell
git diff --check
git status --short
```

Expected: only the planned cover, split-series, route, test and plan files are included; `docs/articles/fpga/` remains untracked and untouched.

- [ ] **Step 5: Commit the implementation**

```powershell
git add .gitignore public/covers docs/articles/usb docs/articles/pcie docs/articles/usb-pcie src/content/config.ts src/lib/series.ts src/lib/articles.ts src/components/SeriesCard.astro src/pages/[series]/index.astro src/pages/usb-pcie tests docs/superpowers/plans/2026-08-22-series-covers-usb-pcie-split.md
git commit -m "feat: add series covers and split USB PCIe content"
```

- [ ] **Step 6: Push and verify GitHub Pages**

```powershell
git push origin main
```

Wait for the Pages workflow, then verify the public homepage, `/usb/`, `/pcie/`, cover assets and one old `/usb-pcie/` URL.
