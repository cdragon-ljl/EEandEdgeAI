import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('site publishes the Longway favicon assets', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');
  const favicon = readFileSync('public/favicon.png');
  const stackedWordmarkPath = 'design-assets/logo-concepts/longway-square-stacked-wordmark.png';
  const referencePaths = [
    'design-assets/logo-concepts/longway-b1-ivory-cinema.png',
    'design-assets/logo-concepts/longway-b1-signal-gold.png',
  ];

  assert.ok(existsSync('longway.ttf'));
  assert.ok(existsSync('public/favicon.png'));
  assert.ok(existsSync('public/fonts/longway.ttf'));
  assert.ok(existsSync(stackedWordmarkPath));
  for (const referencePath of referencePaths) assert.ok(existsSync(referencePath));

  const stackedWordmark = readFileSync(stackedWordmarkPath);
  const references = referencePaths.map((file) => readFileSync(file));

  assert.equal(favicon.readUInt32BE(16), 512);
  assert.equal(favicon.readUInt32BE(20), 512);
  assert.deepEqual(favicon, stackedWordmark);
  for (const reference of references) {
    assert.equal(reference.readUInt32BE(16), 1300);
    assert.equal(reference.readUInt32BE(20), 1000);
  }
  assert.match(siteLayout, /rel="icon"/);
  assert.match(siteLayout, /favicon\.png/);
  assert.match(siteLayout, /sizes="512x512"/);
  assert.match(siteLayout, /apple-touch-icon/);
  assert.match(siteLayout, /theme-color" content="#1c1917"/);
});
