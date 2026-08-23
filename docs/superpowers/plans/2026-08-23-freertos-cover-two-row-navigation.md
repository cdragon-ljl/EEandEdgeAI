# FreeRTOS Cover and Two-Row Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incorrect FreeRTOS series cover and make the site header support up to sixteen series without desktop navigation overlap.

**Architecture:** Keep the existing `SERIES_ORDER` source of truth. Split it into two desktop rows of at most eight items inside a three-column header, while retaining the existing drawer below the `xl` breakpoint. Publish an optimized WebP derived from the authoritative PNG and keep intrinsic dimensions in series metadata.

**Tech Stack:** Astro 4, TypeScript, Tailwind CSS, Node test runner, WebP image conversion.

---

### Task 1: Add Failing Cover and Navigation Contracts

**Files:**
- Modify: `tests/series-covers.test.mjs`
- Create: `tests/header-navigation.test.mjs`

- [ ] **Step 1: Add the FreeRTOS cover dimensions and binary WebP dimension check**

Extend the `covers` fixture with:

```js
freertos: [1923, 818],
```

Add a small RIFF/WebP header reader in the test file and assert that each cover's decoded dimensions equal its metadata fixture. The reader must support `VP8X`, `VP8 ` and `VP8L` chunks and use only Node standard APIs.

- [ ] **Step 2: Add the header layout contract**

Create `tests/header-navigation.test.mjs` with source-level assertions for:

```js
assert.match(header, /const DESKTOP_NAV_ITEMS_PER_ROW = 8/);
assert.match(header, /SERIES_ORDER\.slice\(0, DESKTOP_NAV_ITEMS_PER_ROW\)/);
assert.match(header, /SERIES_ORDER\.slice\(DESKTOP_NAV_ITEMS_PER_ROW, DESKTOP_NAV_ITEMS_PER_ROW \* 2\)/);
assert.match(header, /xl:flex/);
assert.match(header, /xl:hidden/);
assert.match(header, /overflow-y-auto/);
assert.match(siteLayout, /pt-16 xl:pt-24/);
assert.doesNotMatch(header, /lg:flex|lg:hidden/);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node --test tests\series-covers.test.mjs tests\header-navigation.test.mjs
```

Expected: failures for the missing FreeRTOS fixture dimensions, old published WebP, single-row `lg` navigation, and fixed `pt-16` content offset.

### Task 2: Replace the FreeRTOS Cover

**Files:**
- Source: `covers/freertos.png`
- Modify: `public/covers/freertos.webp`
- Modify: `src/lib/series.ts`

- [ ] **Step 1: Convert the authoritative PNG to WebP**

Use the repository's image compression workflow to convert `covers/freertos.png` to `public/covers/freertos.webp`. Preserve the full `1923 x 818` canvas and use visually lossless settings suitable for a series cover. Do not crop or stretch the image.

- [ ] **Step 2: Update intrinsic metadata**

Change the FreeRTOS cover metadata to:

```ts
cover: { src: '/covers/freertos.webp', width: 1923, height: 818, alt: 'FreeRTOS 内核源码解读系列封面' },
```

- [ ] **Step 3: Run the cover test and verify GREEN**

Run:

```powershell
node --test tests\series-covers.test.mjs
```

Expected: every registered cover exists and decoded dimensions match metadata.

### Task 3: Implement the Two-Row Desktop Header

**Files:**
- Modify: `src/components/Header.astro`
- Modify: `src/layouts/SiteLayout.astro`
- Test: `tests/header-navigation.test.mjs`

- [ ] **Step 1: Split desktop series into two rows**

Define the fixed capacity and rows in the Astro frontmatter:

```ts
const DESKTOP_NAV_ITEMS_PER_ROW = 8;
const desktopNavRows = [
  SERIES_ORDER.slice(0, DESKTOP_NAV_ITEMS_PER_ROW),
  SERIES_ORDER.slice(DESKTOP_NAV_ITEMS_PER_ROW, DESKTOP_NAV_ITEMS_PER_ROW * 2),
].filter((row) => row.length > 0);

if (SERIES_ORDER.length > DESKTOP_NAV_ITEMS_PER_ROW * 2) {
  throw new Error('Desktop navigation supports at most 16 series.');
}
```

- [ ] **Step 2: Replace the single-row desktop list with a centered row stack**

Use a three-column `xl` header. Keep brand and tools in their own columns, and render each `desktopNavRows` entry as an independently centered `<ul>`. Use compact 12px labels with stable 36px item height and an in-item active border instead of the old negative-offset underline.

- [ ] **Step 3: Align responsive states and drawer scrolling**

Change all full-navigation and drawer boundaries from `lg` to `xl`. Give the drawer `overflow-y-auto overscroll-contain`, and constrain its content with `min-h-full` so all series and utility links remain reachable.

- [ ] **Step 4: Update the fixed-header content offset**

Change the site main element to:

```astro
<main id="main-content" class="flex-1 pt-16 xl:pt-24">
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests\header-navigation.test.mjs tests\series-covers.test.mjs
```

Expected: all cover and navigation contracts pass.

### Task 4: Verify and Deliver

**Files:**
- Verify: `src/components/Header.astro`
- Verify: `src/layouts/SiteLayout.astro`
- Verify: `public/covers/freertos.webp`

- [ ] **Step 1: Run the complete automated suite**

```powershell
npm test
```

Expected: zero failures.

- [ ] **Step 2: Run the production build**

```powershell
npm run build
```

Expected: Astro check reports zero errors and GitHub Pages output is generated.

- [ ] **Step 3: Inspect representative viewports**

Check the home page and FreeRTOS series page at 1440px, 1280px, 1024px and 390px. Confirm no overlap or horizontal overflow, correct `8 + 3` ordering at desktop sizes, drawer accessibility below `xl`, and full-ratio FreeRTOS cover rendering.

- [ ] **Step 4: Commit only task-owned files**

```powershell
git add public/covers/freertos.webp src/lib/series.ts src/components/Header.astro src/layouts/SiteLayout.astro tests/series-covers.test.mjs tests/header-navigation.test.mjs docs/superpowers/plans/2026-08-23-freertos-cover-two-row-navigation.md
git commit -m "feat: update FreeRTOS cover and navigation"
```

- [ ] **Step 5: Push and verify Pages**

Push `main`, wait for `Deploy to GitHub Pages`, then verify the public home page and FreeRTOS series page return HTTP 200 with the new asset and layout.
