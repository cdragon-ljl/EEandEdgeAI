import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const articleContracts = {
  usb: [
    ['usb-01-usb-architecture-enumeration.md', ['SET_ADDRESS', 'GET_DESCRIPTOR', 'usb_new_device']],
    ['usb-02-linux-usb-driver-framework.md', ['struct usb_driver', 'usb_register_driver', 'disconnect']],
    ['usb-03-usb-descriptors-deep-dive.md', ['bLength', 'IAD', 'BOS']],
    ['usb-04-urb-and-data-transfer.md', ['usb_submit_urb', 'usb_kill_urb', 'URB_SHORT_NOT_OK']],
    ['usb-05-usb-device-driver-practice.md', ['usb_find_common_endpoints', 'kref', 'usb_anchor']],
    ['usb-06-usb-gadget-intro.md', ['configfs', 'usb_composite_probe', 'usb_function']],
    ['usb-07-usb-class-drivers.md', ['usbhid', 'usb-storage', 'cdc_acm', 'uvcvideo']],
    ['usb-08-usb-troubleshooting.md', ['usbmon', 'Wireshark', 'dynamic_debug']],
    ['usb-09-usb-host-controller-device-tree-bring-up.md', ['usb_add_hcd', 'generic-ehci', 'usb-role-switch']],
    ['usb-10-mcu-usb-cherryusb-stack.md', ['v1.6.1', 'c9625ffa773ad10b8824d1b5361bca2ccc1f3d1e', 'usbd_initialize', 'usbh_initialize', 'DCD', 'HCD', 'OSAL', 'CDC ACM', 'MSC', 'HID']],
  ],
  pcie: [
    ['pci-01-pcie-architecture-basics.md', ['Root Complex', 'LTSSM', 'TLP']],
    ['pci-02-pcie-enumeration-config-space.md', ['BDF', 'pci_scan_child_bus', 'Capability']],
    ['pci-03-bar-and-mmio.md', ['0xffffffff', 'pci_request_region', 'pci_iomap']],
    ['pci-04-linux-pci-driver-framework.md', ['pci_enable_device', 'dma_set_mask_and_coherent', 'pci_set_master']],
    ['pci-05-pcie-interrupts-msi-msix.md', ['pci_alloc_irq_vectors', 'MSI-X', 'irq_set_affinity_hint']],
    ['pci-06-pcie-dma-data-movement.md', ['dma_alloc_coherent', 'dma_map_single', 'dma_wmb']],
    ['pci-07-iommu-address-translation.md', ['IOVA', 'iommu_domain', 'SWIOTLB']],
    ['pci-08-pcie-device-driver-practice.md', ['probe', 'mmap', 'poll', 'reset']],
    ['pci-09-pcie-performance-stability.md', ['Max_Payload_Size', 'Max_Read_Request', 'AER']],
    ['pci-10-pcie-troubleshooting.md', ['PERST#', 'REFCLK', 'lspci -vv', 'IOMMU fault']],
    ['pci-11-pcie-endpoint-hardware-link-bring-up.md', ['Endpoint', 'BAR', 'address translation', 'LTSSM']],
    ['pci-12-pcie-dma-ring-msix-high-throughput.md', ['producer', 'consumer', 'doorbell', 'MSI-X']],
    ['usb-pcie-01-bus-model-comparison.md', ['Host', 'Root Complex', 'Endpoint', 'hotplug']],
    ['usb-pcie-02-driver-framework-comparison.md', ['usb_interface', 'URB', 'pci_dev', 'BAR']],
    ['usb-pcie-03-debug-tools-comparison.md', ['usbmon', 'lspci -vv', 'AER']],
    ['usb-pcie-04-interview-questions.md', ['错误答案', '证据链', 'DMA']],
  ],
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('USB and PCIe rewrites preserve publication contracts without appended templates', () => {
  for (const [series, contracts] of Object.entries(articleContracts)) {
    contracts.forEach(([file, markers], index) => {
      const path = join('docs/articles', series, file);
      assert.ok(existsSync(path), `${path} must exist`);
      const markdown = readFileSync(path, 'utf8');
      const frontmatter = markdown.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
      assert.ok(frontmatter, `${file} must have frontmatter`);
      assert.match(frontmatter[1], new RegExp(`^series: ${series}$`, 'm'));
      assert.match(frontmatter[1], new RegExp(`^order: ${index + 1}$`, 'm'));
      assert.match(frontmatter[1], /^draft: false$/m);

      const body = markdown.slice(frontmatter[0].length);
      assert.doesNotMatch(body, /^# /m, `${file} must not repeat its title as H1`);
      assert.doesNotMatch(body, /初学者扩展讲解/);
      const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      assert.match(headings.at(-1) ?? '', /小结|总结|结语/, `${file} must end at its conclusion`);
      for (const marker of markers) assert.match(body, new RegExp(escapeRegex(marker), 'i'), `${file} is missing ${marker}`);
    });
  }
});

test('the new MCU USB guide is pinned to official CherryUSB sources', () => {
  const markdown = readFileSync('docs/articles/usb/usb-10-mcu-usb-cherryusb-stack.md', 'utf8');
  assert.match(markdown, /github\.com\/cherry-embedded\/CherryUSB\/tree\/v1\.6\.1/);
  assert.match(markdown, /core[\s\S]+class[\s\S]+port[\s\S]+osal/i);
  assert.doesNotMatch(markdown, /github\.com\/cherry-embedded\/CherryUSB\/blob\/master/);
});
