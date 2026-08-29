// SPDX-License-Identifier: GPL-2.0
/*
 * Teaching-only USB HID Boot keyboard/mouse driver for Linux 6.12.
 * A target interface must be unbound from usbhid before this driver can bind.
 */

#include <linux/hid.h>
#include <linux/input.h>
#include <linux/module.h>
#include <linux/slab.h>
#include <linux/usb.h>
#include <linux/usb/input.h>

#include "usb_example_common.h"

#define USB_HID_REQ_SET_PROTOCOL	0x0b
#define USB_HID_BOOT_PROTOCOL	0
#define USB_BOOT_KEYBOARD_REPORT	8
#define USB_BOOT_MOUSE_REPORT	3

struct usb_hid_boot {
	struct usb_device *udev;
	struct usb_interface *intf;
	struct input_dev *input;
	struct urb *urb;
	unsigned char *report;
	dma_addr_t report_dma;
	size_t report_len;
	unsigned int pipe;
	unsigned int interval;
	unsigned int protocol;
	char phys[64];
	unsigned char old_report[USB_BOOT_KEYBOARD_REPORT];
	bool running;
	bool online;
};

static const unsigned short usb_hid_boot_keycode[256] = {
	[0x04] = KEY_A, [0x05] = KEY_B, [0x06] = KEY_C,
	[0x07] = KEY_D, [0x08] = KEY_E, [0x09] = KEY_F,
	[0x0a] = KEY_G, [0x0b] = KEY_H, [0x0c] = KEY_I,
	[0x0d] = KEY_J, [0x0e] = KEY_K, [0x0f] = KEY_L,
	[0x10] = KEY_M, [0x11] = KEY_N, [0x12] = KEY_O,
	[0x13] = KEY_P, [0x14] = KEY_Q, [0x15] = KEY_R,
	[0x16] = KEY_S, [0x17] = KEY_T, [0x18] = KEY_U,
	[0x19] = KEY_V, [0x1a] = KEY_W, [0x1b] = KEY_X,
	[0x1c] = KEY_Y, [0x1d] = KEY_Z,
	[0x1e] = KEY_1, [0x1f] = KEY_2, [0x20] = KEY_3,
	[0x21] = KEY_4, [0x22] = KEY_5, [0x23] = KEY_6,
	[0x24] = KEY_7, [0x25] = KEY_8, [0x26] = KEY_9,
	[0x27] = KEY_0, [0x28] = KEY_ENTER, [0x29] = KEY_ESC,
	[0x2a] = KEY_BACKSPACE, [0x2b] = KEY_TAB,
	[0x2c] = KEY_SPACE, [0x2d] = KEY_MINUS,
	[0x2e] = KEY_EQUAL, [0x2f] = KEY_LEFTBRACE,
	[0x30] = KEY_RIGHTBRACE, [0x31] = KEY_BACKSLASH,
	[0x33] = KEY_SEMICOLON, [0x34] = KEY_APOSTROPHE,
	[0x35] = KEY_GRAVE, [0x36] = KEY_COMMA,
	[0x37] = KEY_DOT, [0x38] = KEY_SLASH,
	[0x39] = KEY_CAPSLOCK,
	[0x3a] = KEY_F1, [0x3b] = KEY_F2, [0x3c] = KEY_F3,
	[0x3d] = KEY_F4, [0x3e] = KEY_F5, [0x3f] = KEY_F6,
	[0x40] = KEY_F7, [0x41] = KEY_F8, [0x42] = KEY_F9,
	[0x43] = KEY_F10, [0x44] = KEY_F11, [0x45] = KEY_F12,
	[0x46] = KEY_SYSRQ, [0x47] = KEY_SCROLLLOCK,
	[0x48] = KEY_PAUSE, [0x49] = KEY_INSERT,
	[0x4a] = KEY_HOME, [0x4b] = KEY_PAGEUP,
	[0x4c] = KEY_DELETE, [0x4d] = KEY_END,
	[0x4e] = KEY_PAGEDOWN, [0x4f] = KEY_RIGHT,
	[0x50] = KEY_LEFT, [0x51] = KEY_DOWN, [0x52] = KEY_UP,
	[0x53] = KEY_NUMLOCK, [0x54] = KEY_KPSLASH,
	[0x55] = KEY_KPASTERISK, [0x56] = KEY_KPMINUS,
	[0x57] = KEY_KPPLUS, [0x58] = KEY_KPENTER,
	[0x59] = KEY_KP1, [0x5a] = KEY_KP2, [0x5b] = KEY_KP3,
	[0x5c] = KEY_KP4, [0x5d] = KEY_KP5, [0x5e] = KEY_KP6,
	[0x5f] = KEY_KP7, [0x60] = KEY_KP8, [0x61] = KEY_KP9,
	[0x62] = KEY_KP0, [0x63] = KEY_KPDOT,
};

static const unsigned short usb_hid_boot_modifiers[8] = {
	KEY_LEFTCTRL, KEY_LEFTSHIFT, KEY_LEFTALT, KEY_LEFTMETA,
	KEY_RIGHTCTRL, KEY_RIGHTSHIFT, KEY_RIGHTALT, KEY_RIGHTMETA,
};

static bool usb_hid_boot_contains(const unsigned char *keys,
				  unsigned char usage)
{
	int i;

	for (i = 2; i < USB_BOOT_KEYBOARD_REPORT; i++)
		if (keys[i] == usage)
			return true;
	return false;
}

static bool usb_hid_boot_rollover(const unsigned char *report)
{
	int i;

	for (i = 2; i < USB_BOOT_KEYBOARD_REPORT; i++)
		if (report[i] >= 1 && report[i] <= 3)
			return true;
	return false;
}

static void usb_hid_boot_keyboard(struct usb_hid_boot *boot,
				  const unsigned char *report)
{
	unsigned char changed = boot->old_report[0] ^ report[0];
	unsigned short code;
	int i;

	if (usb_hid_boot_rollover(report))
		return;

	for (i = 0; i < 8; i++)
		if (changed & BIT(i))
			input_report_key(boot->input,
					 usb_hid_boot_modifiers[i],
					 !!(report[0] & BIT(i)));

	for (i = 2; i < USB_BOOT_KEYBOARD_REPORT; i++) {
		unsigned char usage = boot->old_report[i];

		if (!usage || usb_hid_boot_contains(report, usage))
			continue;
		code = usb_hid_boot_keycode[usage];
		if (code)
			input_report_key(boot->input, code, 0);
	}

	for (i = 2; i < USB_BOOT_KEYBOARD_REPORT; i++) {
		unsigned char usage = report[i];

		if (!usage || usb_hid_boot_contains(boot->old_report, usage))
			continue;
		code = usb_hid_boot_keycode[usage];
		if (code)
			input_report_key(boot->input, code, 1);
	}

	memcpy(boot->old_report, report, USB_BOOT_KEYBOARD_REPORT);
	input_sync(boot->input);
}

static void usb_hid_boot_mouse(struct usb_hid_boot *boot,
			       const unsigned char *report)
{
	input_report_key(boot->input, BTN_LEFT, report[0] & BIT(0));
	input_report_key(boot->input, BTN_RIGHT, report[0] & BIT(1));
	input_report_key(boot->input, BTN_MIDDLE, report[0] & BIT(2));
	input_report_rel(boot->input, REL_X, (s8)report[1]);
	input_report_rel(boot->input, REL_Y, (s8)report[2]);
	if (boot->urb->actual_length >= 4)
		input_report_rel(boot->input, REL_WHEEL, (s8)report[3]);
	input_sync(boot->input);
}

static void usb_hid_boot_complete(struct urb *urb)
{
	struct usb_hid_boot *boot = urb->context;
	int ret;

	switch (urb->status) {
	case 0:
		if (boot->protocol == USB_INTERFACE_PROTOCOL_KEYBOARD) {
			if (urb->actual_length >= USB_BOOT_KEYBOARD_REPORT)
				usb_hid_boot_keyboard(boot, boot->report);
		} else if (urb->actual_length >= USB_BOOT_MOUSE_REPORT) {
			usb_hid_boot_mouse(boot, boot->report);
		}
		break;
	case -ENOENT:
	case -ECONNRESET:
	case -ESHUTDOWN:
		return;
	default:
		dev_dbg_ratelimited(&boot->intf->dev,
				    "interrupt status %d\n", urb->status);
		break;
	}

	if (!READ_ONCE(boot->running) || !READ_ONCE(boot->online))
		return;

	ret = usb_submit_urb(urb, GFP_ATOMIC);
	if (ret)
		dev_err_ratelimited(&boot->intf->dev,
				    "resubmit failed: %d\n", ret);
}

static int usb_hid_boot_open(struct input_dev *input)
{
	struct usb_hid_boot *boot = input_get_drvdata(input);
	int ret;

	if (!READ_ONCE(boot->online))
		return -ENODEV;

	ret = usb_autopm_get_interface(boot->intf);
	if (ret)
		return ret;

	WRITE_ONCE(boot->running, true);
	ret = usb_submit_urb(boot->urb, GFP_KERNEL);
	if (ret) {
		WRITE_ONCE(boot->running, false);
		usb_autopm_put_interface(boot->intf);
	}
	return ret;
}

static void usb_hid_boot_close(struct input_dev *input)
{
	struct usb_hid_boot *boot = input_get_drvdata(input);

	WRITE_ONCE(boot->running, false);
	usb_kill_urb(boot->urb);
	usb_autopm_put_interface(boot->intf);
}

static int usb_hid_boot_set_protocol(struct usb_hid_boot *boot)
{
	u8 ifnum = boot->intf->cur_altsetting->desc.bInterfaceNumber;

	return usb_control_msg(boot->udev, usb_sndctrlpipe(boot->udev, 0),
			       USB_HID_REQ_SET_PROTOCOL,
			       USB_DIR_OUT | USB_TYPE_CLASS | USB_RECIP_INTERFACE,
			       USB_HID_BOOT_PROTOCOL, ifnum, NULL, 0,
			       USB_CTRL_SET_TIMEOUT);
}

static int usb_hid_boot_probe(struct usb_interface *intf,
			      const struct usb_device_id *id)
{
	struct usb_host_interface *alt = intf->cur_altsetting;
	struct usb_example_endpoints eps;
	struct usb_hid_boot *boot;
	struct input_dev *input;
	size_t minimum;
	int ret;
	int i;

	(void)id;
	if (alt->desc.bInterfaceClass != USB_CLASS_HID ||
	    alt->desc.bInterfaceSubClass != 1 ||
	    (alt->desc.bInterfaceProtocol != USB_INTERFACE_PROTOCOL_KEYBOARD &&
	     alt->desc.bInterfaceProtocol != USB_INTERFACE_PROTOCOL_MOUSE))
		return -ENODEV;

	ret = usb_example_find_endpoints(intf, &eps);
	if (ret || !eps.int_in)
		return -ENODEV;

	minimum = alt->desc.bInterfaceProtocol == USB_INTERFACE_PROTOCOL_KEYBOARD ?
		  USB_BOOT_KEYBOARD_REPORT : USB_BOOT_MOUSE_REPORT;
	if (usb_endpoint_maxp(eps.int_in) < minimum)
		return -EINVAL;

	boot = kzalloc(sizeof(*boot), GFP_KERNEL);
	if (!boot)
		return -ENOMEM;

	boot->udev = usb_get_dev(interface_to_usbdev(intf));
	boot->intf = intf;
	boot->protocol = alt->desc.bInterfaceProtocol;
	boot->report_len = min_t(size_t, usb_endpoint_maxp(eps.int_in), 64);
	boot->pipe = usb_rcvintpipe(boot->udev,
				    usb_endpoint_num(eps.int_in));
	boot->interval = eps.int_in->bInterval;
	boot->online = true;

	boot->urb = usb_alloc_urb(0, GFP_KERNEL);
	if (!boot->urb) {
		ret = -ENOMEM;
		goto err_put_dev;
	}

	boot->report = usb_alloc_coherent(boot->udev, boot->report_len,
					  GFP_KERNEL, &boot->report_dma);
	if (!boot->report) {
		ret = -ENOMEM;
		goto err_free_urb;
	}

	input = input_allocate_device();
	if (!input) {
		ret = -ENOMEM;
		goto err_free_buffer;
	}
	boot->input = input;

	usb_make_path(boot->udev, boot->phys, sizeof(boot->phys));
	strlcat(boot->phys, "/input0", sizeof(boot->phys));
	input->name = boot->protocol == USB_INTERFACE_PROTOCOL_KEYBOARD ?
		      "USB Boot Keyboard Teaching Driver" :
		      "USB Boot Mouse Teaching Driver";
	input->phys = boot->phys;
	usb_to_input_id(boot->udev, &input->id);
	input->dev.parent = &intf->dev;
	input->open = usb_hid_boot_open;
	input->close = usb_hid_boot_close;
	input_set_drvdata(input, boot);

	if (boot->protocol == USB_INTERFACE_PROTOCOL_KEYBOARD) {
		__set_bit(EV_KEY, input->evbit);
		for (i = 0; i < ARRAY_SIZE(usb_hid_boot_keycode); i++)
			if (usb_hid_boot_keycode[i])
				__set_bit(usb_hid_boot_keycode[i], input->keybit);
		for (i = 0; i < ARRAY_SIZE(usb_hid_boot_modifiers); i++)
			__set_bit(usb_hid_boot_modifiers[i], input->keybit);
	} else {
		input_set_capability(input, EV_KEY, BTN_LEFT);
		input_set_capability(input, EV_KEY, BTN_RIGHT);
		input_set_capability(input, EV_KEY, BTN_MIDDLE);
		input_set_capability(input, EV_REL, REL_X);
		input_set_capability(input, EV_REL, REL_Y);
		input_set_capability(input, EV_REL, REL_WHEEL);
	}

	usb_fill_int_urb(boot->urb, boot->udev, boot->pipe,
			 boot->report, boot->report_len,
			 usb_hid_boot_complete, boot, boot->interval);
	boot->urb->transfer_dma = boot->report_dma;
	boot->urb->transfer_flags |= URB_NO_TRANSFER_DMA_MAP;

	ret = usb_hid_boot_set_protocol(boot);
	if (ret < 0)
		goto err_free_input;

	ret = input_register_device(input);
	if (ret)
		goto err_free_input;

	usb_set_intfdata(intf, boot);
	return 0;

err_free_input:
	input_free_device(input);
err_free_buffer:
	usb_free_coherent(boot->udev, boot->report_len,
			  boot->report, boot->report_dma);
err_free_urb:
	usb_free_urb(boot->urb);
err_put_dev:
	usb_put_dev(boot->udev);
	kfree(boot);
	return ret;
}

static void usb_hid_boot_disconnect(struct usb_interface *intf)
{
	struct usb_hid_boot *boot = usb_get_intfdata(intf);

	usb_set_intfdata(intf, NULL);
	if (!boot)
		return;

	WRITE_ONCE(boot->online, false);
	WRITE_ONCE(boot->running, false);
	usb_kill_urb(boot->urb);
	input_unregister_device(boot->input);
	usb_free_coherent(boot->udev, boot->report_len,
			  boot->report, boot->report_dma);
	usb_free_urb(boot->urb);
	usb_put_dev(boot->udev);
	kfree(boot);
}

static const struct usb_device_id usb_hid_boot_ids[] = {
	{ USB_INTERFACE_INFO(USB_CLASS_HID, 1,
			     USB_INTERFACE_PROTOCOL_KEYBOARD) },
	{ USB_INTERFACE_INFO(USB_CLASS_HID, 1,
			     USB_INTERFACE_PROTOCOL_MOUSE) },
	{ }
};
MODULE_DEVICE_TABLE(usb, usb_hid_boot_ids);

static struct usb_driver usb_hid_boot_driver = {
	.name = "usb_hid_boot",
	.probe = usb_hid_boot_probe,
	.disconnect = usb_hid_boot_disconnect,
	.id_table = usb_hid_boot_ids,
	.supports_autosuspend = 1,
};
module_usb_driver(usb_hid_boot_driver);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Teaching USB HID Boot keyboard/mouse input driver");
MODULE_LICENSE("GPL");
