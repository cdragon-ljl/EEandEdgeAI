// SPDX-License-Identifier: GPL-2.0
/*
 * Teaching-only PCI IRQ driver for Linux 6.12.
 * Register offsets and the 0xffff:0xfffc ID describe a fictional device.
 */

#include <linux/interrupt.h>
#include <linux/module.h>
#include <linux/pci.h>

#define PCI_IRQ_DEMO_VENDOR_ID	0xffff
#define PCI_IRQ_DEMO_DEVICE_ID	0xfffc
#define PCI_IRQ_DEMO_BAR	0
#define PCI_IRQ_DEMO_MAX_VECTORS	4

#define IRQ_DEMO_CAUSE		0x00
#define IRQ_DEMO_ACK		0x04
#define IRQ_DEMO_ENABLE		0x08

struct pci_irq_demo;

struct pci_irq_demo_vector {
	struct pci_irq_demo *demo;
	unsigned int index;
	int irq;
	atomic64_t events;
};

struct pci_irq_demo {
	struct pci_dev *pdev;
	void __iomem *bar;
	struct pci_irq_demo_vector *vectors;
	int nvec;
};

static irqreturn_t pci_irq_demo_primary(int irq, void *data)
{
	struct pci_irq_demo_vector *vector = data;
	struct pci_irq_demo *demo = vector->demo;
	u32 cause;

	(void)irq;
	cause = readl(demo->bar + IRQ_DEMO_CAUSE);
	if (!(cause & BIT(vector->index)))
		return IRQ_NONE;

	/* Fictional device uses write-one-to-ack bits. */
	writel(BIT(vector->index), demo->bar + IRQ_DEMO_ACK);
	return IRQ_WAKE_THREAD;
}

static irqreturn_t pci_irq_demo_thread(int irq, void *data)
{
	struct pci_irq_demo_vector *vector = data;

	(void)irq;
	atomic64_inc(&vector->events);
	dev_dbg_ratelimited(&vector->demo->pdev->dev,
				"vector %u event count %lld\n",
				vector->index,
				(long long)atomic64_read(&vector->events));
	return IRQ_HANDLED;
}

static void pci_irq_demo_free_irqs(struct pci_irq_demo *demo, int requested)
{
	int i;

	if (demo->bar) {
		writel(0, demo->bar + IRQ_DEMO_ENABLE);
		readl(demo->bar + IRQ_DEMO_CAUSE);
	}

	for (i = 0; i < requested; i++)
		synchronize_irq(demo->vectors[i].irq);
	for (i = 0; i < requested; i++)
		free_irq(demo->vectors[i].irq, &demo->vectors[i]);

	if (demo->nvec > 0) {
		pci_free_irq_vectors(demo->pdev);
		demo->nvec = 0;
	}
}

static int pci_irq_demo_probe(struct pci_dev *pdev,
			      const struct pci_device_id *id)
{
	struct pci_irq_demo *demo;
	unsigned long irq_flags;
	int requested = 0;
	int ret;
	int i;

	(void)id;
	ret = pci_enable_device_mem(pdev);
	if (ret)
		return ret;
	if (pci_resource_len(pdev, PCI_IRQ_DEMO_BAR) <
	    IRQ_DEMO_ENABLE + sizeof(u32)) {
		ret = -ENODEV;
		goto err_disable;
	}

	ret = pci_request_region(pdev, PCI_IRQ_DEMO_BAR, "pci_irq_demo");
	if (ret)
		goto err_disable;

	demo = devm_kzalloc(&pdev->dev, sizeof(*demo), GFP_KERNEL);
	if (!demo) {
		ret = -ENOMEM;
		goto err_release_region;
	}
	demo->pdev = pdev;
	demo->bar = pci_iomap(pdev, PCI_IRQ_DEMO_BAR, 0);
	if (!demo->bar) {
		ret = -ENOMEM;
		goto err_release_region;
	}

	demo->nvec = pci_alloc_irq_vectors(pdev, 1, PCI_IRQ_DEMO_MAX_VECTORS,
					   PCI_IRQ_MSIX | PCI_IRQ_MSI |
					   PCI_IRQ_INTX);
	if (demo->nvec < 0) {
		ret = demo->nvec;
		demo->nvec = 0;
		goto err_iounmap;
	}

	demo->vectors = devm_kcalloc(&pdev->dev, demo->nvec,
				     sizeof(*demo->vectors), GFP_KERNEL);
	if (!demo->vectors) {
		ret = -ENOMEM;
		goto err_free_vectors;
	}

	irq_flags = pci_dev_msi_enabled(pdev) ? 0 : IRQF_SHARED;
	for (i = 0; i < demo->nvec; i++) {
		struct pci_irq_demo_vector *vector = &demo->vectors[i];

		vector->demo = demo;
		vector->index = i;
		vector->irq = pci_irq_vector(pdev, i);
		atomic64_set(&vector->events, 0);
		ret = request_threaded_irq(vector->irq, pci_irq_demo_primary,
					   pci_irq_demo_thread, irq_flags,
					   "pci_irq_demo", vector);
		if (ret)
			goto err_free_irqs;
		requested++;
	}

	pci_set_drvdata(pdev, demo);
	writel(GENMASK(demo->nvec - 1, 0), demo->bar + IRQ_DEMO_ENABLE);
	readl(demo->bar + IRQ_DEMO_CAUSE);
	dev_info(&pdev->dev, "using %d %s vector(s)\n", demo->nvec,
		 pci_dev_msi_enabled(pdev) ? "MSI/MSI-X" : "INTx");
	return 0;

err_free_irqs:
	pci_irq_demo_free_irqs(demo, requested);
	goto err_iounmap;
err_free_vectors:
	pci_free_irq_vectors(pdev);
	demo->nvec = 0;
err_iounmap:
	pci_iounmap(pdev, demo->bar);
err_release_region:
	pci_release_region(pdev, PCI_IRQ_DEMO_BAR);
err_disable:
	pci_disable_device(pdev);
	return ret;
}

static void pci_irq_demo_remove(struct pci_dev *pdev)
{
	struct pci_irq_demo *demo = pci_get_drvdata(pdev);

	pci_irq_demo_free_irqs(demo, demo->nvec);
	pci_iounmap(pdev, demo->bar);
	pci_release_region(pdev, PCI_IRQ_DEMO_BAR);
	pci_disable_device(pdev);
}

static const struct pci_device_id pci_irq_demo_ids[] = {
	{ PCI_DEVICE(PCI_IRQ_DEMO_VENDOR_ID, PCI_IRQ_DEMO_DEVICE_ID) },
	{ }
};
MODULE_DEVICE_TABLE(pci, pci_irq_demo_ids);

static struct pci_driver pci_irq_demo_driver = {
	.name = "pci_irq_demo",
	.id_table = pci_irq_demo_ids,
	.probe = pci_irq_demo_probe,
	.remove = pci_irq_demo_remove,
};
module_pci_driver(pci_irq_demo_driver);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Teaching PCI INTx/MSI/MSI-X threaded IRQ driver");
MODULE_LICENSE("GPL");
