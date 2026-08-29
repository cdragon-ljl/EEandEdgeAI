// SPDX-License-Identifier: GPL-2.0
/*
 * Teaching PCI Endpoint Function for Linux 6.12.
 * BAR registers and the 0xffff:0xfffa identity define a fictional protocol.
 */

#include <linux/delay.h>
#include <linux/module.h>
#include <linux/pci-epc.h>
#include <linux/pci-epf.h>
#include <linux/workqueue.h>

#define TEACH_BAR_SIZE		SZ_4K
#define TEACH_MSIX_TABLE_OFFSET	0x800
#define TEACH_MAX_MSIX		16
#define TEACH_POLL_MS		10

#define TEACH_CMD_NONE		0
#define TEACH_CMD_PING		1
#define TEACH_CMD_RAISE_IRQ	2

struct pci_epf_teach_regs {
	__le32 version;
	__le32 capability;
	__le32 command;
	__le32 status;
	__le32 request_id;
	__le32 generation;
	__le32 irq_type;
	__le32 irq_number;
};

struct pci_epf_teaching {
	struct pci_epf *epf;
	const struct pci_epc_features *features;
	struct pci_epf_teach_regs *regs;
	struct delayed_work command_work;
	enum pci_barno bar;
	bool bar_set;
	bool link_up;
};

static struct pci_epf_header pci_epf_teaching_header = {
	.vendorid = 0xffff,
	.deviceid = 0xfffa,
	.baseclass_code = PCI_CLASS_OTHERS,
	.interrupt_pin = PCI_INTERRUPT_INTA,
};

static int pci_epf_teaching_raise_irq(struct pci_epf_teaching *teach,
				      u32 requested_type, u32 number)
{
	struct pci_epf *epf = teach->epf;
	struct pci_epc *epc = epf->epc;
	int count;

	switch (requested_type) {
	case PCI_IRQ_MSIX:
		count = pci_epc_get_msix(epc, epf->func_no, epf->vfunc_no);
		if (count > 0 && number > 0 && number <= count)
			return pci_epc_raise_irq(epc, epf->func_no,
						 epf->vfunc_no, PCI_IRQ_MSIX,
						 number);
		return -EINVAL;
	case PCI_IRQ_MSI:
		count = pci_epc_get_msi(epc, epf->func_no, epf->vfunc_no);
		if (count > 0 && number > 0 && number <= count)
			return pci_epc_raise_irq(epc, epf->func_no,
						 epf->vfunc_no, PCI_IRQ_MSI,
						 number);
		return -EINVAL;
	case PCI_IRQ_INTX:
		return pci_epc_raise_irq(epc, epf->func_no, epf->vfunc_no,
					 PCI_IRQ_INTX, 0);
	default:
		return -EINVAL;
	}
}

static void pci_epf_teaching_command_work(struct work_struct *work)
{
	struct pci_epf_teaching *teach =
		container_of(to_delayed_work(work), struct pci_epf_teaching,
			     command_work);
	struct pci_epf_teach_regs *regs = teach->regs;
	u32 command;
	u32 irq_type;
	u32 irq_number;
	int ret = 0;

	if (!READ_ONCE(teach->link_up) || !READ_ONCE(teach->bar_set))
		return;

	command = le32_to_cpu(READ_ONCE(regs->command));
	if (command == TEACH_CMD_NONE)
		goto reschedule;

	WRITE_ONCE(regs->command, cpu_to_le32(TEACH_CMD_NONE));
	switch (command) {
	case TEACH_CMD_PING:
		WRITE_ONCE(regs->status,
			   READ_ONCE(regs->request_id));
		break;
	case TEACH_CMD_RAISE_IRQ:
		irq_type = le32_to_cpu(READ_ONCE(regs->irq_type));
		irq_number = le32_to_cpu(READ_ONCE(regs->irq_number));
		WRITE_ONCE(regs->status, cpu_to_le32(0));
		wmb();
		ret = pci_epf_teaching_raise_irq(teach, irq_type, irq_number);
		if (ret)
			WRITE_ONCE(regs->status, cpu_to_le32(ret));
		goto reschedule;
	default:
		WRITE_ONCE(regs->status, cpu_to_le32(-EOPNOTSUPP));
		break;
	}

	/* Publish status before an optional host-visible interrupt. */
	wmb();

reschedule:
	if (READ_ONCE(teach->link_up))
		schedule_delayed_work(&teach->command_work,
				      msecs_to_jiffies(TEACH_POLL_MS));
}

static void pci_epf_teaching_clear_bar(struct pci_epf_teaching *teach)
{
	struct pci_epf *epf = teach->epf;

	if (!teach->bar_set || !epf->epc)
		return;
	pci_epc_clear_bar(epf->epc, epf->func_no, epf->vfunc_no,
			  &epf->bar[teach->bar]);
	teach->bar_set = false;
}

static int pci_epf_teaching_epc_init(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);
	struct pci_epc *epc = epf->epc;
	int ret;

	ret = pci_epc_write_header(epc, epf->func_no, epf->vfunc_no,
				   epf->header);
	if (ret)
		return ret;

	ret = pci_epc_set_bar(epc, epf->func_no, epf->vfunc_no,
			      &epf->bar[teach->bar]);
	if (ret)
		return ret;
	teach->bar_set = true;

	if (teach->features->msi_capable && epf->msi_interrupts) {
		ret = pci_epc_set_msi(epc, epf->func_no, epf->vfunc_no,
				      epf->msi_interrupts);
		if (ret)
			goto err_clear_bar;
	}

	if (teach->features->msix_capable && epf->msix_interrupts) {
		if (epf->msix_interrupts > TEACH_MAX_MSIX) {
			ret = -EINVAL;
			goto err_clear_bar;
		}
		ret = pci_epc_set_msix(epc, epf->func_no, epf->vfunc_no,
				       epf->msix_interrupts, teach->bar,
				       TEACH_MSIX_TABLE_OFFSET);
		if (ret)
			goto err_clear_bar;
	}

	WRITE_ONCE(teach->regs->version, cpu_to_le32(1));
	WRITE_ONCE(teach->regs->capability,
		   cpu_to_le32(BIT(TEACH_CMD_PING) |
			       BIT(TEACH_CMD_RAISE_IRQ)));
	if (!teach->features->linkup_notifier) {
		WRITE_ONCE(teach->link_up, true);
		schedule_delayed_work(&teach->command_work,
				      msecs_to_jiffies(TEACH_POLL_MS));
	}
	return 0;

err_clear_bar:
	pci_epf_teaching_clear_bar(teach);
	return ret;
}

static void pci_epf_teaching_epc_deinit(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);

	WRITE_ONCE(teach->link_up, false);
	cancel_delayed_work_sync(&teach->command_work);
	pci_epf_teaching_clear_bar(teach);
}

static int pci_epf_teaching_link_up(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);

	WRITE_ONCE(teach->link_up, true);
	schedule_delayed_work(&teach->command_work,
			      msecs_to_jiffies(TEACH_POLL_MS));
	return 0;
}

static int pci_epf_teaching_link_down(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);

	WRITE_ONCE(teach->link_up, false);
	cancel_delayed_work_sync(&teach->command_work);
	return 0;
}

static const struct pci_epc_event_ops pci_epf_teaching_event_ops = {
	.epc_init = pci_epf_teaching_epc_init,
	.epc_deinit = pci_epf_teaching_epc_deinit,
	.link_up = pci_epf_teaching_link_up,
	.link_down = pci_epf_teaching_link_down,
};

static int pci_epf_teaching_bind(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);
	struct pci_epc *epc = epf->epc;

	if (WARN_ON_ONCE(!epc))
		return -EINVAL;

	teach->features = pci_epc_get_features(epc, epf->func_no,
					       epf->vfunc_no);
	if (!teach->features)
		return -EOPNOTSUPP;

	teach->bar = pci_epc_get_first_free_bar(teach->features);
	if (teach->bar < 0)
		return -ENOSPC;

	teach->regs = pci_epf_alloc_space(epf, TEACH_BAR_SIZE, teach->bar,
					  teach->features,
					  PRIMARY_INTERFACE);
	if (!teach->regs)
		return -ENOMEM;

	return 0;
}

static void pci_epf_teaching_unbind(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);

	WRITE_ONCE(teach->link_up, false);
	cancel_delayed_work_sync(&teach->command_work);
	pci_epf_teaching_clear_bar(teach);
	if (teach->regs) {
		pci_epf_free_space(epf, teach->regs, teach->bar,
				   PRIMARY_INTERFACE);
		teach->regs = NULL;
	}
}

static int pci_epf_teaching_probe(struct pci_epf *epf,
				  const struct pci_epf_device_id *id)
{
	struct pci_epf_teaching *teach;

	(void)id;
	teach = devm_kzalloc(&epf->dev, sizeof(*teach), GFP_KERNEL);
	if (!teach)
		return -ENOMEM;

	teach->epf = epf;
	INIT_DELAYED_WORK(&teach->command_work,
			  pci_epf_teaching_command_work);
	epf->header = &pci_epf_teaching_header;
	epf->event_ops = &pci_epf_teaching_event_ops;
	epf_set_drvdata(epf, teach);
	return 0;
}

static void pci_epf_teaching_remove(struct pci_epf *epf)
{
	struct pci_epf_teaching *teach = epf_get_drvdata(epf);

	cancel_delayed_work_sync(&teach->command_work);
}

static const struct pci_epf_ops pci_epf_teaching_ops = {
	.bind = pci_epf_teaching_bind,
	.unbind = pci_epf_teaching_unbind,
};

static const struct pci_epf_device_id pci_epf_teaching_ids[] = {
	{ .name = "pci_epf_teaching" },
	{ }
};

static struct pci_epf_driver pci_epf_teaching_driver = {
	.driver.name = "pci_epf_teaching",
	.probe = pci_epf_teaching_probe,
	.remove = pci_epf_teaching_remove,
	.id_table = pci_epf_teaching_ids,
	.ops = &pci_epf_teaching_ops,
	.owner = THIS_MODULE,
};

static int __init pci_epf_teaching_init(void)
{
	return pci_epf_register_driver(&pci_epf_teaching_driver);
}

static void __exit pci_epf_teaching_exit(void)
{
	pci_epf_unregister_driver(&pci_epf_teaching_driver);
}

module_init(pci_epf_teaching_init);
module_exit(pci_epf_teaching_exit);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Teaching Linux PCI Endpoint Function");
MODULE_LICENSE("GPL");
