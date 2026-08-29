import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

export const usbFiles = [
  'usb-01-topology-speed-transfers.md',
  'usb-02-enumeration-state-machine.md',
  'usb-03-descriptor-hierarchy.md',
  'usb-04-linux-usb-subsystem-architecture.md',
  'usb-05-core-objects-interface-altsetting-endpoint.md',
  'usb-06-core-api-pipes-dma.md',
  'usb-07-urb-lifecycle-concurrency.md',
  'usb-08-interface-driver-lifecycle-pm.md',
  'usb-09-hid-keyboard-mouse-input.md',
  'usb-10-vendor-bulk-character-driver.md',
  'usb-11-class-drivers-hid-msc-cdc-uvc-uac.md',
  'usb-12-gadget-composite-configfs-functionfs.md',
  'usb-13-host-controller-dwc3-xhci-devicetree.md',
  'usb-14-debugging-usbmon-cherryusb.md',
];

export const usbLegacyRedirects = {
  'usb-01-usb-architecture-enumeration': 'usb-01-topology-speed-transfers',
  'usb-02-linux-usb-driver-framework': 'usb-04-linux-usb-subsystem-architecture',
  'usb-03-usb-descriptors-deep-dive': 'usb-03-descriptor-hierarchy',
  'usb-04-urb-and-data-transfer': 'usb-07-urb-lifecycle-concurrency',
  'usb-05-usb-device-driver-practice': 'usb-10-vendor-bulk-character-driver',
  'usb-06-usb-gadget-intro': 'usb-12-gadget-composite-configfs-functionfs',
  'usb-07-usb-class-drivers': 'usb-11-class-drivers-hid-msc-cdc-uvc-uac',
  'usb-08-usb-troubleshooting': 'usb-14-debugging-usbmon-cherryusb',
  'usb-09-usb-host-controller-device-tree-bring-up': 'usb-13-host-controller-dwc3-xhci-devicetree',
  'usb-10-mcu-usb-cherryusb-stack': 'usb-14-debugging-usbmon-cherryusb',
};

const topicMarkers = [
  ['usb_calc_bus_time', 'usb_maxpacket', 'usb_endpoint_xfer_bulk', 'split transaction'],
  ['hub_event', 'hub_port_connect', 'usb_new_device', 'usb_set_configuration'],
  ['wTotalLength', 'usb_host_config', 'usb_host_interface', 'usb_get_extra_descriptor'],
  ['usb_bus_type', 'usb_hcd', 'usb_device', 'usb_interface'],
  ['usb_host_endpoint', 'usb_device_id', 'Alternate Setting', 'usb_driver_claim_interface'],
  ['usb_find_common_endpoints', 'usb_rcvbulkpipe', 'usb_alloc_coherent', 'GFP_ATOMIC'],
  ['usb_submit_urb', 'usb_anchor_urb', 'usb_unlink_urb', 'usb_kill_urb'],
  ['pre_reset', 'post_reset', 'autosuspend', 'kref'],
  ['Boot Protocol', 'input_dev', 'usb_to_input_id', 'Interrupt IN'],
  ['usb_register_dev', 'wait_queue', 'O_NONBLOCK', 'disconnect'],
  ['usbhid', 'usb-storage', 'cdc_acm', 'uvcvideo', 'snd-usb-audio'],
  ['usb_request', 'usb_configuration', 'FunctionFS', 'set_alt'],
  ['usb_create_hcd', 'usb_add_hcd', 'xHCI', 'DWC3', 'usb-role-switch'],
  ['usbmon', 'dynamic_debug', 'IOMMU fault', 'CherryUSB'],
];

const officialSourcePattern = /https:\/\/(?:docs\.kernel\.org|www\.kernel\.org|git\.kernel\.org|www\.usb\.org|usb\.org|github\.com\/cherry-embedded\/CherryUSB)/g;
const forbiddenTemplatePattern = /初学者扩展讲解|面向初学者的阅读方法|推荐的验证闭环|为了凑足|TBD|TODO|待补/;

function articleBody(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/, '');
}

test('USB reference rewrite publishes the approved 14-article sequence', () => {
  usbFiles.forEach((file, index) => {
    const path = join('docs/articles/usb', file);
    assert.ok(existsSync(path), `${path} must exist`);
    const markdown = readFileSync(path, 'utf8');
    const body = articleBody(markdown);

    assert.match(markdown, /^series: usb$/m);
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

test('USB legacy slugs redirect to one canonical rewritten article', () => {
  const routePath = 'src/pages/usb/[...legacy].astro';
  assert.ok(existsSync(routePath), `${routePath} must exist`);
  const source = readFileSync(routePath, 'utf8');

  for (const [legacy, canonical] of Object.entries(usbLegacyRedirects)) {
    assert.match(source, new RegExp(`['\"]${legacy}['\"]\\s*:\\s*['\"]${canonical}['\"]`));
  }
  assert.match(source, /http-equiv="refresh"/);
  assert.match(source, /rel="canonical"/);
  assert.match(source, /location\.replace/);
});

test('USB teaching modules expose the documented Linux 6.12 lifecycle', () => {
  const sourceDir = 'docs/articles/usb/src/linux-6.12';
  const contracts = {
    'usb_example_common.h': ['enum usb_example_state', 'usb_find_common_endpoints', 'usb_endpoint_maxp'],
    'usb_hid_boot.c': ['usb_to_input_id', 'input_register_device', 'usb_alloc_coherent', 'usb_submit_urb', 'usb_kill_urb'],
    'usb_bulk_char.c': ['usb_register_dev', 'kref', 'wait_queue_head_t', 'poll_wait', 'usb_anchor_urb', 'usb_autopm_get_interface'],
    Makefile: ['obj-m += usb_hid_boot.o', 'obj-m += usb_bulk_char.o'],
  };

  for (const [file, markers] of Object.entries(contracts)) {
    const path = join(sourceDir, file);
    assert.ok(existsSync(path), `${path} must exist`);
    const source = readFileSync(path, 'utf8');
    for (const marker of markers) assert.ok(source.includes(marker), `${file} is missing ${marker}`);
    assert.doesNotMatch(source, /TODO|TBD|placeholder/i);
  }
});
