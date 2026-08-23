import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('desktop series navigation uses two centered rows of at most eight items', () => {
  const header = readFileSync('src/components/Header.astro', 'utf8');

  assert.match(header, /const DESKTOP_NAV_ITEMS_PER_ROW = 8/);
  assert.match(header, /SERIES_ORDER\.slice\(0, DESKTOP_NAV_ITEMS_PER_ROW\)/);
  assert.match(header, /SERIES_ORDER\.slice\(DESKTOP_NAV_ITEMS_PER_ROW, DESKTOP_NAV_ITEMS_PER_ROW \* 2\)/);
  assert.match(header, /desktopNavRows\.map/);
  assert.match(header, /justify-center/);
  assert.match(header, /xl:flex/);
  assert.doesNotMatch(header, /lg:flex|lg:hidden/);
});

test('narrow navigation uses the scrollable drawer and matching xl breakpoint', () => {
  const header = readFileSync('src/components/Header.astro', 'utf8');

  assert.match(header, /overflow-y-auto/);
  assert.match(header, /overscroll-contain/);
  assert.match(header, /xl:hidden/);
});

test('page content clears both mobile and two-row desktop header heights', () => {
  const siteLayout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');

  assert.match(siteLayout, /pt-16 xl:pt-24/);
});
