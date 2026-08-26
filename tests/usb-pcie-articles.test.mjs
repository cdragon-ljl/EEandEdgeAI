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


test('USB articles use one numbered H2 heading style across the complete series', () => {
  for (const [file] of articleContracts.usb) {
    const markdown = readFileSync(join('docs/articles/usb', file), 'utf8');
    const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

    assert.ok(headings.length > 0, `${file} must have H2 headings`);
    for (const heading of headings) {
      assert.match(heading, /^[一二三四五六七八九十百]+、/, `${file} has an inconsistent H2 heading: ${heading}`);
    }
  }
});

const depthContracts = {
  'docs/articles/usb/usb-01-usb-architecture-enumeration.md': ['bmRequestType', 'wValue', 'hub_port_connect', 'usb_new_device', 'usb_set_configuration', 'bMaxPacketSize0', '-EPROTO', 'usbmon'],
  'docs/articles/usb/usb-02-linux-usb-driver-framework.md': ['usb_hcd', 'usbcore', 'usb_register_driver', 'usb_set_intfdata', 'usb_driver_claim_interface', 'usb_kill_anchored_urbs', 'kref', 'runtime PM'],
  'docs/articles/usb/usb-03-usb-descriptors-deep-dive.md': ['struct usb_device_descriptor', 'wTotalLength', 'usb_host_config', 'usb_host_interface', 'usb_endpoint_descriptor', 'IAD', 'BOS', 'usb_get_extra_descriptor', 'Alternate Setting'],
  'docs/articles/usb/usb-04-urb-and-data-transfer.md': ['struct urb', 'usb_alloc_urb', 'usb_fill_bulk_urb', 'usb_submit_urb', 'URB_SHORT_NOT_OK', 'URB_ZERO_PACKET', 'usb_unlink_urb', 'usb_kill_urb', 'usb_anchor', 'iso_frame_desc', 'usb_control_msg'],
  'docs/articles/usb/usb-05-usb-device-driver-practice.md': ['usb_find_common_endpoints', 'usb_register_dev', 'usb_anchor', 'kref', 'wait_queue', 'poll', 'O_NONBLOCK', 'copy_to_user', 'usb_kill_anchored_urbs', 'autosuspend'],
  'docs/articles/usb/usb-06-usb-gadget-intro.md': ['usb_gadget', 'usb_ep_queue', 'usb_composite_driver', 'usb_composite_probe', 'usb_configuration', 'usb_function', 'configfs', 'FunctionFS', 'SET_CONFIGURATION', 'set_alt', 'disable', 'UDC'],
  'docs/articles/usb/usb-07-usb-class-drivers.md': ['usbhid', 'Report Descriptor', 'usb-storage', 'CBW', 'CSW', 'UAS', 'cdc_acm', 'Union Functional', 'uvcvideo', 'Probe/Commit', 'snd-usb-audio', 'feedback endpoint'],
  'docs/articles/usb/usb-08-usb-troubleshooting.md': ['-EPROTO', '-ETIMEDOUT', 'usbmon', 'Wireshark', 'dynamic_debug', 'tracepoint', 'URB', 'autosuspend', 'KASAN', 'IOMMU'],
  'docs/articles/usb/usb-09-usb-host-controller-device-tree-bring-up.md': ['usb_create_hcd', 'usb_add_hcd', 'root hub', 'generic-ehci', 'xHCI', 'DWC2', 'DWC3', 'vbus-supply', 'usb-role-switch', 'dr_mode', 'PHY'],
  'docs/articles/usb/usb-10-mcu-usb-cherryusb-stack.md': ['core', 'class', 'port', 'OSAL', 'DCD', 'HCD', 'usb_dc_init', 'usbd_ep_start_write', 'usbh_submit_urb', 'CLASS_INFO_DEFINE', 'usbd_initialize', 'usbh_initialize', 'cache'],
  'docs/articles/pcie/pci-01-pcie-architecture-basics.md': ['Root Complex', 'LTSSM', 'TLP', 'DLLP', 'LCRC', 'Replay', 'credit', 'Completion', 'ordering', 'AER'],
  'docs/articles/pcie/pci-02-pcie-enumeration-config-space.md': ['BDF', 'Type 0', 'Type 1', 'pci_scan_child_bus', 'pci_bus_read_config', 'BAR', 'Capability', 'Extended Capability', 'bridge window', 'hotplug'],
  'docs/articles/pcie/pci-03-bar-and-mmio.md': ['0xffffffff', '64 位 BAR', 'prefetchable', 'resource tree', 'pci_request_region', 'pci_iomap', 'readl', 'writel', 'posted write', 'ATU'],
  'docs/articles/pcie/pci-04-linux-pci-driver-framework.md': ['struct pci_driver', 'pci_enable_device', 'pci_request_regions', 'dma_set_mask_and_coherent', 'pci_set_master', 'pci_iomap', 'pci_alloc_irq_vectors', 'managed API', 'runtime PM', 'AER'],
  'docs/articles/pcie/pci-05-pcie-interrupts-msi-msix.md': ['INTx', 'MSI', 'MSI-X', 'PBA', 'pci_alloc_irq_vectors', 'pci_irq_vector', 'request_threaded_irq', 'affinity', 'interrupt moderation', 'dma_rmb'],
  'docs/articles/pcie/pci-06-pcie-dma-data-movement.md': ['dma_set_mask_and_coherent', 'dma_alloc_coherent', 'dma_map_single', 'dma_map_sg', 'dma_sync_single_for_cpu', 'dma_wmb', 'dma_rmb', 'descriptor ring', 'ownership', 'IOMMU'],
  'docs/articles/pcie/pci-07-iommu-address-translation.md': ['IOVA', 'iommu_domain', 'IOMMU group', 'IOTLB', 'SWIOTLB', 'ATS', 'PRI', 'PASID', 'VFIO', 'fault'],
  'docs/articles/pcie/pci-08-pcie-device-driver-practice.md': ['probe', 'pci_set_drvdata', 'pci_iomap', 'DMA', 'MSI', 'ioctl', 'poll', 'mmap', 'reset', 'remove', 'generation'],
  'docs/articles/pcie/pci-09-pcie-performance-stability.md': ['LnkSta', 'Max_Payload_Size', 'Max_Read_Request', 'outstanding', 'credit', 'queue depth', 'interrupt moderation', 'NUMA', 'IOMMU', 'AER', 'P99'],
  'docs/articles/pcie/pci-10-pcie-troubleshooting.md': ['PERST#', 'REFCLK', 'LTSSM', 'Configuration Space', 'BAR', 'ATU', 'MSI-X', 'DMA', 'IOMMU fault', 'AER', 'FLR'],
  'docs/articles/pcie/pci-11-pcie-endpoint-hardware-link-bring-up.md': ['Endpoint', 'PERST#', 'REFCLK', 'LTSSM', 'Configuration Space', 'BAR', 'address translation', 'MSI-X', 'outbound DMA', 'Endpoint Framework'],
  'docs/articles/pcie/pci-12-pcie-dma-ring-msix-high-throughput.md': ['producer', 'consumer', 'phase bit', 'dma_alloc_coherent', 'dma_map_single', 'dma_wmb', 'dma_rmb', 'doorbell', 'MSI-X', 'NAPI', 'backpressure', 'generation'],
  'docs/articles/pcie/usb-pcie-01-bus-model-comparison.md': ['Host', 'Root Complex', 'Endpoint', 'descriptor', 'Configuration Space', 'URB', 'DMA', 'hotplug', 'error recovery'],
  'docs/articles/pcie/usb-pcie-02-driver-framework-comparison.md': ['usb_interface', 'pci_dev', 'probe', 'disconnect', 'remove', 'URB', 'DMA', 'runtime PM', 'reference count'],
  'docs/articles/pcie/usb-pcie-03-debug-tools-comparison.md': ['usbmon', 'Wireshark', 'lspci -vv', 'AER', 'IOMMU fault', 'dynamic_debug', 'tracepoint', 'protocol analyzer'],
  'docs/articles/pcie/usb-pcie-04-interview-questions.md': ['错误答案', '证据链', '枚举', 'URB', 'BAR', 'MSI-X', 'DMA', 'IOMMU', 'disconnect', 'reset'],
};

test('every USB and PCIe article closes its own technical knowledge map', () => {
  for (const [path, markers] of Object.entries(depthContracts)) {
    const markdown = readFileSync(path, 'utf8');
    const body = markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
    for (const marker of markers) {
      assert.match(body, new RegExp(escapeRegex(marker), 'i'), `${path} is missing depth topic: ${marker}`);
    }
    assert.doesNotMatch(body, /初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环/);
  }
});
test('the new MCU USB guide is pinned to official CherryUSB sources', () => {
  const markdown = readFileSync('docs/articles/usb/usb-10-mcu-usb-cherryusb-stack.md', 'utf8');
  assert.match(markdown, /github\.com\/cherry-embedded\/CherryUSB\/tree\/v1\.6\.1/);
  assert.match(markdown, /core[\s\S]+class[\s\S]+port[\s\S]+osal/i);
  assert.doesNotMatch(markdown, /github\.com\/cherry-embedded\/CherryUSB\/blob\/master/);
});
