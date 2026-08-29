// SPDX-License-Identifier: GPL-2.0
/*
 * Teaching-only PCI DMA ring driver for Linux 6.12.
 * The ID, registers and descriptors below define a fictional device ABI.
 */

#include <linux/interrupt.h>
#include <linux/iopoll.h>
#include <linux/module.h>
#include <linux/pci.h>
#include <linux/slab.h>

#define PCI_DMA_RING_VENDOR_ID	0xffff
#define PCI_DMA_RING_DEVICE_ID	0xfffb
#define PCI_DMA_RING_BAR		0
#define PCI_DMA_RING_DEPTH	64

#define RING_REG_SQ_BASE_LO	0x00
#define RING_REG_SQ_BASE_HI	0x04
#define RING_REG_CQ_BASE_LO	0x08
#define RING_REG_CQ_BASE_HI	0x0c
#define RING_REG_DEPTH		0x10
#define RING_REG_SQ_TAIL		0x14
#define RING_REG_CQ_HEAD		0x18
#define RING_REG_CONTROL		0x1c
#define RING_REG_STATUS		0x20
#define RING_REG_IRQ_CAUSE	0x24
#define RING_REG_IRQ_ACK		0x28
#define RING_REG_IRQ_ENABLE	0x2c

#define RING_CONTROL_ENABLE	BIT(0)
#define RING_CONTROL_RESET	BIT(1)
#define RING_STATUS_IDLE		BIT(0)
#define RING_IRQ_COMPLETION	BIT(0)

struct pci_dma_sq_desc {
	__le64 dma_addr;
	__le32 length;
	__le16 request_id;
	__le16 flags;
	__le32 generation;
};

struct pci_dma_cq_desc {
	__le16 request_id;
	__le16 status;
	__le32 bytes_done;
	__le32 generation;
	u8 phase;
	u8 reserved[3];
};

struct pci_dma_request {
	void *buffer;
	dma_addr_t dma;
	size_t length;
	u32 generation;
	bool mapped;
};

struct pci_dma_ring {
	struct pci_dev *pdev;
	void __iomem *bar;
	struct pci_dma_sq_desc *sq;
	dma_addr_t sq_dma;
	struct pci_dma_cq_desc *cq;
	dma_addr_t cq_dma;
	spinlock_t lock;
	u16 sq_producer;
	u16 cq_consumer;
	u8 cq_phase;
	u32 generation;
	struct pci_dma_request request;
	int irq;
	bool online;
};

static void pci_dma_ring_program(struct pci_dma_ring *ring)
{
	writel(lower_32_bits(ring->sq_dma),
	       ring->bar + RING_REG_SQ_BASE_LO);
	writel(upper_32_bits(ring->sq_dma),
	       ring->bar + RING_REG_SQ_BASE_HI);
	writel(lower_32_bits(ring->cq_dma),
	       ring->bar + RING_REG_CQ_BASE_LO);
	writel(upper_32_bits(ring->cq_dma),
	       ring->bar + RING_REG_CQ_BASE_HI);
	writel(PCI_DMA_RING_DEPTH, ring->bar + RING_REG_DEPTH);
	writel(0, ring->bar + RING_REG_SQ_TAIL);
	writel(0, ring->bar + RING_REG_CQ_HEAD);
	writel(RING_IRQ_COMPLETION, ring->bar + RING_REG_IRQ_ENABLE);
	writel(RING_CONTROL_ENABLE, ring->bar + RING_REG_CONTROL);
	readl(ring->bar + RING_REG_STATUS);
}

static int pci_dma_ring_submit_one(struct pci_dma_ring *ring)
{
	struct pci_dma_sq_desc *desc;
	struct pci_dma_request *request = &ring->request;
	unsigned long flags;
	u16 slot;

	request->length = PAGE_SIZE;
	request->buffer = kzalloc(request->length, GFP_KERNEL);
	if (!request->buffer)
		return -ENOMEM;

	request->dma = dma_map_single(&ring->pdev->dev, request->buffer,
				      request->length, DMA_FROM_DEVICE);
	if (dma_mapping_error(&ring->pdev->dev, request->dma)) {
		kfree(request->buffer);
		request->buffer = NULL;
		return -EIO;
	}

	spin_lock_irqsave(&ring->lock, flags);
	if (!ring->online || request->mapped) {
		spin_unlock_irqrestore(&ring->lock, flags);
		dma_unmap_single(&ring->pdev->dev, request->dma,
				 request->length, DMA_FROM_DEVICE);
		kfree(request->buffer);
		request->buffer = NULL;
		return -EBUSY;
	}

	request->mapped = true;
	request->generation = ring->generation;
	slot = ring->sq_producer & (PCI_DMA_RING_DEPTH - 1);
	desc = &ring->sq[slot];
	desc->dma_addr = cpu_to_le64(request->dma);
	desc->length = cpu_to_le32(request->length);
	desc->request_id = cpu_to_le16(1);
	desc->flags = 0;
	desc->generation = cpu_to_le32(request->generation);
	ring->sq_producer++;

	/* Publish every descriptor field before the MMIO doorbell. */
	dma_wmb();
	writel(ring->sq_producer, ring->bar + RING_REG_SQ_TAIL);
	spin_unlock_irqrestore(&ring->lock, flags);
	return 0;
}

static irqreturn_t pci_dma_ring_irq(int irq, void *data)
{
	struct pci_dma_ring *ring = data;
	struct pci_dma_cq_desc *cqe;
	void *buffer = NULL;
	dma_addr_t dma = 0;
	size_t length = 0;
	unsigned long flags;
	u32 generation;
	u32 bytes_done;
	u32 cause;
	bool unmap = false;

	(void)irq;
	cause = readl(ring->bar + RING_REG_IRQ_CAUSE);
	if (!(cause & RING_IRQ_COMPLETION))
		return IRQ_NONE;
	writel(RING_IRQ_COMPLETION, ring->bar + RING_REG_IRQ_ACK);

	spin_lock_irqsave(&ring->lock, flags);
	cqe = &ring->cq[ring->cq_consumer & (PCI_DMA_RING_DEPTH - 1)];
	if (READ_ONCE(cqe->phase) != ring->cq_phase) {
		spin_unlock_irqrestore(&ring->lock, flags);
		return IRQ_HANDLED;
	}

	/* Device writes completion fields before publishing phase. */
	dma_rmb();
	generation = le32_to_cpu(cqe->generation);
	bytes_done = le32_to_cpu(cqe->bytes_done);
	if (le16_to_cpu(cqe->request_id) == 1 &&
	    ring->request.mapped &&
	    generation == ring->request.generation) {
		buffer = ring->request.buffer;
		dma = ring->request.dma;
		length = ring->request.length;
		ring->request.mapped = false;
		ring->request.buffer = NULL;
		unmap = true;
	}

	ring->cq_consumer++;
	if (!(ring->cq_consumer & (PCI_DMA_RING_DEPTH - 1)))
		ring->cq_phase ^= 1;
	writel(ring->cq_consumer, ring->bar + RING_REG_CQ_HEAD);
	spin_unlock_irqrestore(&ring->lock, flags);

	if (unmap) {
		dma_unmap_single(&ring->pdev->dev, dma, length,
				 DMA_FROM_DEVICE);
		dev_dbg(&ring->pdev->dev,
			"request complete: bytes=%u generation=%u\n",
			bytes_done, generation);
		kfree(buffer);
	}
	return IRQ_HANDLED;
}

static void pci_dma_ring_quiesce(struct pci_dma_ring *ring)
{
	void *buffer = NULL;
	dma_addr_t dma = 0;
	size_t length = 0;
	unsigned long flags;
	u32 status;
	int ret;
	bool unmap = false;

	spin_lock_irqsave(&ring->lock, flags);
	ring->online = false;
	spin_unlock_irqrestore(&ring->lock, flags);

	writel(0, ring->bar + RING_REG_IRQ_ENABLE);
	readl(ring->bar + RING_REG_IRQ_CAUSE);
	synchronize_irq(ring->irq);
	writel(RING_CONTROL_RESET, ring->bar + RING_REG_CONTROL);
	ret = readl_poll_timeout(ring->bar + RING_REG_STATUS, status,
				 status & RING_STATUS_IDLE, 10, 100000);
	if (ret) {
		dev_warn(&ring->pdev->dev,
			 "queue did not become idle, escalating to FLR\n");
		ret = pci_reset_function(ring->pdev);
		if (ret)
			dev_err(&ring->pdev->dev,
				"FLR/reset failed while quiescing: %d\n", ret);
	}
	synchronize_irq(ring->irq);

	spin_lock_irqsave(&ring->lock, flags);
	if (ring->request.mapped) {
		buffer = ring->request.buffer;
		dma = ring->request.dma;
		length = ring->request.length;
		ring->request.mapped = false;
		ring->request.buffer = NULL;
		unmap = true;
	}
	ring->generation++;
	spin_unlock_irqrestore(&ring->lock, flags);

	if (unmap) {
		dma_unmap_single(&ring->pdev->dev, dma, length,
				 DMA_FROM_DEVICE);
		kfree(buffer);
	}
}

static int pci_dma_ring_probe(struct pci_dev *pdev,
			      const struct pci_device_id *id)
{
	struct pci_dma_ring *ring;
	size_t sq_size = sizeof(*ring->sq) * PCI_DMA_RING_DEPTH;
	size_t cq_size = sizeof(*ring->cq) * PCI_DMA_RING_DEPTH;
	int ret;

	(void)id;
	ret = pci_enable_device_mem(pdev);
	if (ret)
		return ret;
	if (pci_resource_len(pdev, PCI_DMA_RING_BAR) <
	    RING_REG_IRQ_ENABLE + sizeof(u32)) {
		ret = -ENODEV;
		goto err_disable;
	}
	ret = pci_request_region(pdev, PCI_DMA_RING_BAR, "pci_dma_ring");
	if (ret)
		goto err_disable;
	ret = dma_set_mask_and_coherent(&pdev->dev, DMA_BIT_MASK(64));
	if (ret)
		goto err_release_region;
	pci_set_master(pdev);

	ring = devm_kzalloc(&pdev->dev, sizeof(*ring), GFP_KERNEL);
	if (!ring) {
		ret = -ENOMEM;
		goto err_clear_master;
	}
	ring->pdev = pdev;
	spin_lock_init(&ring->lock);
	ring->generation = 1;
	ring->cq_phase = 1;
	ring->bar = pci_iomap(pdev, PCI_DMA_RING_BAR, 0);
	if (!ring->bar) {
		ret = -ENOMEM;
		goto err_clear_master;
	}

	ring->sq = dma_alloc_coherent(&pdev->dev, sq_size,
				      &ring->sq_dma, GFP_KERNEL);
	if (!ring->sq) {
		ret = -ENOMEM;
		goto err_iounmap;
	}
	ring->cq = dma_alloc_coherent(&pdev->dev, cq_size,
				      &ring->cq_dma, GFP_KERNEL);
	if (!ring->cq) {
		ret = -ENOMEM;
		goto err_free_sq;
	}

	ret = pci_alloc_irq_vectors(pdev, 1, 1, PCI_IRQ_MSI | PCI_IRQ_MSIX);
	if (ret < 0)
		goto err_free_cq;
	ring->irq = pci_irq_vector(pdev, 0);
	ret = request_irq(ring->irq, pci_dma_ring_irq, 0,
			  "pci_dma_ring", ring);
	if (ret)
		goto err_free_vectors;

	pci_set_drvdata(pdev, ring);
	ring->online = true;
	pci_dma_ring_program(ring);
	ret = pci_dma_ring_submit_one(ring);
	if (ret)
		goto err_free_irq;
	return 0;

err_free_irq:
	pci_dma_ring_quiesce(ring);
	free_irq(ring->irq, ring);
err_free_vectors:
	pci_free_irq_vectors(pdev);
err_free_cq:
	dma_free_coherent(&pdev->dev, cq_size, ring->cq, ring->cq_dma);
err_free_sq:
	dma_free_coherent(&pdev->dev, sq_size, ring->sq, ring->sq_dma);
err_iounmap:
	pci_iounmap(pdev, ring->bar);
err_clear_master:
	pci_clear_master(pdev);
err_release_region:
	pci_release_region(pdev, PCI_DMA_RING_BAR);
err_disable:
	pci_disable_device(pdev);
	return ret;
}

static void pci_dma_ring_remove(struct pci_dev *pdev)
{
	struct pci_dma_ring *ring = pci_get_drvdata(pdev);
	size_t sq_size = sizeof(*ring->sq) * PCI_DMA_RING_DEPTH;
	size_t cq_size = sizeof(*ring->cq) * PCI_DMA_RING_DEPTH;

	pci_dma_ring_quiesce(ring);
	free_irq(ring->irq, ring);
	pci_free_irq_vectors(pdev);
	dma_free_coherent(&pdev->dev, cq_size, ring->cq, ring->cq_dma);
	dma_free_coherent(&pdev->dev, sq_size, ring->sq, ring->sq_dma);
	pci_iounmap(pdev, ring->bar);
	pci_clear_master(pdev);
	pci_release_region(pdev, PCI_DMA_RING_BAR);
	pci_disable_device(pdev);
}

static const struct pci_device_id pci_dma_ring_ids[] = {
	{ PCI_DEVICE(PCI_DMA_RING_VENDOR_ID, PCI_DMA_RING_DEVICE_ID) },
	{ }
};
MODULE_DEVICE_TABLE(pci, pci_dma_ring_ids);

static struct pci_driver pci_dma_ring_driver = {
	.name = "pci_dma_ring",
	.id_table = pci_dma_ring_ids,
	.probe = pci_dma_ring_probe,
	.remove = pci_dma_ring_remove,
};
module_pci_driver(pci_dma_ring_driver);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Teaching PCI DMA descriptor ring driver");
MODULE_LICENSE("GPL");
