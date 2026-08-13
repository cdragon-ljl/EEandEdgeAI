# GitHub Pages Astro Article Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Astro-based GitHub Pages article site in `D:\EEandEdgeAI` and migrate the CUDA, embedded systems, and RKNN Markdown article series.

**Architecture:** The site is a static Astro application with Markdown content collections backed by `docs/articles`. Series metadata lives in focused TypeScript data modules. Pages render series landing pages and article pages with a reusable layout, side navigation, table of contents, search index, and GitHub Pages deployment workflow.

**Tech Stack:** Astro 4, TypeScript, Tailwind CSS, Pagefind, rehype/remark Markdown plugins, GitHub Actions, Node 20.

---

## File Structure

- Create `package.json`, `package-lock.json`, `astro.config.mjs`, `tailwind.config.mjs`, `tsconfig.json`, `.gitignore`, and `.github/workflows/deploy.yml` for the static site project and deployment.
- Create `src/content/config.ts` for the article content collection schema.
- Create `src/lib/series.ts`, `src/lib/articles.ts`, and `src/lib/paths.ts` for series metadata, article sorting, and base-path-aware URLs.
- Create `src/layouts/SiteLayout.astro` and `src/layouts/ArticleLayout.astro` for the global shell and reading page.
- Create `src/components/Header.astro`, `ThemeToggle.astro`, `SeriesCard.astro`, `ArticleCard.astro`, `SeriesSidebar.astro`, `TableOfContents.astro`, `Search.astro`, and `ArticlePager.astro`.
- Create `src/pages/index.astro`, `src/pages/[series]/index.astro`, `src/pages/[series]/[...slug].astro`, and `src/pages/404.astro`.
- Create `src/styles/global.css` for the restrained technical documentation visual system.
- Create `scripts/migrate-articles.mjs` to copy source Markdown, add frontmatter, normalize image paths, and copy RKNN images.
- Create `docs/articles/cuda`, `docs/articles/ee-system`, and `docs/articles/rknn` from migration output.
- Create `public/images/rknn` from source image assets.

---

### Task 1: Initialize Astro Project Shell

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tailwind.config.mjs`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Initialize git repository if missing**

Run:

```powershell
git rev-parse --is-inside-work-tree
```

Expected: nonzero exit in the current empty workspace. Then run:

```powershell
git init
```

Expected: repository initialized in `D:\EEandEdgeAI`.

- [ ] **Step 2: Create project configuration files**

Create:

```json
{
  "name": "ee-and-edge-ai-site",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro check && astro build && pagefind --site dist",
    "preview": "astro preview",
    "astro": "astro",
    "migrate": "node scripts/migrate-articles.mjs"
  },
  "dependencies": {
    "@astrojs/check": "^0.9.8",
    "@astrojs/sitemap": "^3.1.6",
    "@astrojs/tailwind": "^6.0.2",
    "@fontsource/inter": "^5.2.8",
    "@fontsource/jetbrains-mono": "^5.2.8",
    "@pagefind/default-ui": "^1.5.2",
    "@tailwindcss/typography": "^0.5.19",
    "astro": "^4.16.19",
    "pagefind": "^1.5.2",
    "rehype-autolink-headings": "^7.1.0",
    "rehype-external-links": "^3.0.0",
    "rehype-katex": "^7.0.1",
    "rehype-slug": "^6.0.0",
    "remark-gfm": "^4.0.1",
    "remark-math": "^6.0.0",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.9.3"
  },
  "devDependencies": {}
}
```

Create Astro config with GitHub Pages-friendly `site` and `base` read from environment variables:

```js
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const site = process.env.SITE_URL || 'https://cdragon-ljl.github.io';
const base = process.env.SITE_BASE || '/EEandEdgeAI';

export default defineConfig({
  site,
  base,
  integrations: [tailwind(), sitemap()],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: 'light',
      wrap: false,
    },
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      [rehypeExternalLinks, { target: '_blank', rel: ['nofollow', 'noopener'] }],
      rehypeKatex,
    ],
  },
});
```

- [ ] **Step 3: Create GitHub Pages workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Commit project shell**

Run:

```powershell
git add package.json astro.config.mjs tailwind.config.mjs tsconfig.json .gitignore .github/workflows/deploy.yml docs/superpowers
git commit -m "chore: initialize Astro article site"
```

Expected: commit succeeds if Git user identity is configured. If identity is missing, continue without commit and report it.

---

### Task 2: Implement Article Migration Script

**Files:**
- Create: `scripts/migrate-articles.mjs`
- Create by script: `docs/articles/cuda/*.md`
- Create by script: `docs/articles/ee-system/*.md`
- Create by script: `docs/articles/rknn/*.md`
- Create by script: `public/images/rknn/*`

- [ ] **Step 1: Write migration script**

Create `scripts/migrate-articles.mjs` that:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = 'D:\\Official Account\\site';
const seriesList = [
  {
    id: 'cuda',
    source: path.join(sourceRoot, 'cuda'),
    title: 'CUDA 与 NPU 算子开发',
    tag: 'CUDA',
  },
  {
    id: 'ee-system',
    source: path.join(sourceRoot, 'ee-system'),
    title: '嵌入式知识体系',
    tag: '嵌入式',
  },
  {
    id: 'rknn',
    source: path.join(sourceRoot, 'rknn'),
    title: 'RKNN 端侧 AI 部署',
    tag: 'RKNN',
  },
];

const outputRoot = path.join(root, 'docs', 'articles');

function slugifyFileName(fileName) {
  return fileName
    .replace(/\.md$/i, '')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function getOrder(fileName) {
  const match = fileName.match(/(?:npu-|rknn-)?(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 999;
}

function yamlString(value) {
  return JSON.stringify(String(value).replace(/\r?\n/g, ' '));
}

function firstHeading(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function firstDescription(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '---' || line.startsWith('#')) continue;
    if (line.startsWith('>')) {
      const cleaned = line.replace(/^>\s*/, '').trim();
      if (cleaned) return cleaned.slice(0, 180);
    }
    if (!line.startsWith('```') && !line.startsWith('|')) {
      return line.slice(0, 180);
    }
  }
  return title;
}

function normalizeMarkdown(markdown, seriesId) {
  if (seriesId !== 'rknn') return markdown;
  return markdown.replaceAll('./images/', '/images/rknn/');
}

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function migrateSeries(series) {
  const outDir = path.join(outputRoot, series.id);
  await ensureCleanDir(outDir);
  const files = (await fs.readdir(series.source))
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort((a, b) => getOrder(a) - getOrder(b) || a.localeCompare(b));

  for (const file of files) {
    const sourcePath = path.join(series.source, file);
    const stat = await fs.stat(sourcePath);
    const raw = await fs.readFile(sourcePath, 'utf8');
    const title = firstHeading(raw, file.replace(/\.md$/i, ''));
    const description = firstDescription(raw, title);
    const order = getOrder(file);
    const slug = slugifyFileName(file);
    const body = normalizeMarkdown(raw, series.id);
    const withoutTitle = body.replace(/^#\s+.+\r?\n/, '').trimStart();
    const frontmatter = [
      '---',
      `title: ${yamlString(title)}`,
      `description: ${yamlString(description)}`,
      `pubDate: ${yamlString(stat.mtime.toISOString().slice(0, 10))}`,
      `series: ${yamlString(series.id)}`,
      `order: ${order}`,
      `tags: [${yamlString(series.tag)}, ${yamlString(series.title)}]`,
      'draft: false',
      '---',
      '',
    ].join('\n');
    await fs.writeFile(path.join(outDir, `${slug}.md`), frontmatter + withoutTitle, 'utf8');
  }
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  for (const series of seriesList) {
    await migrateSeries(series);
  }
  await ensureCleanDir(path.join(root, 'public', 'images', 'rknn'));
  await copyDir(path.join(sourceRoot, 'rknn', 'images'), path.join(root, 'public', 'images', 'rknn'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run migration**

Run:

```powershell
npm run migrate
```

Expected: `docs/articles/cuda`, `docs/articles/ee-system`, `docs/articles/rknn`, and `public/images/rknn` exist with migrated files.

- [ ] **Step 3: Inspect migrated content**

Run:

```powershell
rg --files docs/articles public/images/rknn
```

Expected: 16 CUDA Markdown files, 20 embedded systems Markdown files, 10 RKNN Markdown files, and RKNN image files.

- [ ] **Step 4: Commit migration**

Run:

```powershell
git add scripts/migrate-articles.mjs docs/articles public/images/rknn
git commit -m "feat: migrate article content"
```

Expected: commit succeeds if Git user identity is configured.

---

### Task 3: Add Content Collections And Data Helpers

**Files:**
- Create: `src/content/config.ts`
- Create: `src/lib/series.ts`
- Create: `src/lib/paths.ts`
- Create: `src/lib/articles.ts`
- Create: `src/env.d.ts`

- [ ] **Step 1: Create Astro content schema**

Create `src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './docs/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    series: z.enum(['cuda', 'ee-system', 'rknn']),
    order: z.number().default(0),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
```

- [ ] **Step 2: Create series metadata**

Create `src/lib/series.ts`:

```ts
export type SeriesId = 'cuda' | 'ee-system' | 'rknn';

export interface SeriesMeta {
  id: SeriesId;
  title: string;
  shortTitle: string;
  description: string;
  accent: string;
  href: string;
}

export const SERIES: Record<SeriesId, SeriesMeta> = {
  cuda: {
    id: 'cuda',
    title: 'CUDA 与 NPU 算子开发',
    shortTitle: 'CUDA / NPU',
    description: '从嵌入式开发思维进入 GPU 并行编程、算子优化和端侧 AI 部署。',
    accent: 'blue',
    href: '/cuda/',
  },
  'ee-system': {
    id: 'ee-system',
    title: '嵌入式知识体系',
    shortTitle: 'Embedded Systems',
    description: '系统梳理 C/C++、Rust、构建系统、ARM、STM32、ESP32 与工程实践。',
    accent: 'emerald',
    href: '/ee-system/',
  },
  rknn: {
    id: 'rknn',
    title: 'RKNN 端侧 AI 部署',
    shortTitle: 'RKNN',
    description: '围绕 Rockchip NPU 工具链，覆盖模型转换、量化、板端推理和性能调优。',
    accent: 'violet',
    href: '/rknn/',
  },
};

export const SERIES_ORDER: SeriesId[] = ['cuda', 'ee-system', 'rknn'];
```

- [ ] **Step 3: Create path helpers**

Create `src/lib/paths.ts`:

```ts
export function withBase(path: string) {
  const base = import.meta.env.BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base === '/' ? normalizedPath : `${base.replace(/\/$/, '')}${normalizedPath}`;
}

export function articlePath(series: string, slug: string) {
  return withBase(`/${series}/${slug}/`);
}
```

- [ ] **Step 4: Create article helpers**

Create `src/lib/articles.ts`:

```ts
import type { CollectionEntry } from 'astro:content';
import { SERIES, type SeriesId } from './series';

export type Article = CollectionEntry<'articles'>;

export function sortArticles(articles: Article[]) {
  return [...articles].sort(
    (a, b) =>
      a.data.order - b.data.order ||
      a.data.pubDate.valueOf() - b.data.pubDate.valueOf() ||
      a.data.title.localeCompare(b.data.title, 'zh-CN'),
  );
}

export function bySeries(articles: Article[], series: SeriesId) {
  return sortArticles(articles.filter((article) => article.data.series === series && !article.data.draft));
}

export function slugFor(article: Article) {
  const [, ...parts] = article.id.split('/');
  return parts.join('/').replace(/\.md$/, '');
}

export function hrefFor(article: Article) {
  return `/${article.data.series}/${slugFor(article)}/`;
}

export function seriesMeta(series: SeriesId) {
  return SERIES[series];
}
```

- [ ] **Step 5: Create Astro env file**

Create `src/env.d.ts`:

```ts
/// <reference path="../.astro/types.d.ts" />
```

- [ ] **Step 6: Commit data layer**

Run:

```powershell
git add src/content/config.ts src/lib src/env.d.ts
git commit -m "feat: add article content model"
```

Expected: commit succeeds if Git user identity is configured.

---

### Task 4: Build Layouts And Components

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/SiteLayout.astro`
- Create: `src/layouts/ArticleLayout.astro`
- Create: `src/components/Header.astro`
- Create: `src/components/ThemeToggle.astro`
- Create: `src/components/Search.astro`
- Create: `src/components/SeriesCard.astro`
- Create: `src/components/ArticleCard.astro`
- Create: `src/components/SeriesSidebar.astro`
- Create: `src/components/TableOfContents.astro`
- Create: `src/components/ArticlePager.astro`

- [ ] **Step 1: Create global CSS**

Create a quiet documentation style with light/dark variables, readable Markdown typography, stable sidebars, and responsive behavior. Include KaTeX CSS import and Pagefind UI import.

- [ ] **Step 2: Create global layout**

`SiteLayout.astro` accepts `title` and `description`, imports fonts, global CSS, and renders `Header` plus the page slot.

- [ ] **Step 3: Create navigation and controls**

`Header.astro` renders the site title and three series links. `ThemeToggle.astro` persists a light/dark preference in `localStorage`. `Search.astro` initializes Pagefind UI when the generated search bundle exists.

- [ ] **Step 4: Create cards and sidebars**

`SeriesCard.astro` renders homepage series entries. `ArticleCard.astro` renders article summaries. `SeriesSidebar.astro` renders ordered series navigation with active item support.

- [ ] **Step 5: Create article reading helpers**

`TableOfContents.astro` renders headings from Astro's Markdown heading metadata. `ArticlePager.astro` renders previous and next links.

- [ ] **Step 6: Commit layout and components**

Run:

```powershell
git add src/styles src/layouts src/components
git commit -m "feat: build documentation interface"
```

Expected: commit succeeds if Git user identity is configured.

---

### Task 5: Implement Pages And Routes

**Files:**
- Create: `src/pages/index.astro`
- Create: `src/pages/[series]/index.astro`
- Create: `src/pages/[series]/[...slug].astro`
- Create: `src/pages/404.astro`

- [ ] **Step 1: Create homepage**

Home page loads all non-draft articles, renders a compact hero, three series cards, and the most recent articles.

- [ ] **Step 2: Create dynamic series index pages**

`src/pages/[series]/index.astro` exports static paths for `cuda`, `ee-system`, and `rknn`, then renders the series title, description, and ordered article list.

- [ ] **Step 3: Create dynamic article pages**

`src/pages/[series]/[...slug].astro` exports static paths for every migrated article, renders Markdown content through `ArticleLayout`, and passes active slug, headings, previous article, and next article.

- [ ] **Step 4: Create 404 page**

Create a simple 404 page with a link back to the homepage.

- [ ] **Step 5: Commit pages**

Run:

```powershell
git add src/pages
git commit -m "feat: add article routes"
```

Expected: commit succeeds if Git user identity is configured.

---

### Task 6: Verify Build, Fix Issues, And Start Dev Server

**Files:**
- Modify any files needed to resolve build or visual issues.

- [ ] **Step 1: Install dependencies**

Run:

```powershell
npm install
```

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 2: Run migration after dependencies are available**

Run:

```powershell
npm run migrate
```

Expected: article files and RKNN images are generated.

- [ ] **Step 3: Build site**

Run:

```powershell
npm run build
```

Expected: `astro check`, `astro build`, and `pagefind` complete successfully.

- [ ] **Step 4: Inspect generated routes**

Run:

```powershell
Get-ChildItem -Recurse dist -Filter index.html | Select-Object -First 20 FullName
```

Expected: generated HTML includes homepage, series pages, and article pages.

- [ ] **Step 5: Start dev server**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Astro dev server prints a local URL. Provide the URL to the user.

- [ ] **Step 6: Commit final verified site**

Run:

```powershell
git add .
git commit -m "feat: complete GitHub Pages article site"
```

Expected: commit succeeds if Git user identity is configured.

---

## Self-Review

- Spec coverage: The plan covers Astro site setup, migration, content model, routes, reading experience, deployment, and validation.
- Placeholder scan: The plan avoids TBD/TODO placeholders and names concrete files and commands.
- Type consistency: Series IDs are consistently `cuda`, `ee-system`, and `rknn`; collection name is consistently `articles`.
