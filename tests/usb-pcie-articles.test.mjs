import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const publishedFiles = (directory, framework) =>
  readdirSync(directory)
    .filter((file) => file.endsWith('.md') && file !== framework)
    .sort();

test('USB and PCIe publish only the rewritten canonical article sets', () => {
  const usb = publishedFiles('docs/articles/usb', 'usb-framework.md');
  const pcie = publishedFiles('docs/articles/pcie', 'pcie-framework.md');

  assert.equal(usb.length, 14);
  assert.equal(pcie.length, 18);
  assert.deepEqual(usb.map((file) => Number(file.match(/^usb-(\d+)/)?.[1])),
    Array.from({ length: 14 }, (_, index) => index + 1));
  assert.deepEqual(pcie.map((file) => Number(file.match(/^pci-(\d+)/)?.[1])),
    Array.from({ length: 18 }, (_, index) => index + 1));

  assert.ok(!usb.some((file) => file.includes('usb-architecture-enumeration')));
  assert.ok(!pcie.some((file) => file.startsWith('usb-pcie-')));
});

test('rewritten article headings keep one numbered H2 style', () => {
  const sets = [
    ['docs/articles/usb', publishedFiles('docs/articles/usb', 'usb-framework.md')],
    ['docs/articles/pcie', publishedFiles('docs/articles/pcie', 'pcie-framework.md')],
  ];

  for (const [directory, files] of sets) {
    for (const file of files) {
      const markdown = readFileSync(join(directory, file), 'utf8');
      const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      assert.ok(headings.length > 0, `${file} must have H2 headings`);
      for (const heading of headings) {
        assert.match(heading, /^[一二三四五六七八九十百]+、/, `${file}: ${heading}`);
      }
    }
  }
});

test('USB and PCIe framework files are draft planning artifacts excluded from content', () => {
  for (const [path, series] of [
    ['docs/articles/usb/usb-framework.md', 'usb'],
    ['docs/articles/pcie/pcie-framework.md', 'pcie'],
  ]) {
    assert.ok(existsSync(path));
    const markdown = readFileSync(path, 'utf8');
    assert.match(markdown, new RegExp(`^series: ${series}$`, 'm'));
    assert.match(markdown, /^draft: true$/m);
  }

  const config = readFileSync('src/content/config.ts', 'utf8');
  assert.match(config, /usb-framework\|pcie-framework/);
});

test('CherryUSB comparison is pinned to the verified v1.6.1 release', () => {
  const markdown = readFileSync('docs/articles/usb/usb-14-debugging-usbmon-cherryusb.md', 'utf8');

  assert.match(markdown, /CherryUSB `v1\.6\.1`/);
  assert.match(markdown, /c9625ffa773ad10b8824d1b5361bca2ccc1f3d1e/);
  assert.match(markdown, /github\.com\/cherry-embedded\/CherryUSB\/releases\/tag\/v1\.6\.1/);
});
