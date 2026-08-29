// SPDX-License-Identifier: GPL-2.0
/*
 * Teaching-only asynchronous USB Bulk character driver for Linux 6.12.
 * The 0xffff:0xfffe ID is fictional; use a dynamic ID only with a compatible
 * lab device implementing one Bulk IN and one Bulk OUT endpoint.
 */

#include <linux/fs.h>
#include <linux/kfifo.h>
#include <linux/kref.h>
#include <linux/module.h>
#include <linux/mutex.h>
#include <linux/poll.h>
#include <linux/slab.h>
#include <linux/uaccess.h>
#include <linux/usb.h>

#include "usb_example_common.h"

#define USB_BULK_VENDOR_ID	0xffff
#define USB_BULK_PRODUCT_ID	0xfffe
#define USB_BULK_MINOR_BASE	192
#define USB_BULK_READ_SIZE	4096
#define USB_BULK_FIFO_SIZE	(64 * 1024)
#define USB_BULK_MAX_WRITE	(64 * 1024)
#define USB_BULK_MAX_WRITES	8

struct usb_bulk_char {
	struct usb_device *udev;
	struct usb_interface *intf;
	struct kref kref;
	struct mutex io_mutex;
	spinlock_t state_lock;
	wait_queue_head_t read_wait;
	wait_queue_head_t write_wait;
	struct kfifo read_fifo;
	struct urb *read_urb;
	unsigned char *read_buffer;
	dma_addr_t read_dma;
	size_t read_size;
	unsigned int bulk_in_pipe;
	unsigned int bulk_out_pipe;
	struct usb_anchor writes;
	atomic_t open_count;
	atomic_t writes_in_flight;
	int error;
	bool online;
	bool suspended;
	bool read_running;
};

struct usb_bulk_write_request {
	struct usb_bulk_char *dev;
};

static struct usb_driver usb_bulk_driver;

static void usb_bulk_delete(struct kref *ref)
{
	struct usb_bulk_char *dev = container_of(ref, struct usb_bulk_char,
						 kref);

	usb_free_coherent(dev->udev, dev->read_size,
			  dev->read_buffer, dev->read_dma);
	usb_free_urb(dev->read_urb);
	kfifo_free(&dev->read_fifo);
	usb_put_intf(dev->intf);
	usb_put_dev(dev->udev);
	kfree(dev);
}

static void usb_bulk_set_error(struct usb_bulk_char *dev, int error)
{
	unsigned long flags;

	spin_lock_irqsave(&dev->state_lock, flags);
	if (!dev->error)
		dev->error = error;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	wake_up_interruptible(&dev->read_wait);
}

static int usb_bulk_take_error(struct usb_bulk_char *dev)
{
	unsigned long flags;
	int error;

	spin_lock_irqsave(&dev->state_lock, flags);
	error = dev->error;
	dev->error = 0;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	return error;
}

static void usb_bulk_read_complete(struct urb *urb)
{
	struct usb_bulk_char *dev = urb->context;
	unsigned long flags;
	bool resubmit;
	int ret;

	if (!urb->status && urb->actual_length) {
		spin_lock_irqsave(&dev->state_lock, flags);
		if (kfifo_avail(&dev->read_fifo) >= urb->actual_length)
			kfifo_in(&dev->read_fifo, dev->read_buffer,
				 urb->actual_length);
		else if (!dev->error)
			dev->error = -ENOSPC;
		spin_unlock_irqrestore(&dev->state_lock, flags);
		wake_up_interruptible(&dev->read_wait);
	} else if (urb->status != -ENOENT &&
		   urb->status != -ECONNRESET &&
		   urb->status != -ESHUTDOWN) {
		usb_bulk_set_error(dev, urb->status);
	}

	spin_lock_irqsave(&dev->state_lock, flags);
	resubmit = dev->online && dev->read_running;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	if (!resubmit)
		return;

	ret = usb_submit_urb(urb, GFP_ATOMIC);
	if (ret) {
		spin_lock_irqsave(&dev->state_lock, flags);
		dev->read_running = false;
		spin_unlock_irqrestore(&dev->state_lock, flags);
		usb_bulk_set_error(dev, ret);
	}
}

static int usb_bulk_start_read_locked(struct usb_bulk_char *dev)
{
	unsigned long flags;
	int ret;

	spin_lock_irqsave(&dev->state_lock, flags);
	if (!dev->online || dev->suspended) {
		spin_unlock_irqrestore(&dev->state_lock, flags);
		return -ENODEV;
	}
	if (dev->read_running) {
		spin_unlock_irqrestore(&dev->state_lock, flags);
		return 0;
	}
	dev->read_running = true;
	spin_unlock_irqrestore(&dev->state_lock, flags);

	ret = usb_submit_urb(dev->read_urb, GFP_KERNEL);
	if (ret) {
		spin_lock_irqsave(&dev->state_lock, flags);
		dev->read_running = false;
		spin_unlock_irqrestore(&dev->state_lock, flags);
	}
	return ret;
}

static void usb_bulk_stop_read(struct usb_bulk_char *dev)
{
	unsigned long flags;

	spin_lock_irqsave(&dev->state_lock, flags);
	dev->read_running = false;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	usb_kill_urb(dev->read_urb);
}

static int usb_bulk_open(struct inode *inode, struct file *file)
{
	struct usb_interface *intf;
	struct usb_bulk_char *dev;
	int subminor = iminor(inode);
	int ret;

	intf = usb_find_interface(&usb_bulk_driver, subminor);
	if (!intf)
		return -ENODEV;
	dev = usb_get_intfdata(intf);
	if (!dev || !kref_get_unless_zero(&dev->kref))
		return -ENODEV;

	ret = usb_autopm_get_interface(intf);
	if (ret)
		goto err_put_ref;

	ret = mutex_lock_interruptible(&dev->io_mutex);
	if (ret)
		goto err_put_pm;
	if (!dev->online || dev->suspended) {
		ret = -ENODEV;
		goto err_unlock;
	}
	atomic_inc(&dev->open_count);
	ret = usb_bulk_start_read_locked(dev);
	if (ret)
		atomic_dec(&dev->open_count);
	else
		file->private_data = dev;

err_unlock:
	mutex_unlock(&dev->io_mutex);
	if (!ret)
		return 0;
err_put_pm:
	usb_autopm_put_interface(intf);
err_put_ref:
	kref_put(&dev->kref, usb_bulk_delete);
	return ret;
}

static int usb_bulk_release(struct inode *inode, struct file *file)
{
	struct usb_bulk_char *dev = file->private_data;
	bool last;

	(void)inode;
	if (!dev)
		return 0;

	mutex_lock(&dev->io_mutex);
	last = atomic_dec_and_test(&dev->open_count);
	if (last)
		usb_bulk_stop_read(dev);
	mutex_unlock(&dev->io_mutex);

	usb_autopm_put_interface(dev->intf);
	kref_put(&dev->kref, usb_bulk_delete);
	return 0;
}

static ssize_t usb_bulk_read(struct file *file, char __user *buffer,
			     size_t count, loff_t *ppos)
{
	struct usb_bulk_char *dev = file->private_data;
	unsigned char *temporary;
	unsigned int copied;
	size_t wanted;
	int error;
	int ret;

	(void)ppos;
	if (!count)
		return 0;
	wanted = min_t(size_t, count, USB_BULK_READ_SIZE);
	temporary = kmalloc(wanted, GFP_KERNEL);
	if (!temporary)
		return -ENOMEM;

	ret = mutex_lock_interruptible(&dev->io_mutex);
	if (ret)
		goto out_free;

	for (;;) {
		error = usb_bulk_take_error(dev);
		if (error) {
			ret = error;
			goto out_unlock;
		}
		if (!READ_ONCE(dev->online) && kfifo_is_empty(&dev->read_fifo)) {
			ret = -ENODEV;
			goto out_unlock;
		}

		copied = kfifo_out_spinlocked(&dev->read_fifo, temporary,
					      wanted, &dev->state_lock);
		if (copied)
			break;
		if (file->f_flags & O_NONBLOCK) {
			ret = -EAGAIN;
			goto out_unlock;
		}

		mutex_unlock(&dev->io_mutex);
		ret = wait_event_interruptible(dev->read_wait,
				!kfifo_is_empty(&dev->read_fifo) ||
				!READ_ONCE(dev->online) || READ_ONCE(dev->error));
		if (ret)
			goto out_free;
		ret = mutex_lock_interruptible(&dev->io_mutex);
		if (ret)
			goto out_free;
	}

	if (copy_to_user(buffer, temporary, copied))
		ret = -EFAULT;
	else
		ret = copied;

out_unlock:
	mutex_unlock(&dev->io_mutex);
out_free:
	kfree(temporary);
	return ret;
}

static void usb_bulk_write_complete(struct urb *urb)
{
	struct usb_bulk_write_request *request = urb->context;
	struct usb_bulk_char *dev = request->dev;

	if (urb->status && urb->status != -ENOENT &&
	    urb->status != -ECONNRESET && urb->status != -ESHUTDOWN)
		usb_bulk_set_error(dev, urb->status);

	atomic_dec(&dev->writes_in_flight);
	wake_up_interruptible(&dev->write_wait);
	kref_put(&dev->kref, usb_bulk_delete);
	kfree(request);
}

static ssize_t usb_bulk_write(struct file *file, const char __user *buffer,
			      size_t count, loff_t *ppos)
{
	struct usb_bulk_char *dev = file->private_data;
	struct usb_bulk_write_request *request;
	struct urb *urb;
	unsigned char *transfer;
	int ret;

	(void)ppos;
	if (!count)
		return 0;
	if (count > USB_BULK_MAX_WRITE)
		return -EMSGSIZE;

	while (atomic_read(&dev->writes_in_flight) >= USB_BULK_MAX_WRITES) {
		if (!READ_ONCE(dev->online))
			return -ENODEV;
		if (READ_ONCE(dev->suspended))
			return -EHOSTUNREACH;
		if (file->f_flags & O_NONBLOCK)
			return -EAGAIN;
		ret = wait_event_interruptible(dev->write_wait,
			atomic_read(&dev->writes_in_flight) < USB_BULK_MAX_WRITES ||
			!READ_ONCE(dev->online) || READ_ONCE(dev->suspended));
		if (ret)
			return ret;
	}
	if (!READ_ONCE(dev->online))
		return -ENODEV;
	if (READ_ONCE(dev->suspended))
		return -EHOSTUNREACH;

	request = kzalloc(sizeof(*request), GFP_KERNEL);
	urb = usb_alloc_urb(0, GFP_KERNEL);
	transfer = kmalloc(count, GFP_KERNEL);
	if (!request || !urb || !transfer) {
		ret = -ENOMEM;
		goto err_free;
	}
	if (copy_from_user(transfer, buffer, count)) {
		ret = -EFAULT;
		goto err_free;
	}

	ret = mutex_lock_interruptible(&dev->io_mutex);
	if (ret)
		goto err_free;
	if (!dev->online) {
		ret = -ENODEV;
		goto err_unlock_free;
	}
	if (dev->suspended) {
		ret = -EHOSTUNREACH;
		goto err_unlock_free;
	}

	request->dev = dev;
	usb_fill_bulk_urb(urb, dev->udev, dev->bulk_out_pipe,
			  transfer, count, usb_bulk_write_complete, request);
	urb->transfer_flags |= URB_FREE_BUFFER;
	kref_get(&dev->kref);
	atomic_inc(&dev->writes_in_flight);
	usb_anchor_urb(urb, &dev->writes);
	ret = usb_submit_urb(urb, GFP_KERNEL);
	if (ret) {
		usb_unanchor_urb(urb);
		atomic_dec(&dev->writes_in_flight);
		kref_put(&dev->kref, usb_bulk_delete);
		wake_up_interruptible(&dev->write_wait);
		mutex_unlock(&dev->io_mutex);
		kfree(request);
		usb_free_urb(urb);
		return ret;
	}

	mutex_unlock(&dev->io_mutex);
	usb_free_urb(urb);
	return count;

err_unlock_free:
	mutex_unlock(&dev->io_mutex);
err_free:
	kfree(transfer);
	usb_free_urb(urb);
	kfree(request);
	return ret;
}

static __poll_t usb_bulk_poll(struct file *file, poll_table *wait)
{
	struct usb_bulk_char *dev = file->private_data;
	unsigned long flags;
	__poll_t mask = 0;

	poll_wait(file, &dev->read_wait, wait);
	poll_wait(file, &dev->write_wait, wait);

	spin_lock_irqsave(&dev->state_lock, flags);
	if (!kfifo_is_empty(&dev->read_fifo))
		mask |= EPOLLIN | EPOLLRDNORM;
	if (dev->error)
		mask |= EPOLLERR;
	if (!dev->online)
		mask |= EPOLLHUP | EPOLLERR;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	if (READ_ONCE(dev->online) && !READ_ONCE(dev->suspended) &&
	    atomic_read(&dev->writes_in_flight) < USB_BULK_MAX_WRITES)
		mask |= EPOLLOUT | EPOLLWRNORM;
	return mask;
}

static const struct file_operations usb_bulk_fops = {
	.owner = THIS_MODULE,
	.open = usb_bulk_open,
	.release = usb_bulk_release,
	.read = usb_bulk_read,
	.write = usb_bulk_write,
	.poll = usb_bulk_poll,
	.llseek = noop_llseek,
};

static struct usb_class_driver usb_bulk_class = {
	.name = "usb/usb_bulk%d",
	.fops = &usb_bulk_fops,
	.minor_base = USB_BULK_MINOR_BASE,
};

static int usb_bulk_probe(struct usb_interface *intf,
			  const struct usb_device_id *id)
{
	struct usb_host_interface *alt = intf->cur_altsetting;
	struct usb_example_endpoints eps;
	struct usb_bulk_char *dev;
	int ret;

	(void)id;
	if (alt->desc.bInterfaceClass != USB_CLASS_VENDOR_SPEC)
		return -ENODEV;
	ret = usb_example_find_endpoints(intf, &eps);
	if (ret || !eps.bulk_in || !eps.bulk_out)
		return -ENODEV;

	dev = kzalloc(sizeof(*dev), GFP_KERNEL);
	if (!dev)
		return -ENOMEM;
	dev->udev = usb_get_dev(interface_to_usbdev(intf));
	dev->intf = usb_get_intf(intf);
	kref_init(&dev->kref);
	mutex_init(&dev->io_mutex);
	spin_lock_init(&dev->state_lock);
	init_waitqueue_head(&dev->read_wait);
	init_waitqueue_head(&dev->write_wait);
	init_usb_anchor(&dev->writes);
	atomic_set(&dev->open_count, 0);
	atomic_set(&dev->writes_in_flight, 0);
	dev->online = true;
	dev->suspended = false;
	dev->read_size = max_t(size_t, USB_BULK_READ_SIZE,
			       usb_endpoint_maxp(eps.bulk_in));
	dev->bulk_in_pipe = usb_rcvbulkpipe(dev->udev,
					    usb_endpoint_num(eps.bulk_in));
	dev->bulk_out_pipe = usb_sndbulkpipe(dev->udev,
					     usb_endpoint_num(eps.bulk_out));

	ret = kfifo_alloc(&dev->read_fifo, USB_BULK_FIFO_SIZE, GFP_KERNEL);
	if (ret)
		goto err_put_dev;
	dev->read_urb = usb_alloc_urb(0, GFP_KERNEL);
	if (!dev->read_urb) {
		ret = -ENOMEM;
		goto err_free_fifo;
	}
	dev->read_buffer = usb_alloc_coherent(dev->udev, dev->read_size,
					      GFP_KERNEL, &dev->read_dma);
	if (!dev->read_buffer) {
		ret = -ENOMEM;
		goto err_free_urb;
	}
	usb_fill_bulk_urb(dev->read_urb, dev->udev, dev->bulk_in_pipe,
			  dev->read_buffer, dev->read_size,
			  usb_bulk_read_complete, dev);
	dev->read_urb->transfer_dma = dev->read_dma;
	dev->read_urb->transfer_flags |= URB_NO_TRANSFER_DMA_MAP;

	usb_set_intfdata(intf, dev);
	ret = usb_register_dev(intf, &usb_bulk_class);
	if (ret)
		goto err_clear_data;
	return 0;

err_clear_data:
	usb_set_intfdata(intf, NULL);
	usb_free_coherent(dev->udev, dev->read_size,
			  dev->read_buffer, dev->read_dma);
err_free_urb:
	usb_free_urb(dev->read_urb);
err_free_fifo:
	kfifo_free(&dev->read_fifo);
err_put_dev:
	usb_put_intf(dev->intf);
	usb_put_dev(dev->udev);
	kfree(dev);
	return ret;
}

static void usb_bulk_disconnect(struct usb_interface *intf)
{
	struct usb_bulk_char *dev = usb_get_intfdata(intf);
	unsigned long flags;

	usb_set_intfdata(intf, NULL);
	if (!dev)
		return;
	usb_deregister_dev(intf, &usb_bulk_class);

	mutex_lock(&dev->io_mutex);
	spin_lock_irqsave(&dev->state_lock, flags);
	dev->online = false;
	dev->suspended = true;
	dev->read_running = false;
	spin_unlock_irqrestore(&dev->state_lock, flags);
	usb_kill_urb(dev->read_urb);
	usb_kill_anchored_urbs(&dev->writes);
	mutex_unlock(&dev->io_mutex);
	wake_up_interruptible_all(&dev->read_wait);
	wake_up_interruptible_all(&dev->write_wait);
	kref_put(&dev->kref, usb_bulk_delete);
}

static int usb_bulk_suspend(struct usb_interface *intf, pm_message_t message)
{
	struct usb_bulk_char *dev = usb_get_intfdata(intf);

	(void)message;
	if (!dev)
		return 0;
	mutex_lock(&dev->io_mutex);
	WRITE_ONCE(dev->suspended, true);
	usb_bulk_stop_read(dev);
	usb_kill_anchored_urbs(&dev->writes);
	mutex_unlock(&dev->io_mutex);
	wake_up_interruptible_all(&dev->write_wait);
	return 0;
}

static int usb_bulk_resume(struct usb_interface *intf)
{
	struct usb_bulk_char *dev = usb_get_intfdata(intf);
	int ret = 0;

	if (!dev)
		return 0;
	mutex_lock(&dev->io_mutex);
	WRITE_ONCE(dev->suspended, false);
	if (atomic_read(&dev->open_count) > 0)
		ret = usb_bulk_start_read_locked(dev);
	mutex_unlock(&dev->io_mutex);
	return ret;
}

static int usb_bulk_pre_reset(struct usb_interface *intf)
{
	return usb_bulk_suspend(intf, PMSG_ON);
}

static int usb_bulk_post_reset(struct usb_interface *intf)
{
	struct usb_bulk_char *dev = usb_get_intfdata(intf);

	if (dev)
		usb_bulk_set_error(dev, -EPIPE);
	return usb_bulk_resume(intf);
}

static const struct usb_device_id usb_bulk_ids[] = {
	{ USB_DEVICE(USB_BULK_VENDOR_ID, USB_BULK_PRODUCT_ID) },
	{ }
};
MODULE_DEVICE_TABLE(usb, usb_bulk_ids);

static struct usb_driver usb_bulk_driver = {
	.name = "usb_bulk_char",
	.probe = usb_bulk_probe,
	.disconnect = usb_bulk_disconnect,
	.suspend = usb_bulk_suspend,
	.resume = usb_bulk_resume,
	.reset_resume = usb_bulk_resume,
	.pre_reset = usb_bulk_pre_reset,
	.post_reset = usb_bulk_post_reset,
	.id_table = usb_bulk_ids,
	.supports_autosuspend = 1,
};
module_usb_driver(usb_bulk_driver);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Teaching asynchronous USB Bulk character driver");
MODULE_LICENSE("GPL");
