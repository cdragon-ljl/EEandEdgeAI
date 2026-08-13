import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const site = process.env.SITE_URL || 'https://cdragon-ljl.github.io';
const base = process.env.SITE_BASE || '/EEandEdgeAI';

function simpleSitemap() {
  return {
    name: 'simple-sitemap',
    hooks: {
      'astro:build:done': async ({ dir, pages }) => {
        const root = new URL(base.endsWith('/') ? base : `${base}/`, site);
        const urls = pages
          .filter((page) => {
            const pathname = page.pathname.replace(/^\/|\/$/g, '');
            return pathname !== '404' && pathname !== '404.html';
          })
          .map((page) => new URL(page.pathname.replace(/^\//, ''), root).href)
          .sort();
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
          '</urlset>',
          '',
        ].join('\n');
        const fs = await import('node:fs/promises');
        await fs.writeFile(new URL('sitemap.xml', dir), body, 'utf8');
      },
    },
  };
}

export default defineConfig({
  site,
  base,
  integrations: [tailwind(), simpleSitemap()],
  experimental: {
    contentLayer: true,
  },
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
