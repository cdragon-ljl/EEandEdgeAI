import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const articleDir = 'docs/articles/linux-driver';

const learningPath = [
  ['linux-driver-02-first-kernel-module-and-char-device.md', 1, '内核模块'],
  ['linux-driver-14-linux-device-model-lifecycle.md', 2, '设备模型'],
  ['linux-driver-01-platform-device-model-and-probe.md', 3, 'platform'],
  ['linux-driver-15-driver-memory-io-mapping.md', 4, '内存'],
  ['linux-driver-03-misc-sysfs-procfs-debugfs.md', 5, 'misc'],
  ['linux-driver-06-timers-workqueues-delayed-work.md', 6, 'workqueue'],
  ['linux-driver-07-kernel-synchronization-primitives.md', 7, '同步'],
  ['linux-driver-13-driver-debugging-methodology.md', 8, '调试'],
  ['linux-driver-16-pinctrl-gpio-irq-subsystem.md', 9, 'pinctrl'],
  ['linux-driver-04-gpio-led-subsystem.md', 10, 'LED'],
  ['linux-driver-05-keys-interrupt-input-subsystem.md', 11, 'Input'],
  ['linux-driver-17-clock-reset-regulator-power-sequence.md', 12, 'clock'],
  ['linux-driver-08-i2c-regmap-sensor-driver.md', 13, 'I2C'],
  ['linux-driver-09-spi-driver-transfers.md', 14, 'SPI'],
  ['linux-driver-10-uart-tty-console-driver.md', 15, 'UART'],
  ['linux-driver-11-pwm-adc-watchdog.md', 16, 'PWM'],
  ['linux-driver-12-dma-cache-coherency.md', 17, 'DMA'],
  ['linux-driver-18-iommu-dma-address-translation.md', 18, 'IOMMU'],
  ['linux-driver-19-firmware-remoteproc-rpmsg.md', 19, 'remoteproc'],
  ['linux-driver-20-rtc-nvmem-eeprom-efuse.md', 20, 'NVMEM'],
  ['linux-driver-21-block-storage-emmc-sd.md', 21, 'Block'],
  ['linux-driver-22-mtd-ubi-nor-nand.md', 22, 'MTD'],
  ['linux-driver-23-ethernet-mac-phy-netdev.md', 23, 'Ethernet'],
  ['linux-driver-24-usb-host-device-otg.md', 24, 'USB'],
  ['linux-driver-25-v4l2-imx415-mipi-csi.md', 25, 'V4L2'],
  ['linux-driver-26-alsa-asoc-i2s-audio.md', 26, 'ASoC'],
  ['linux-driver-27-thermal-cpufreq-devfreq-pm.md', 27, 'thermal'],
  ['linux-driver-28-reliability-performance-debug.md', 28, '长稳'],
];

const qualityContractFiles = new Set([
  'linux-driver-02-first-kernel-module-and-char-device.md',
  'linux-driver-14-linux-device-model-lifecycle.md',
  'linux-driver-01-platform-device-model-and-probe.md',
  'linux-driver-15-driver-memory-io-mapping.md',
  'linux-driver-03-misc-sysfs-procfs-debugfs.md',
  'linux-driver-06-timers-workqueues-delayed-work.md',
  'linux-driver-07-kernel-synchronization-primitives.md',
  'linux-driver-13-driver-debugging-methodology.md',
  'linux-driver-16-pinctrl-gpio-irq-subsystem.md',
  'linux-driver-04-gpio-led-subsystem.md',
  'linux-driver-05-keys-interrupt-input-subsystem.md',
  'linux-driver-17-clock-reset-regulator-power-sequence.md',
  'linux-driver-08-i2c-regmap-sensor-driver.md',
  'linux-driver-09-spi-driver-transfers.md',
  'linux-driver-10-uart-tty-console-driver.md',
  'linux-driver-11-pwm-adc-watchdog.md',
  'linux-driver-12-dma-cache-coherency.md',
  'linux-driver-18-iommu-dma-address-translation.md',
  'linux-driver-19-firmware-remoteproc-rpmsg.md',
  'linux-driver-20-rtc-nvmem-eeprom-efuse.md',
  'linux-driver-21-block-storage-emmc-sd.md',
  'linux-driver-22-mtd-ubi-nor-nand.md',
  'linux-driver-23-ethernet-mac-phy-netdev.md',
  'linux-driver-24-usb-host-device-otg.md',
  'linux-driver-25-v4l2-imx415-mipi-csi.md',
  'linux-driver-26-alsa-asoc-i2s-audio.md',
  'linux-driver-27-thermal-cpufreq-devfreq-pm.md',
  'linux-driver-28-reliability-performance-debug.md',
]);
const introOrder = {
  'linux-driver-02-first-kernel-module-and-char-device.md': ['内核空间', '模块', 'Kbuild', '字符设备', 'file_operations'],
  'linux-driver-14-linux-device-model-lifecycle.md': ['struct device', 'struct device_driver', 'struct bus_type', 'match', 'probe'],
  'linux-driver-01-platform-device-model-and-probe.md': ['Device Tree', 'platform_device', 'of_match_table', 'probe', 'devm_'],
  'linux-driver-15-driver-memory-io-mapping.md': ['虚拟地址', 'kmalloc', 'copy_to_user', 'resource', 'ioremap', 'readl'],
  'linux-driver-03-misc-sysfs-procfs-debugfs.md': ['cdev', 'misc', 'sysfs', 'debugfs', 'procfs'],
  'linux-driver-06-timers-workqueues-delayed-work.md': ['进程上下文', '硬中断', 'timer', 'workqueue', 'delayed work'],
  'linux-driver-07-kernel-synchronization-primitives.md': ['共享数据', 'mutex', 'spinlock', 'atomic', 'completion', 'waitqueue'],
  'linux-driver-13-driver-debugging-methodology.md': ['现象', '层次', '假设', 'dynamic_debug', 'tracepoint', 'ftrace'],
  'linux-driver-16-pinctrl-gpio-irq-subsystem.md': ['Device Tree', 'pinctrl', 'GPIO descriptor', 'gpiochip', 'irq_domain', 'request_threaded_irq'],
  'linux-driver-04-gpio-led-subsystem.md': ['电气', 'gpio-leds', 'LED class', 'trigger', '自定义驱动'],
  'linux-driver-05-keys-interrupt-input-subsystem.md': ['gpio-keys', 'IRQ', 'debounce', 'input_event', 'wakeup'],
  'linux-driver-17-clock-reset-regulator-power-sequence.md': ['regulator', 'clock', 'reset', 'pinctrl', 'deferred probe', 'runtime PM'],
  'linux-driver-08-i2c-regmap-sensor-driver.md': ['I2C adapter', 'i2c_client', 'i2c_msg', 'regmap', 'runtime PM'],
  'linux-driver-09-spi-driver-transfers.md': ['spi_controller', 'spi_device', 'spi_message', 'spi_transfer', 'chip select', 'DMA'],
  'linux-driver-10-uart-tty-console-driver.md': ['UART', 'serial_core', 'TTY', 'console', 'termios', 'DMA'],
  'linux-driver-11-pwm-adc-watchdog.md': ['PWM framework', 'IIO', 'ADC', 'watchdog', 'runtime PM'],
  'linux-driver-12-dma-cache-coherency.md': ['DMA mapping API', 'dma_set_mask', 'dma_alloc_coherent', 'dma_map_single', 'DMAengine', 'dma_request_chan', 'ownership'],
  'linux-driver-18-iommu-dma-address-translation.md': ['IOVA', 'iommu_domain', 'IOMMU group', 'IOTLB', 'fault', 'dma-buf', 'dma_fence'],
  'linux-driver-19-firmware-remoteproc-rpmsg.md': ['request_firmware', 'remoteproc', 'resource table', 'virtio', 'rpmsg', 'endpoint', 'crash'],
  'linux-driver-20-rtc-nvmem-eeprom-efuse.md': ['RTC', 'NVMEM provider', 'NVMEM cell', 'EEPROM', 'eFuse', '校验'],
  'linux-driver-21-block-storage-emmc-sd.md': ['block device', 'MMC host', 'block layer', 'request_queue', 'partition', 'filesystem', 'flush/FUA'],
  'linux-driver-22-mtd-ubi-nor-nand.md': ['raw flash', 'MTD', 'eraseblock', 'bad block', 'UBI', 'UBIFS'],
  'linux-driver-23-ethernet-mac-phy-netdev.md': ['PHY', 'MAC', 'DMA ring', 'NAPI', 'net_device', 'socket'],
  'linux-driver-24-usb-host-device-otg.md': ['USB controller', 'USB PHY', 'VBUS', 'role', 'enumeration', 'class driver', 'gadget'],
  'linux-driver-25-v4l2-imx415-mipi-csi.md': ['sensor', 'MIPI CSI-2', 'V4L2 sub-device', 'media graph', 'videobuf2', 'video node'],
  'linux-driver-26-alsa-asoc-i2s-audio.md': ['codec', 'CPU DAI', 'DAI link', 'machine driver', 'DAPM', 'ALSA PCM'],
  'linux-driver-27-thermal-cpufreq-devfreq-pm.md': ['thermal sensor', 'thermal zone', 'trip point', 'cooling device', 'CPUFreq', 'Devfreq', 'runtime PM'],
  'linux-driver-28-reliability-performance-debug.md': ['现象', 'baseline', 'tracepoint', 'ftrace', 'perf', 'fault injection', 'watchdog', '发布门禁'],
};
const diagramMinimum = new Map([
  ['linux-driver-02-first-kernel-module-and-char-device.md', 2],
  ['linux-driver-14-linux-device-model-lifecycle.md', 3],
  ['linux-driver-01-platform-device-model-and-probe.md', 3],
  ['linux-driver-15-driver-memory-io-mapping.md', 3],
  ['linux-driver-03-misc-sysfs-procfs-debugfs.md', 2],
  ['linux-driver-06-timers-workqueues-delayed-work.md', 2],
  ['linux-driver-07-kernel-synchronization-primitives.md', 2],
  ['linux-driver-13-driver-debugging-methodology.md', 3],
  ['linux-driver-16-pinctrl-gpio-irq-subsystem.md', 3],
  ['linux-driver-04-gpio-led-subsystem.md', 2],
  ['linux-driver-05-keys-interrupt-input-subsystem.md', 2],
  ['linux-driver-17-clock-reset-regulator-power-sequence.md', 3],
  ['linux-driver-08-i2c-regmap-sensor-driver.md', 3],
  ['linux-driver-09-spi-driver-transfers.md', 3],
  ['linux-driver-10-uart-tty-console-driver.md', 3],
  ['linux-driver-11-pwm-adc-watchdog.md', 3],
  ['linux-driver-12-dma-cache-coherency.md', 4],
  ['linux-driver-18-iommu-dma-address-translation.md', 3],
  ['linux-driver-19-firmware-remoteproc-rpmsg.md', 3],
  ['linux-driver-20-rtc-nvmem-eeprom-efuse.md', 2],
  ['linux-driver-21-block-storage-emmc-sd.md', 3],
  ['linux-driver-22-mtd-ubi-nor-nand.md', 3],
  ['linux-driver-23-ethernet-mac-phy-netdev.md', 3],
  ['linux-driver-24-usb-host-device-otg.md', 3],
  ['linux-driver-25-v4l2-imx415-mipi-csi.md', 4],
  ['linux-driver-26-alsa-asoc-i2s-audio.md', 4],
  ['linux-driver-27-thermal-cpufreq-devfreq-pm.md', 3],
  ['linux-driver-28-reliability-performance-debug.md', 4],
]);
const officialSourcePattern = /https:\/\/(?:docs\.kernel\.org|www\.kernel\.org|git\.kernel\.org|github\.com\/torvalds\/linux|devicetree-specification\.readthedocs\.io)/gi;

function bodyOf(file) {
  return readFileSync(join(articleDir, file), 'utf8')
    .replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
}

test('Linux driver keeps every historical canonical filename', () => {
  const actual = readdirSync(articleDir)
    .filter((file) => /^linux-driver-\d{2}-.*\.md$/.test(file))
    .sort();
  assert.deepEqual(actual, learningPath.map(([file]) => file).sort());
});

test('Linux driver frontmatter and title follow the new learning order', () => {
  for (const [file, order, topic] of learningPath) {
    const markdown = readFileSync(join(articleDir, file), 'utf8');
    assert.match(markdown, /^series: linux-driver$/m);
    assert.match(markdown, new RegExp(`^order: ${order}$`, 'm'));
    assert.match(markdown, new RegExp(`^title: .*#${String(order).padStart(2, '0')}.*${topic}`, 'mi'));
    assert.match(markdown, /^draft: false$/m);
  }
});

test('Framework uses valid Mermaid and lists articles in display order', () => {
  const framework = readFileSync(join(articleDir, 'linux-driver-framework.md'), 'utf8');
  assert.match(framework, /^```mermaid$/m);
  assert.doesNotMatch(framework, /^`mermaid$/m);

  let previous = -1;
  for (const [file] of learningPath) {
    const current = framework.indexOf(file);
    assert.ok(current > previous, `${file} must appear in Framework display order`);
    previous = current;
  }
});

test('rewritten articles no longer use the shared five-step template', () => {
  for (const file of qualityContractFiles) {
    const body = bodyOf(file);
    const prose = body.replace(/```[\s\S]*?```/g, '');
    const stepHeadings = prose.match(/^## .*第[一二三四]步/gm) ?? [];
    assert.ok(stepHeadings.length < 4, `${file} still uses the shared four-step H2 template`);
    assert.doesNotMatch(prose, /^# /m, `${file} must not repeat its title as H1`);
    assert.doesNotMatch(prose, /TBD|TODO|初学者扩展讲解/);
    assert.ok((body.match(officialSourcePattern) ?? []).length >= 2, `${file} needs two official primary sources`);
    assert.ok((body.match(/```mermaid\r?\n/g) ?? []).length >= diagramMinimum.get(file), `${file} needs its required diagrams`);
  }
});

test('rewritten foundation articles introduce concepts in dependency order', () => {
  for (const [file, topics] of Object.entries(introOrder)) {
    const body = bodyOf(file);
    let previous = -1;
    for (const topic of topics) {
      const current = body.indexOf(topic);
      assert.ok(current > previous, `${file} must introduce ${topic} after its prerequisites`);
      previous = current;
    }
  }
});

test('DMA and IOMMU articles preserve official API boundaries', () => {
  const dma = bodyOf('linux-driver-12-dma-cache-coherency.md');
  assert.match(dma, /DMA mapping API[\s\S]+DMAengine[\s\S]+不同/);
  assert.match(dma, /coherent[\s\S]+不(?:代表|保证)[\s\S]+有序/i);
  assert.doesNotMatch(dma, /可直接复用内核栈内存/);

  const iommu = bodyOf('linux-driver-18-iommu-dma-address-translation.md');
  assert.match(iommu, /关闭 IOMMU[\s\S]+内存破坏/);
  assert.match(iommu, /dma-buf[\s\S]+attachment[\s\S]+dma_fence/i);
});

test('integration guides link to the dedicated deep-dive series', () => {
  const usb = bodyOf('linux-driver-24-usb-host-device-otg.md');
  const video = bodyOf('linux-driver-25-v4l2-imx415-mipi-csi.md');
  const audio = bodyOf('linux-driver-26-alsa-asoc-i2s-audio.md');

  assert.match(usb, /\]\(\.\.\/\.\.\/usb\/\)/);
  assert.match(video, /\]\(\.\.\/\.\.\/video-audio\/\)/);
  assert.match(audio, /\]\(\.\.\/\.\.\/video-audio\/\)/);
});

export { learningPath };
