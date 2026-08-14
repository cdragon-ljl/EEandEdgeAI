import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('article pages include client-side Mermaid rendering support', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');
  const mermaidComponent = readFileSync('src/components/MermaidRenderer.astro', 'utf8');
  const globalCss = readFileSync('src/styles/global.css', 'utf8');

  assert.ok(packageJson.dependencies.mermaid);
  assert.match(siteLayout, /import MermaidRenderer from '\.\.\/components\/MermaidRenderer\.astro';/);
  assert.match(siteLayout, /<MermaidRenderer \/>/);
  assert.match(mermaidComponent, /import\('mermaid'\)/);
  assert.match(mermaidComponent, /code\.language-mermaid/);
  assert.match(mermaidComponent, /querySelectorAll\('\.line'\)/);
  assert.match(mermaidComponent, /join\('\\n'\)/);
  assert.match(mermaidComponent, /data-mermaid-source/);
  assert.match(globalCss, /\.mermaid-diagram/);
});

test('Mermaid fenced blocks exist in published article series', () => {
  const rknnArticle = readFileSync('docs/articles/rknn/rknn-01-rv1126-platform-toolchain-overview.md', 'utf8');
  const zephyrArticle = readFileSync('docs/articles/zephyr/zephyr-01-overview-env-hello-world.md', 'utf8');

  assert.match(rknnArticle, /```mermaid/);
  assert.match(zephyrArticle, /```mermaid/);
});
