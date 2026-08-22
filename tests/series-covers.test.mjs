import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const covers = {
  cuda: [1923, 818],
  'ee-system': [1922, 818],
  rknn: [1938, 811],
  riscv: [1919, 820],
  fpga: [1921, 819],
  zephyr: [1923, 818],
  bsp: [1942, 809],
  usb: [1919, 820],
  pcie: [1919, 820],
  'video-audio': [1920, 819],
};

test('every registered series has a deployable webp cover with intrinsic dimensions', () => {
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');

  for (const [id, [width, height]] of Object.entries(covers)) {
    assert.match(seriesConfig, new RegExp(`src: '/covers/${id}\\.webp'`));
    assert.match(seriesConfig, new RegExp(`width: ${width}, height: ${height}`));
    assert.ok(existsSync(join('public/covers', `${id}.webp`)), `${id}.webp must exist`);
  }
});

test('series cards render full-ratio lazy cover images', () => {
  const seriesCard = readFileSync('src/components/SeriesCard.astro', 'utf8');

  assert.match(seriesCard, /series\.cover\.src/);
  assert.match(seriesCard, /series\.cover\.width/);
  assert.match(seriesCard, /series\.cover\.height/);
  assert.match(seriesCard, /loading="lazy"/);
  assert.match(seriesCard, /object-contain/);
});

test('series pages render covers while article pages stay content-first', () => {
  const seriesPage = readFileSync('src/pages/[series]/index.astro', 'utf8');
  const articleLayout = readFileSync('src/layouts/ArticleLayout.astro', 'utf8');

  assert.match(seriesPage, /meta\.cover\.src/);
  assert.match(seriesPage, /meta\.cover\.width/);
  assert.match(seriesPage, /meta\.cover\.height/);
  assert.doesNotMatch(articleLayout, /meta\.cover/);
});
