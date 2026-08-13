# GitHub Pages Astro Article Site Design

Date: 2026-08-12

## Goal

Build a GitHub Pages-ready technical article site in `D:\EEandEdgeAI`, inspired by the structure and reading experience of AIInfraGuide. The site will migrate existing Markdown articles from:

- `D:\Official Account\site\cuda`
- `D:\Official Account\site\ee-system`
- `D:\Official Account\site\rknn`

The user originally mentioned `ss-system`; this is confirmed to mean the existing `ee-system` directory.

## Recommended Approach

Use a clean Astro static site instead of reusing the existing Next.js site. Astro matches the reference project's content-first architecture, works naturally with Markdown, and deploys cleanly to GitHub Pages with GitHub Actions.

## Site Structure

The new project will use:

- `src/pages` for home, series index pages, and article detail routes.
- `src/layouts` for the global shell and article layout.
- `src/components` for header, theme toggle, search, side navigation, article cards, and table of contents.
- `src/content/config.ts` for Markdown content collections.
- `docs/cuda`, `docs/ee-system`, and `docs/rknn` for migrated articles.
- `public/images/rknn` for RKNN images copied from the source site.

## Content Model

Each migrated article will receive frontmatter:

- `title`: extracted from the first `#` heading.
- `description`: extracted from the first meaningful paragraph or blockquote.
- `pubDate`: derived from the source file timestamp when possible.
- `series`: one of `cuda`, `ee-system`, or `rknn`.
- `order`: extracted from the numeric prefix in the filename.
- `tags`: generated from the series and article topic.
- `draft`: default `false`.

Article body content should remain as close to the source Markdown as possible.

## Routes

The site will expose:

- `/` as a homepage with three series cards and recent article links.
- `/cuda/` as the CUDA/NPU series landing page.
- `/ee-system/` as the embedded systems series landing page.
- `/rknn/` as the RKNN deployment series landing page.
- `/cuda/<slug>/`, `/ee-system/<slug>/`, and `/rknn/<slug>/` as article pages.

## Reading Experience

Article pages will include:

- Top navigation with site title, series links, search entry, and theme toggle.
- Left sidebar listing articles in the current series.
- Main Markdown content with code highlighting, tables, blockquotes, and math rendering.
- Right table of contents generated from headings.
- Previous/next article navigation.
- Responsive layout for mobile.

## Deployment

GitHub Pages deployment will use:

- `astro.config.mjs` with configurable `site` and `base`.
- `.github/workflows/deploy.yml` using Node 20, `npm ci`, `npm run build`, and `actions/deploy-pages`.
- Static output from `dist`.

The final repository can be pushed to GitHub, then GitHub Pages should be configured to deploy from GitHub Actions.

## Validation

Before completion:

- Install dependencies.
- Run the production build.
- Preview or inspect generated routes.
- Verify Markdown renders correctly.
- Verify local image references render for RKNN articles.
- Confirm the GitHub Actions workflow exists.

## Out Of Scope

- Editing article prose.
- Generating missing CUDA illustrations from prompt notes.
- Publishing directly to the user's GitHub account unless explicitly requested.
- Migrating the old Next.js implementation.
