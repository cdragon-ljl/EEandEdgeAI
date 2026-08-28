import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const bspFiles = [
  'bsp-01-linux-bsp-what-is-it-detailed.md',
  'bsp-02-rv1126-boot-flow-power-on-to-shell.md',
  'bsp-03-env-sdk-first-build.md',
  'bsp-04-flash-uart-schematic-instrument-debug.md',
  'bsp-05-rockchip-sdk-build-system.md',
  'bsp-06-uboot-role-in-embedded-linux.md',
  'bsp-07-uboot-config-build.md',
  'bsp-08-uboot-source-boot-flow.md',
  'bsp-09-uboot-device-tree-board-parameters.md',
  'bsp-10-uboot-debug-custom-commands.md',
  'bsp-11-linux-kernel-build-and-config.md',
  'bsp-12-linux-boot-flow-and-logs.md',
  'bsp-13-device-tree-basics-dts-dtsi-binding.md',
  'bsp-14-device-tree-pinctrl-clock-reset-regulator.md',
  'bsp-15-buildroot-rootfs-integration.md',
  'bsp-16-startup-services-logs.md',
  'bsp-17-power-management-watchdog-hardening.md',
  'bsp-18-kernel-maintenance-patch-management.md',
  'bsp-19-partition-ota-version-manufacturing.md',
  'bsp-20-end-to-end-product-demo.md',
];

const driverSlugs = [
  'platform-device-model-and-probe', 'first-kernel-module-and-char-device',
  'misc-sysfs-procfs-debugfs', 'gpio-led-subsystem',
  'keys-interrupt-input-subsystem', 'timers-workqueues-delayed-work',
  'kernel-synchronization-primitives', 'i2c-regmap-sensor-driver',
  'spi-driver-transfers', 'uart-tty-console-driver', 'pwm-adc-watchdog',
  'dma-cache-coherency', 'driver-debugging-methodology',
  'linux-device-model-lifecycle', 'driver-memory-io-mapping',
  'pinctrl-gpio-irq-subsystem', 'clock-reset-regulator-power-sequence',
  'iommu-dma-address-translation', 'firmware-remoteproc-rpmsg',
  'rtc-nvmem-eeprom-efuse', 'block-storage-emmc-sd', 'mtd-ubi-nor-nand',
  'ethernet-mac-phy-netdev', 'usb-host-device-otg',
  'v4l2-imx415-mipi-csi', 'alsa-asoc-i2s-audio',
  'thermal-cpufreq-devfreq-pm', 'reliability-performance-debug',
];

function assertSeriesFiles(dir, files, series, title) {
  const actual = readdirSync(dir).filter((file) => /^.*-\d{2}-.*\.md$/.test(file)).sort();
  assert.deepEqual(actual, [...files].sort());
  files.forEach((file, index) => {
    const markdown = readFileSync(join(dir, file), 'utf8');
    assert.match(markdown, new RegExp(`^series: ${series}$`, 'm'));
    assert.match(markdown, new RegExp(`^order: ${index + 1}$`, 'm'));
    assert.match(markdown, new RegExp(`^title: .*${title}.*#${String(index + 1).padStart(2, '0')}`,'m'));
    assert.match(markdown, /^draft: false$/m);
  });
}

test('BSP and Linux driver are independent first-class series', () => {
  const content = readFileSync('src/content/config.ts', 'utf8');
  const series = readFileSync('src/lib/series.ts', 'utf8');
  const articles = readFileSync('src/lib/articles.ts', 'utf8');
  assert.match(content, /linux-driver/);
  assert.match(series, /'linux-driver':\s*\{/);
  assert.match(articles, /value === 'linux-driver'/);
  assert.match(series, /SERIES_ORDER:.*'bsp', 'linux-driver', 'usb'/);
});

test('BSP retains a contiguous 20-article board-integration sequence', () => {
  assertSeriesFiles('docs/articles/bsp', bspFiles, 'bsp', 'Linux BSP 开发实战');
});

test('Linux driver publishes a contiguous 28-article driver sequence', () => {
  const files = driverSlugs.map((slug, index) => `linux-driver-${String(index + 1).padStart(2, '0')}-${slug}.md`);
  for (const file of files) {
    const markdown = readFileSync(join('docs/articles/linux-driver', file), 'utf8');
    assert.match(markdown, /^series: linux-driver$/m);
    assert.match(markdown, /^draft: false$/m);
  }
  const framework = readFileSync('docs/articles/linux-driver/linux-driver-framework.md', 'utf8');
  assert.match(framework, /^series: linux-driver$/m);
  assert.match(framework, /^draft: true$/m);
});

test('Linux driver initially reuses the BSP cover bytes', () => {
  const driverCover = 'public/covers/linux-driver.webp';
  assert.ok(existsSync(driverCover));
  assert.deepEqual(readFileSync(driverCover), readFileSync('public/covers/bsp.webp'));
});

test('legacy BSP article routes redirect to their new series and numbers', () => {
  const route = 'src/pages/bsp/[...legacy].astro';
  assert.ok(existsSync(route));
  const source = readFileSync(route, 'utf8');
  assert.match(source, /http-equiv="refresh"/);
  assert.match(source, /location\.replace/);
  assert.match(source, /rel="canonical"/);
  driverSlugs.forEach((slug, index) => {
    const oldOrder = String(index + 15).padStart(2, '0');
    const newOrder = String(index + 1).padStart(2, '0');
    assert.match(source, new RegExp(`bsp-${oldOrder}-${slug}`));
    assert.match(source, new RegExp(`linux-driver-${newOrder}-${slug}`));
  });
  ['buildroot-rootfs-integration','startup-services-logs','power-management-watchdog-hardening','kernel-maintenance-patch-management','partition-ota-version-manufacturing','end-to-end-product-demo'].forEach((slug, index) => {
    assert.match(source, new RegExp(`bsp-${index + 43}-${slug}`));
    assert.match(source, new RegExp(`bsp-${String(index + 15).padStart(2, '0')}-${slug}`));
  });
});
