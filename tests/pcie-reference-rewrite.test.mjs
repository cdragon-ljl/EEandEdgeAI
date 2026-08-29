import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

export const pcieFiles = [
  'pci-01-topology-link-tlp.md',
  'pci-02-enumeration-config-space.md',
  'pci-03-bar-resource-atu-mmio.md',
  'pci-04-linux-pci-core-bus-dev-ops.md',
  'pci-05-pci-driver-lifecycle-api.md',
  'pci-06-pci-explorer-capability-bar-sysfs.md',
  'pci-07-intx-msi-msix-threaded-irq.md',
  'pci-08-dma-api-memory-order.md',
  'pci-09-dma-descriptor-ring.md',
  'pci-10-iommu-swiotlb-ats-pasid-sva.md',
  'pci-11-power-aspm-clkreq-runtime-pm.md',
  'pci-12-aer-flr-hot-reset-recovery.md',
  'pci-13-performance-tlp-mps-mrrs-credit.md',
  'pci-14-network-driver-ring-napi-msix.md',
  'pci-15-rc-ep-hardware-link-bring-up.md',
  'pci-16-linux-pci-endpoint-framework.md',
  'pci-17-multiqueue-dma-msix-throughput.md',
  'pci-18-system-debug-lspci-aer-iommu.md',
  'pci-19-usb-pcie-bus-model-comparison.md',
  'pci-20-usb-pcie-driver-framework-comparison.md',
  'pci-21-usb-pcie-debug-evidence-comparison.md',
  'pci-22-usb-pcie-interview-design.md',
];

export const pcieLegacyRedirects = {
  'pci-01-pcie-architecture-basics': 'pci-01-topology-link-tlp',
  'pci-02-pcie-enumeration-config-space': 'pci-02-enumeration-config-space',
  'pci-03-bar-and-mmio': 'pci-03-bar-resource-atu-mmio',
  'pci-04-linux-pci-driver-framework': 'pci-05-pci-driver-lifecycle-api',
  'pci-05-pcie-interrupts-msi-msix': 'pci-07-intx-msi-msix-threaded-irq',
  'pci-06-pcie-dma-data-movement': 'pci-08-dma-api-memory-order',
  'pci-07-iommu-address-translation': 'pci-10-iommu-swiotlb-ats-pasid-sva',
  'pci-08-pcie-device-driver-practice': 'pci-06-pci-explorer-capability-bar-sysfs',
  'pci-09-pcie-performance-stability': 'pci-13-performance-tlp-mps-mrrs-credit',
  'pci-10-pcie-troubleshooting': 'pci-18-system-debug-lspci-aer-iommu',
  'pci-11-pcie-endpoint-hardware-link-bring-up': 'pci-15-rc-ep-hardware-link-bring-up',
  'pci-12-pcie-dma-ring-msix-high-throughput': 'pci-17-multiqueue-dma-msix-throughput',
};

const topicMarkers = [
  ['Root Complex', 'LTSSM', 'TLP', 'credit'],
  ['BDF', 'pci_scan_child_bus', 'Type 0', 'Extended Capability'],
  ['pci_request_regions', 'pci_iomap', 'posted write', 'ATU'],
  ['pci_bus', 'pci_dev', 'pci_ops', 'pci_bus_read_config'],
  ['pci_register_driver', 'pci_enable_device_mem', 'pci_restore_state', 'pci_set_drvdata'],
  ['pci_cfg_access_lock', 'sysfs', 'capability', 'BAR'],
  ['INTx', 'MSI-X', 'pci_alloc_irq_vectors', 'request_threaded_irq'],
  ['dma_set_mask_and_coherent', 'dma_map_sg', 'dma_wmb', 'ownership'],
  ['producer', 'consumer', 'phase bit', 'generation'],
  ['IOMMU group', 'SWIOTLB', 'ATS', 'PRI', 'PASID', 'SVA'],
  ['D3hot', 'ASPM', 'CLKREQ#', 'runtime PM'],
  ['pci_error_handlers', 'error_detected', 'FLR', 'secondary bus reset'],
  ['MPS', 'MRRS', 'credit', 'P99'],
  ['NAPI', 'skb', 'MSI-X', 'descriptor ring'],
  ['PERST#', 'REFCLK', 'LTSSM', 'address translation'],
  ['pci_epc_set_bar', 'configfs', 'MSI-X', 'unbind'],
  ['multi-queue', 'doorbell', 'backpressure', 'generation'],
  ['lspci -vv', 'AER', 'IOMMU fault', 'FLR'],
  ['Host', 'Root Complex', 'URB', 'DMA'],
  ['usb_interface', 'pci_dev', 'disconnect', 'remove'],
  ['usbmon', 'lspci -vv', 'protocol analyzer', '证据'],
  ['错误答案', '证据链', 'MSI-X', 'IOMMU'],
];

const officialSourcePattern = /https:\/\/(?:docs\.kernel\.org|www\.kernel\.org|git\.kernel\.org|www\.pcisig\.com|pcisig\.com)/g;
const forbiddenTemplatePattern = /初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环|为了凑足|TBD|TODO|待补/;

function articleBody(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
}

test('PCIe reference rewrite publishes the approved 22-article sequence', () => {
  pcieFiles.forEach((file, index) => {
    const path = join('docs/articles/pcie', file);
    assert.ok(existsSync(path), `${path} must exist`);
    const markdown = readFileSync(path, 'utf8');
    const body = articleBody(markdown);

    assert.match(markdown, /^series: pcie$/m);
    assert.match(markdown, new RegExp(`^order: ${index + 1}$`, 'm'));
    assert.match(markdown, /^draft: false$/m);
    assert.match(markdown, new RegExp(`title: .*#${String(index + 1).padStart(2, '0')}`));
    assert.match(body, /Linux 6\.12/);
    assert.ok(markdown.split(/\r?\n/).length >= 300, `${file} must contain at least 300 lines`);
    assert.ok((body.match(/^```mermaid$/gm) ?? []).length >= 5, `${file} must contain at least five Mermaid diagrams`);
    assert.ok((body.match(officialSourcePattern) ?? []).length >= 2, `${file} must cite at least two official primary sources`);
    assert.doesNotMatch(body, forbiddenTemplatePattern);
    assert.match([...body.matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? '', /小结|总结|结语/);

    for (const marker of topicMarkers[index]) {
      assert.ok(body.toLowerCase().includes(marker.toLowerCase()), `${file} is missing ${marker}`);
    }
  });
});

test('PCIe legacy slugs redirect to one canonical rewritten article', () => {
  const routePath = 'src/pages/pcie/[...legacy].astro';
  assert.ok(existsSync(routePath), `${routePath} must exist`);
  const source = readFileSync(routePath, 'utf8');

  for (const [legacy, canonical] of Object.entries(pcieLegacyRedirects)) {
    assert.match(source, new RegExp(`['\"]${legacy}['\"]\\s*:\\s*['\"]${canonical}['\"]`));
  }
  assert.match(source, /http-equiv="refresh"/);
  assert.match(source, /rel="canonical"/);
  assert.match(source, /location\.replace/);
});

