import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('legacy usb-pcie landing page redirects to USB', () => {
  const path = 'src/pages/usb-pcie/index.astro';
  assert.ok(existsSync(path), 'legacy landing route must exist');
  const source = readFileSync(path, 'utf8');

  assert.match(source, /withBase\('\/usb\/'\)/);
  assert.match(source, /http-equiv="refresh"/);
  assert.match(source, /location\.replace/);
  assert.match(source, /rel="canonical"/);
});

test('legacy usb-pcie article routes generate redirects for split series', () => {
  const path = 'src/pages/usb-pcie/[...slug].astro';
  assert.ok(existsSync(path), 'legacy article route must exist');
  const source = readFileSync(path, 'utf8');

  assert.match(source, /getStaticPaths/);
  assert.match(source, /data\.series === 'usb'/);
  assert.match(source, /data\.series === 'pcie'/);
  assert.match(source, /location\.replace/);
  assert.match(source, /rel="canonical"/);
});
