import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const covers = {
  cuda: [1923, 818],
  'ee-system': [1922, 818],
  freertos: [1923, 818],
  rknn: [1938, 811],
  riscv: [1919, 820],
  fpga: [1921, 819],
  zephyr: [1923, 818],
  bsp: [1942, 809],
  'linux-driver': [1942, 809],
  usb: [1919, 820],
  pcie: [1919, 820],
  'video-audio': [1920, 819],
  'deep-learning': [1672, 941],
};

function readWebpDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `${path} must be a RIFF file`);
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', `${path} must be a WebP file`);

  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  }

  if (chunk === 'VP8 ') {
    assert.equal(buffer.toString('hex', 23, 26), '9d012a', `${path} has an invalid VP8 frame header`);
    return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  }

  if (chunk === 'VP8L') {
    assert.equal(buffer[20], 0x2f, `${path} has an invalid VP8L signature`);
    const dimensions = buffer.readUInt32LE(21);
    return [(dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1];
  }

  assert.fail(`${path} uses unsupported WebP chunk ${chunk}`);
}

test('every registered series has a deployable webp cover with intrinsic dimensions', () => {
  const seriesConfig = readFileSync('src/lib/series.ts', 'utf8');

  for (const [id, [width, height]] of Object.entries(covers)) {
    const coverPath = join('public/covers', `${id}.webp`);
    assert.match(seriesConfig, new RegExp(`src: '/covers/${id}\\.webp'`));
    assert.match(seriesConfig, new RegExp(`width: ${width}, height: ${height}`));
    assert.ok(existsSync(coverPath), `${id}.webp must exist`);
    assert.deepEqual(readWebpDimensions(coverPath), [width, height], `${id}.webp dimensions must match metadata`);
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
