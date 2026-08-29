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

  const expected = {
    'usb-01-usb-architecture-enumeration': '/usb/usb-01-topology-speed-transfers/',
    'usb-10-mcu-usb-cherryusb-stack': '/usb/usb-14-debugging-usbmon-cherryusb/',
    'pci-01-pcie-architecture-basics': '/pcie/pci-01-topology-link-tlp/',
    'pci-12-pcie-dma-ring-msix-high-throughput': '/pcie/pci-17-multiqueue-dma-msix-throughput/',
    'usb-pcie-01-bus-model-comparison': '/pcie/pci-19-usb-pcie-bus-model-comparison/',
    'usb-pcie-02-driver-framework-comparison': '/pcie/pci-20-usb-pcie-driver-framework-comparison/',
    'usb-pcie-03-debug-tools-comparison': '/pcie/pci-21-usb-pcie-debug-evidence-comparison/',
    'usb-pcie-04-interview-questions': '/pcie/pci-22-usb-pcie-interview-design/',
  };

  assert.match(source, /getStaticPaths/);
  for (const [legacy, target] of Object.entries(expected)) {
    assert.ok(source.includes(`'${legacy}': '${target}'`), `${legacy} must redirect to ${target}`);
  }
  assert.match(source, /Object\.entries\(redirects\)/);
  assert.equal((source.match(/^\s+'(?:usb|pci|usb-pcie)-/gm) ?? []).length, 26);
  assert.match(source, /location\.replace/);
  assert.match(source, /rel="canonical"/);
});
