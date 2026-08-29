// SPDX-License-Identifier: GPL-2.0
/*
 * Read-only PCI Explorer for Linux 6.12.
 * The 0xffff:0xfffd ID is fictional and intentionally matches no product.
 */

#include <linux/module.h>
#include <linux/pci.h>

#define PCI_EXPLORER_VENDOR_ID	0xffff
#define PCI_EXPLORER_DEVICE_ID	0xfffd

static ssize_t identity_show(struct device *dev,
			     struct device_attribute *attr, char *buf)
{
	struct pci_dev *pdev = to_pci_dev(dev);

	(void)attr;
	return sysfs_emit(buf,
		"bdf=%s vendor=%04x device=%04x subsystem=%04x:%04x class=%06x revision=%02x\n",
		pci_name(pdev), pdev->vendor, pdev->device,
		pdev->subsystem_vendor, pdev->subsystem_device,
		pdev->class, pdev->revision);
}
static DEVICE_ATTR_RO(identity);

static ssize_t bars_show(struct device *dev,
			 struct device_attribute *attr, char *buf)
{
	struct pci_dev *pdev = to_pci_dev(dev);
	ssize_t at = 0;
	int bar;

	(void)attr;
	for (bar = 0; bar < PCI_STD_NUM_BARS; bar++) {
		resource_size_t start = pci_resource_start(pdev, bar);
		resource_size_t len = pci_resource_len(pdev, bar);
		unsigned long flags = pci_resource_flags(pdev, bar);

		at += sysfs_emit_at(buf, at,
			"bar%d start=%#llx length=%#llx flags=%#lx\n",
			bar, (unsigned long long)start,
			(unsigned long long)len, flags);
	}
	return at;
}
static DEVICE_ATTR_RO(bars);

static ssize_t capabilities_show(struct device *dev,
				 struct device_attribute *attr, char *buf)
{
	struct pci_dev *pdev = to_pci_dev(dev);
	int pm, msi, msix, pcie, aer, sriov, ats, pri, pasid;

	(void)attr;
	pci_cfg_access_lock(pdev);
	pm = pci_find_capability(pdev, PCI_CAP_ID_PM);
	msi = pci_find_capability(pdev, PCI_CAP_ID_MSI);
	msix = pci_find_capability(pdev, PCI_CAP_ID_MSIX);
	pcie = pci_find_capability(pdev, PCI_CAP_ID_EXP);
	aer = pci_find_ext_capability(pdev, PCI_EXT_CAP_ID_ERR);
	sriov = pci_find_ext_capability(pdev, PCI_EXT_CAP_ID_SRIOV);
	ats = pci_find_ext_capability(pdev, PCI_EXT_CAP_ID_ATS);
	pri = pci_find_ext_capability(pdev, PCI_EXT_CAP_ID_PRI);
	pasid = pci_find_ext_capability(pdev, PCI_EXT_CAP_ID_PASID);
	pci_cfg_access_unlock(pdev);

	return sysfs_emit(buf,
		"pm=%#x msi=%#x msix=%#x pcie=%#x aer=%#x sriov=%#x ats=%#x pri=%#x pasid=%#x\n",
		pm, msi, msix, pcie, aer, sriov, ats, pri, pasid);
}
static DEVICE_ATTR_RO(capabilities);

static ssize_t link_show(struct device *dev,
			 struct device_attribute *attr, char *buf)
{
	struct pci_dev *pdev = to_pci_dev(dev);
	u32 lnkcap;
	u16 lnksta;
	int ret;

	(void)attr;
	if (!pci_is_pcie(pdev))
		return sysfs_emit(buf, "not-a-pcie-function\n");

	pci_cfg_access_lock(pdev);
	ret = pcie_capability_read_dword(pdev, PCI_EXP_LNKCAP, &lnkcap);
	if (!ret)
		ret = pcie_capability_read_word(pdev, PCI_EXP_LNKSTA, &lnksta);
	pci_cfg_access_unlock(pdev);
	if (ret)
		return pcibios_err_to_errno(ret);

	return sysfs_emit(buf,
		"max_speed=%u max_width=%u current_speed=%u current_width=%u training=%u dllla=%u\n",
		lnkcap & PCI_EXP_LNKCAP_SLS,
		(lnkcap & PCI_EXP_LNKCAP_MLW) >> 4,
		lnksta & PCI_EXP_LNKSTA_CLS,
		(lnksta & PCI_EXP_LNKSTA_NLW) >> 4,
		!!(lnksta & PCI_EXP_LNKSTA_LT),
		!!(lnksta & PCI_EXP_LNKSTA_DLLLA));
}
static DEVICE_ATTR_RO(link);

static struct attribute *pci_explorer_attrs[] = {
	&dev_attr_identity.attr,
	&dev_attr_bars.attr,
	&dev_attr_capabilities.attr,
	&dev_attr_link.attr,
	NULL,
};

static const struct attribute_group pci_explorer_group = {
	.name = "explorer",
	.attrs = pci_explorer_attrs,
};

static int pci_explorer_probe(struct pci_dev *pdev,
			      const struct pci_device_id *id)
{
	u16 command, status;
	int ret;

	(void)id;
	pci_cfg_access_lock(pdev);
	ret = pci_read_config_word(pdev, PCI_COMMAND, &command);
	if (!ret)
		ret = pci_read_config_word(pdev, PCI_STATUS, &status);
	pci_cfg_access_unlock(pdev);
	if (ret)
		return pcibios_err_to_errno(ret);

	ret = sysfs_create_group(&pdev->dev.kobj, &pci_explorer_group);
	if (ret)
		return ret;

	dev_info(&pdev->dev,
		 "read-only explorer bound: command=%#x status=%#x\n",
		 command, status);
	return 0;
}

static void pci_explorer_remove(struct pci_dev *pdev)
{
	sysfs_remove_group(&pdev->dev.kobj, &pci_explorer_group);
}

static const struct pci_device_id pci_explorer_ids[] = {
	{ PCI_DEVICE(PCI_EXPLORER_VENDOR_ID, PCI_EXPLORER_DEVICE_ID) },
	{ }
};
MODULE_DEVICE_TABLE(pci, pci_explorer_ids);

static struct pci_driver pci_explorer_driver = {
	.name = "pci_explorer",
	.id_table = pci_explorer_ids,
	.probe = pci_explorer_probe,
	.remove = pci_explorer_remove,
};

static int __init pci_explorer_init(void)
{
	return pci_register_driver(&pci_explorer_driver);
}

static void __exit pci_explorer_exit(void)
{
	pci_unregister_driver(&pci_explorer_driver);
}

module_init(pci_explorer_init);
module_exit(pci_explorer_exit);

MODULE_AUTHOR("EEandEdgeAI");
MODULE_DESCRIPTION("Read-only teaching PCI configuration explorer");
MODULE_LICENSE("GPL");
