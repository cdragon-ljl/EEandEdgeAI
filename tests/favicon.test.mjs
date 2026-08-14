import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('site publishes the Longway favicon assets', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');

  assert.ok(existsSync('longway.ttf'));
  assert.ok(existsSync('public/favicon.png'));
  assert.ok(existsSync('public/fonts/longway.ttf'));
  assert.match(siteLayout, /rel="icon"/);
  assert.match(siteLayout, /favicon\.png/);
  assert.match(siteLayout, /apple-touch-icon/);
});
