/* SPDX-License-Identifier: GPL-2.0 */
#ifndef USB_EXAMPLE_COMMON_H
#define USB_EXAMPLE_COMMON_H

#include <linux/errno.h>
#include <linux/usb.h>

enum usb_example_state {
	USB_EXAMPLE_PROBING = 0,
	USB_EXAMPLE_READY,
	USB_EXAMPLE_RUNNING,
	USB_EXAMPLE_SUSPENDED,
	USB_EXAMPLE_DISCONNECTED,
};

struct usb_example_endpoints {
	struct usb_endpoint_descriptor *bulk_in;
	struct usb_endpoint_descriptor *bulk_out;
	struct usb_endpoint_descriptor *int_in;
	struct usb_endpoint_descriptor *int_out;
};

static inline int
usb_example_find_endpoints(struct usb_interface *intf,
			   struct usb_example_endpoints *eps)
{
	struct usb_host_interface *alt = intf->cur_altsetting;
	int ret;

	memset(eps, 0, sizeof(*eps));
	ret = usb_find_common_endpoints(alt, &eps->bulk_in, NULL, NULL, NULL);
	if (ret && ret != -ENXIO)
		return ret;
	ret = usb_find_common_endpoints(alt, NULL, &eps->bulk_out, NULL, NULL);
	if (ret && ret != -ENXIO)
		return ret;
	ret = usb_find_common_endpoints(alt, NULL, NULL, &eps->int_in, NULL);
	if (ret && ret != -ENXIO)
		return ret;
	ret = usb_find_common_endpoints(alt, NULL, NULL, NULL, &eps->int_out);
	if (ret && ret != -ENXIO)
		return ret;

	if (eps->bulk_in && !usb_endpoint_maxp(eps->bulk_in))
		return -EINVAL;
	if (eps->bulk_out && !usb_endpoint_maxp(eps->bulk_out))
		return -EINVAL;
	if (eps->int_in && !usb_endpoint_maxp(eps->int_in))
		return -EINVAL;
	if (eps->int_out && !usb_endpoint_maxp(eps->int_out))
		return -EINVAL;

	return 0;
}

#endif
