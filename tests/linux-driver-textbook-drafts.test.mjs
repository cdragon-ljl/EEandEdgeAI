import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  coverageByOrder,
  legacyRedirects,
  plannedArticles,
  wildfireTopics,
} from './fixtures/linux-driver-textbook-manifest.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const draftDirectory = join(projectRoot, 'docs', 'drafts', 'linux-driver-textbook');

const expectedArticles = [
  ['linux-driver-01-driver-environment-source-tree.md', 1, '实验环境'],
  ['linux-driver-02-kernel-module-first-experiment.md', 2, '内核模块'],
  ['linux-driver-03-vfs-character-device-cdev.md', 3, '字符设备'],
  ['linux-driver-04-character-led-driver-experiment.md', 4, 'LED'],
  ['linux-driver-05-device-model-kobject-class-sysfs.md', 5, '设备模型'],
  ['linux-driver-06-platform-bus-match-probe.md', 6, 'platform'],
  ['linux-driver-07-device-tree-dts-dtsi-compilation.md', 7, '设备树'],
  ['linux-driver-08-device-tree-led-overlay-experiment.md', 8, 'Overlay'],
  ['linux-driver-09-kernel-concurrency-lock-context.md', 9, '并发'],
  ['linux-driver-10-timer-hrtimer-workqueue.md', 10, '定时器'],
  ['linux-driver-11-pinctrl-gpio-descriptor.md', 11, 'Pinctrl'],
  ['linux-driver-12-interrupt-gic-irq-domain-layering.md', 12, '中断'],
  ['linux-driver-13-blocking-nonblocking-poll-async.md', 13, '非阻塞'],
  ['linux-driver-14-input-key-touchscreen.md', 14, 'Input'],
  ['linux-driver-15-i2c-regmap-driver.md', 15, 'I2C'],
  ['linux-driver-16-spi-message-transfer-driver.md', 16, 'SPI'],
  ['linux-driver-17-pwm-backlight-motor.md', 17, 'PWM'],
  ['linux-driver-18-power-management-runtime-pm-watchdog.md', 18, '电源管理'],
  ['linux-driver-19-iio-adc-driver.md', 19, 'IIO'],
  ['linux-driver-20-rtc-nvmem-eeprom.md', 20, 'RTC'],
  ['linux-driver-21-memory-dma-dmaengine-iommu-dmabuf.md', 21, 'DMA'],
  ['linux-driver-22-framebuffer-drm-kms-display.md', 22, 'DRM'],
  ['linux-driver-23-block-emmc-scsi-mtd-ubi-storage.md', 23, '存储'],
  ['linux-driver-24-usb-subsystem-overview.md', 24, 'USB'],
  ['linux-driver-25-uart-serial-core-tty-console.md', 25, 'TTY'],
  ['linux-driver-26-pci-pcie-enumeration-resource-irq.md', 26, 'PCI'],
  ['linux-driver-27-net-device-napi-mac-phy.md', 27, '网络'],
  ['linux-driver-28-smp-memory-barrier-percpu.md', 28, 'SMP'],
  ['linux-driver-29-driver-debug-dynamic-debug-ftrace.md', 29, '驱动调试'],
  ['linux-driver-30-driver-engineering-remove-recovery-soak.md', 30, '驱动工程化'],
];

const expectedTopics = [
  'base_exper_env', 'base_linuxkernel_module', 'base_first_module',
  'base_character_device', 'base_led_character_device',
  'base_linux_device_model', 'base_platform_driver', 'base_driver_tree',
  'base_device_tree_rgb_led', 'base_dynamic_device_tree',
  'base_concurrency_competition', 'base_timer',
  'subsystem_pinctrl_gpio', 'subsystem_interrupt',
  'subsystem_interrupt_layering', 'subsystem_blockio_noblockio',
  'subsystem_asyncnoti', 'subsystem_input_subsystem',
  'subsystem_i2c_subsystem', 'subsystem_spi_subsystem',
  'subsystem_regmap_api', 'subsystem_pwm_subsystem',
  'subsystem_sysfs_system', 'subsystem_power_management',
  'subsystem_iio_subsystem', 'subsystem_adc_driver',
  'subsystem_rtc_subsystem', 'subsystem_touch_driver',
  'subsystem_dma_iommu', 'subsystem_frame_buffer', 'subsystem_drm',
  'subsystem_block_device', 'subsystem_usb_subsystem',
  'subsystem_tty_subsystem', 'subsystem_scsi_subsystem',
  'subsystem_pci_subsystem', 'subsystem_net_subsystem', 'advance_smp',
];

const expectedCoverage = {
  1: ['base_exper_env'],
  2: ['base_linuxkernel_module', 'base_first_module'],
  3: ['base_character_device'],
  4: ['base_led_character_device'],
  5: ['base_linux_device_model', 'subsystem_sysfs_system'],
  6: ['base_platform_driver'],
  7: ['base_driver_tree'],
  8: ['base_device_tree_rgb_led', 'base_dynamic_device_tree'],
  9: ['base_concurrency_competition'],
  10: ['base_timer'],
  11: ['subsystem_pinctrl_gpio'],
  12: ['subsystem_interrupt', 'subsystem_interrupt_layering'],
  13: ['subsystem_blockio_noblockio', 'subsystem_asyncnoti'],
  14: ['subsystem_input_subsystem', 'subsystem_touch_driver'],
  15: ['subsystem_i2c_subsystem', 'subsystem_regmap_api'],
  16: ['subsystem_spi_subsystem'],
  17: ['subsystem_pwm_subsystem'],
  18: ['subsystem_power_management'],
  19: ['subsystem_iio_subsystem', 'subsystem_adc_driver'],
  20: ['subsystem_rtc_subsystem'],
  21: ['subsystem_dma_iommu'],
  22: ['subsystem_frame_buffer', 'subsystem_drm'],
  23: ['subsystem_block_device', 'subsystem_scsi_subsystem'],
  24: ['subsystem_usb_subsystem'],
  25: ['subsystem_tty_subsystem'],
  26: ['subsystem_pci_subsystem'],
  27: ['subsystem_net_subsystem'],
  28: ['advance_smp'],
  29: [],
  30: [],
};

const expectedRedirects = {
  'linux-driver-01-platform-device-model-and-probe': '/linux-driver/linux-driver-06-platform-bus-match-probe/',
  'linux-driver-02-first-kernel-module-and-char-device': '/linux-driver/linux-driver-02-kernel-module-first-experiment/',
  'linux-driver-03-misc-sysfs-procfs-debugfs': '/linux-driver/linux-driver-05-device-model-kobject-class-sysfs/',
  'linux-driver-04-gpio-led-subsystem': '/linux-driver/linux-driver-04-character-led-driver-experiment/',
  'linux-driver-05-keys-interrupt-input-subsystem': '/linux-driver/linux-driver-14-input-key-touchscreen/',
  'linux-driver-06-timers-workqueues-delayed-work': '/linux-driver/linux-driver-10-timer-hrtimer-workqueue/',
  'linux-driver-07-kernel-synchronization-primitives': '/linux-driver/linux-driver-09-kernel-concurrency-lock-context/',
  'linux-driver-08-i2c-regmap-sensor-driver': '/linux-driver/linux-driver-15-i2c-regmap-driver/',
  'linux-driver-09-spi-driver-transfers': '/linux-driver/linux-driver-16-spi-message-transfer-driver/',
  'linux-driver-10-uart-tty-console-driver': '/linux-driver/linux-driver-25-uart-serial-core-tty-console/',
  'linux-driver-11-pwm-adc-watchdog': '/linux-driver/linux-driver-17-pwm-backlight-motor/',
  'linux-driver-12-dma-cache-coherency': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-13-driver-debugging-methodology': '/linux-driver/linux-driver-29-driver-debug-dynamic-debug-ftrace/',
  'linux-driver-14-linux-device-model-lifecycle': '/linux-driver/linux-driver-05-device-model-kobject-class-sysfs/',
  'linux-driver-15-driver-memory-io-mapping': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-16-pinctrl-gpio-irq-subsystem': '/linux-driver/linux-driver-11-pinctrl-gpio-descriptor/',
  'linux-driver-17-clock-reset-regulator-power-sequence': '/linux-driver/linux-driver-18-power-management-runtime-pm-watchdog/',
  'linux-driver-18-iommu-dma-address-translation': '/linux-driver/linux-driver-21-memory-dma-dmaengine-iommu-dmabuf/',
  'linux-driver-19-firmware-remoteproc-rpmsg': '/bsp/',
  'linux-driver-20-rtc-nvmem-eeprom-efuse': '/linux-driver/linux-driver-20-rtc-nvmem-eeprom/',
  'linux-driver-21-block-storage-emmc-sd': '/linux-driver/linux-driver-23-block-emmc-scsi-mtd-ubi-storage/',
  'linux-driver-22-mtd-ubi-nor-nand': '/linux-driver/linux-driver-23-block-emmc-scsi-mtd-ubi-storage/',
  'linux-driver-23-ethernet-mac-phy-netdev': '/linux-driver/linux-driver-27-net-device-napi-mac-phy/',
  'linux-driver-24-usb-host-device-otg': '/linux-driver/linux-driver-24-usb-subsystem-overview/',
  'linux-driver-25-v4l2-imx415-mipi-csi': '/video-audio/av-04-v4l2-media-controller-driver-framework/',
  'linux-driver-26-alsa-asoc-i2s-audio': '/video-audio/av-12-alsa-asoc-driver-framework/',
  'linux-driver-27-thermal-cpufreq-devfreq-pm': '/linux-driver/linux-driver-18-power-management-runtime-pm-watchdog/',
  'linux-driver-28-reliability-performance-debug': '/linux-driver/linux-driver-30-driver-engineering-remove-recovery-soak/',
};

const sorted = (values) => [...values].sort();
const setDifference = (left, right) => sorted(new Set(left.filter((value) => !right.has(value))));

test('defines the exact 30-article curriculum manifest', () => {
  assert.deepEqual(plannedArticles, expectedArticles.map(([file, order, titleToken]) => ({ file, order, titleToken })));
});

test('covers exactly the official 38 Wildfire topics', () => {
  const covered = new Set(Object.values(coverageByOrder).flat());
  const expected = new Set(expectedTopics);
  assert.deepEqual(setDifference(expectedTopics, covered), [], 'missing topics');
  assert.deepEqual(setDifference([...covered], expected), [], 'unknown topics');
  assert.equal(wildfireTopics.length, 38);
  assert.deepEqual(sorted(wildfireTopics), sorted(expectedTopics));
  assert.deepEqual(coverageByOrder, expectedCoverage);
});

test('maps every historical slug to its exact redirect target', () => {
  assert.deepEqual(legacyRedirects, expectedRedirects);
});

test('validates every existing textbook draft', () => {
  if (!existsSync(draftDirectory)) return;

  const manifestByFile = new Map(plannedArticles.map((article) => [article.file, article]));
  const draftFiles = readdirSync(draftDirectory).filter((file) => file.endsWith('.md'));
  for (const file of draftFiles) {
    const source = readFileSync(join(draftDirectory, file), 'utf8');
    const article = manifestByFile.get(file);
    assert.ok(article, `${file} is not in the curriculum manifest`);

    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
    assert.match(frontmatter, /(?:^|\r?\n)series:\s*linux-driver\s*(?:\r?\n|$)/);
    assert.match(frontmatter, new RegExp(`(?:^|\\r?\\n)order:\\s*${article.order}\\s*(?:\\r?\\n|$)`));
    assert.match(frontmatter, /(?:^|\r?\n)draft:\s*true\s*(?:\r?\n|$)/);

    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
    assert.equal((body.match(/^#\s+/gm) ?? []).length, 1, `${file} must have one H1`);
    assert.doesNotMatch(body, /TBD|TODO|初学者扩展讲解|本章验收|验收问题|建议保留/);
    assert.ok((body.match(/^##\s+.*(?:第一步|第二步|第三步|第四步).*$/gm) ?? []).length < 4,
      `${file} has too many numbered process H2 headings`);
    assert.match(source, /https?:\/\/(?:www\.)?(?:kernel\.org|docs\.kernel\.org|devicetree\.org|docs\.kernel\.org\/doc\/html\/latest\/)/,
      `${file} must cite an official Linux, kernel source, Devicetree, or subsystem document`);
  }
});
