---
title: "嵌入式知识体系 · Linux 驱动开发实战 #03 · VFS、字符设备抽象、设备号、cdev 与 file_operations"
description: "从用户程序的 open、read 和 write 出发，沿着 VFS 找到字符设备的 cdev 与 file_operations，并完成一个可以实际读写的虚拟字符设备。"
pubDate: "2026-08-29"
series: linux-driver
order: 3
tags: ["Linux Driver", "VFS", "Character Device", "cdev"]
draft: true
---

上一章的 `module_echo` 已经能够被内核加载：`insmod` 触发初始化函数，`rmmod` 触发退出函数，日志证明模块代码确实进入了内核。但是它还不是一个真正可供应用程序使用的设备。除了一次性的加载和卸载，用户程序没有稳定的入口去调用它，更谈不上向它写入数据或读取状态。

Linux 解决这个问题的方法并不是让应用程序直接寻找某个内核函数，而是把设备也放进文件访问模型。应用仍然调用熟悉的 `open()`、`read()` 和 `write()`，VFS 负责找到设备对应的驱动回调。本章就沿着这条路径前进：先弄清一次文件操作经过了哪些内核对象，再把一个只保存在内存中的虚拟设备注册成 `/dev/vchar0`。它不依赖任何真实寄存器，因此我们可以把注意力完全放在字符设备框架上。

## 1. 为什么字符设备也表现为文件

Linux 驱动通常会接触三类设备。字符设备按字节流或一条条记录与用户交换数据，串口、终端和许多简单控制设备都属于这一类；块设备按可以随机访问的数据块组织 I/O，磁盘和 eMMC 会进入块层；网络设备则通过网络协议栈收发数据包，不依赖普通的 `read()`、`write()` 文件路径。

这种分类描述的是内核向上提供的访问方式，而不是芯片的物理外形。同一个 SPI 控制器下面的器件，可以接入 IIO、Input、MTD，也可以在没有合适标准子系统时提供字符设备。选择字符设备，不是因为它“最容易写”，而是因为应用确实需要通过文件描述符读取数据、写入控制信息，或者等待事件。

我们本章实现的 `vchar` 很简单：驱动内部有一个 128 字节缓冲区。应用写入 `/dev/vchar0` 时，新内容替换旧内容；随后读取同一个文件描述符，就能取回刚刚写入的字节。这个功能没有硬件价值，却能完整展示用户地址、文件位置、设备号、`cdev` 和回调函数如何配合。

```mermaid
flowchart LR
    A["用户程序 open/read/write"] --> B["系统调用"]
    B --> C["VFS"]
    C --> D["inode 中的设备标识"]
    D --> E["cdev"]
    E --> F["file_operations"]
    F --> G["vchar 驱动缓冲区"]
```

图中最重要的不是箭头数量，而是职责分工：设备节点让 VFS 获得设备标识，`cdev` 把这个标识和一组文件操作联系起来，`file_operations` 再把通用的文件操作转换成驱动自己的 C 函数。

## 2. inode、file 与 file_operations 各自表示什么

应用执行下面的语句时，`open()` 返回一个整数文件描述符：

```c
int fd = open("/dev/vchar0", O_RDWR);
```

这个整数只是当前进程文件描述符表中的索引。内核会为本次打开建立一个 `struct file` 对象，后续 `read(fd, ...)` 和 `write(fd, ...)` 都先通过文件描述符找到它。`struct file` 表示“一次打开”：它保存当前文件位置 `f_pos`、打开标志 `f_flags`、实际使用的文件操作 `f_op`，还允许驱动通过 `private_data` 保存这次打开所关联的设备实例。

`struct inode` 的含义不同。它描述文件系统中的一个对象，而不是某个进程的一次打开。对字符设备节点来说，inode 中的 `i_rdev` 保存设备号，`i_cdev` 指向已经匹配到的 `struct cdev`。同一个设备节点可以被多个进程打开，因此多个 `struct file` 可以对应同一个 inode 和同一个设备实例。

这一区别会直接出现在驱动的 `open` 回调里：

```c
static int vchar_open(struct inode *inode, struct file *file)
{
    struct vchar_device *vdev;

    vdev = container_of(inode->i_cdev, struct vchar_device, cdev);
    file->private_data = vdev;
    return 0;
}
```

`inode->i_cdev` 告诉我们 VFS 找到了哪个 `cdev`。因为本例把 `cdev` 嵌入 `struct vchar_device`，`container_of()` 可以从成员地址回到完整设备对象。保存到 `file->private_data` 后，`read` 和 `write` 不必再次查找设备，直接取出这个指针即可。

真正定义“打开之后能做什么”的是 `struct file_operations`：

```c
static const struct file_operations vchar_fops = {
    .owner  = THIS_MODULE,
    .open   = vchar_open,
    .read   = vchar_read,
    .write  = vchar_write,
    .llseek = no_llseek,
};
```

VFS 规定了回调原型，驱动填写自己支持的操作。当应用调用 `read()` 时，VFS 最终执行 `file->f_op->read`；调用 `write()` 时则执行 `file->f_op->write`。`owner = THIS_MODULE` 让打开的文件持有模块引用，模块仍被使用时，普通的 `rmmod` 不会直接卸载它。

## 3. 设备号和 cdev 如何把节点连接到回调

如果系统里只有一个名为 `vchar0` 的节点，为什么内核不直接按名字查找驱动？因为 `/dev` 中的名字属于用户空间接口，可以由设备管理程序决定；内核识别字符设备时使用的是设备号。

设备号的类型是 `dev_t`，其中包含主设备号和次设备号。主设备号通常表示一类驱动，次设备号区分同一驱动管理的多个实例。例如一个驱动管理四个串口时，它们可以共享主设备号而使用不同次设备号。`MAJOR(devt)` 和 `MINOR(devt)` 可以取出两部分。

开发阶段通常让内核动态分配设备号：

```c
ret = alloc_chrdev_region(&vdev->devt, 0, 1, "vchar");
```

得到 `dev_t` 后，驱动初始化并注册 `cdev`：

```c
cdev_init(&vdev->cdev, &vchar_fops);
vdev->cdev.owner = THIS_MODULE;
ret = cdev_add(&vdev->cdev, vdev->devt, 1);
```

`cdev_init()` 把 `file_operations` 交给 `cdev`，`cdev_add()` 再把这段设备号范围加入内核的字符设备映射。到这里，内核已经知道“这个主次设备号应该使用哪组回调”，但 `/dev/vchar0` 还不一定存在。

`class_create()` 和 `device_create()` 用来创建设备模型中的 class/device，并发送 uevent：

```c
vdev->class = class_create("vchar");
vdev->device = device_create(vdev->class, NULL, vdev->devt,
                             NULL, "vchar0");
```

在 Linux 6.12 中，`class_create()` 只接收 class 名称。较旧的厂商内核常见 `class_create(THIS_MODULE, "vchar")`，因此在 RV1126 SDK 上编译时要以当前内核头文件为准。`device_create()` 成功后可以在 `/sys/class/vchar/vchar0` 看到设备；若 rootfs 启用了 devtmpfs，并由 udev 或 mdev 处理事件，`/dev/vchar0` 也会随之出现。

这两个动作不能替代 `cdev_add()`。前者建立设备模型和用户可见节点，后者建立设备号到回调的内核映射。只做其中一半，就会出现“有 sysfs 目录但无法打开”，或者“驱动已经注册但没有方便使用的设备节点”。

## 4. 完成一个可以读写的虚拟字符设备

### 4.1 设备对象

本例只有一个设备实例，使用静态对象即可。缓冲区、有效数据长度、锁、设备号、`cdev` 和设备模型对象都放在一起：

```c
#include <linux/cdev.h>
#include <linux/device.h>
#include <linux/fs.h>
#include <linux/init.h>
#include <linux/module.h>
#include <linux/mutex.h>
#include <linux/uaccess.h>

#define VCHAR_BUFFER_SIZE 128

struct vchar_device {
    dev_t devt;
    struct cdev cdev;
    struct class *class;
    struct device *device;
    struct mutex lock;
    char data[VCHAR_BUFFER_SIZE];
    size_t data_len;
};

static struct vchar_device vchar;
```

`mutex` 用于保护缓冲区和 `data_len`。本章只有进程上下文中的读写回调，互斥锁可以在竞争时睡眠，符合这里的使用场景。中断上下文和其他同步方式会在后续并发章节中再展开。

### 4.2 open、read 与 write

`open` 已经把设备保存到 `private_data`。`read` 读取时需要尊重文件位置：第一次读返回数据，读到末尾后再次调用返回 0，用户程序据此理解为 EOF。

```c
static ssize_t vchar_read(struct file *file, char __user *buf,
                          size_t count, loff_t *ppos)
{
    struct vchar_device *vdev = file->private_data;
    size_t available, bytes;
    ssize_t ret;

    if (*ppos < 0)
        return -EINVAL;

    mutex_lock(&vdev->lock);
    if ((size_t)*ppos >= vdev->data_len) {
        ret = 0;
        goto out;
    }

    available = vdev->data_len - (size_t)*ppos;
    bytes = min(count, available);
    if (copy_to_user(buf, vdev->data + *ppos, bytes)) {
        ret = -EFAULT;
        goto out;
    }

    *ppos += bytes;
    ret = bytes;
out:
    mutex_unlock(&vdev->lock);
    return ret;
}
```

回调参数 `buf` 带有 `__user` 标记，表示它来自用户地址空间。内核不能把它当作普通指针直接解引用；`copy_to_user()` 完成受检查的数据复制。成功时返回实际复制的字节数，失败时返回负错误码。

本例规定每次 `write` 都替换原有内容，并把文件位置重置为 0，便于同一文件描述符立即读回：

```c
static ssize_t vchar_write(struct file *file, const char __user *buf,
                           size_t count, loff_t *ppos)
{
    struct vchar_device *vdev = file->private_data;
    char temp[VCHAR_BUFFER_SIZE];

    if (count == 0)
        return 0;
    if (count > sizeof(temp))
        return -EMSGSIZE;
    if (copy_from_user(temp, buf, count))
        return -EFAULT;

    mutex_lock(&vdev->lock);
    memcpy(vdev->data, temp, count);
    vdev->data_len = count;
    mutex_unlock(&vdev->lock);

    *ppos = 0;
    return count;
}
```

`copy_from_user()` 返回非零时，本例报告 `-EFAULT`，不会把不完整内容写进设备。成功写入要返回已经接收的字节数；错误地返回 0 会让普通程序误以为没有取得进展并继续重试。

### 4.3 注册和清理

初始化函数按“设备号、cdev、class、device”的顺序建立资源，失败时沿相反方向撤销：

```c
static int __init vchar_init(void)
{
    struct vchar_device *vdev = &vchar;
    int ret;

    mutex_init(&vdev->lock);
    memcpy(vdev->data, "vchar is ready\n", 15);
    vdev->data_len = 15;

    ret = alloc_chrdev_region(&vdev->devt, 0, 1, "vchar");
    if (ret)
        return ret;

    cdev_init(&vdev->cdev, &vchar_fops);
    vdev->cdev.owner = THIS_MODULE;
    ret = cdev_add(&vdev->cdev, vdev->devt, 1);
    if (ret)
        goto err_unregister;

    vdev->class = class_create("vchar");
    if (IS_ERR(vdev->class)) {
        ret = PTR_ERR(vdev->class);
        goto err_cdev;
    }

    vdev->device = device_create(vdev->class, NULL, vdev->devt,
                                 NULL, "vchar0");
    if (IS_ERR(vdev->device)) {
        ret = PTR_ERR(vdev->device);
        goto err_class;
    }

    pr_info("vchar: registered major=%u minor=%u\n",
            MAJOR(vdev->devt), MINOR(vdev->devt));
    return 0;

err_class:
    class_destroy(vdev->class);
err_cdev:
    cdev_del(&vdev->cdev);
err_unregister:
    unregister_chrdev_region(vdev->devt, 1);
    return ret;
}

static void __exit vchar_exit(void)
{
    struct vchar_device *vdev = &vchar;

    device_destroy(vdev->class, vdev->devt);
    class_destroy(vdev->class);
    cdev_del(&vdev->cdev);
    unregister_chrdev_region(vdev->devt, 1);
    pr_info("vchar: removed\n");
}

module_init(vchar_init);
module_exit(vchar_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Minimal virtual character device");
MODULE_AUTHOR("LongWay");
```

完整文件中，`vchar_fops` 应放在初始化函数之前，或先提供声明。`vchar_read`、`vchar_write`、`vchar_open` 与前面的实现一起组成 `vchar.c`。清理顺序和注册顺序相反，因为每一层都依赖上一层已经存在的对象。

## 5. 编译、加载并观察设备节点

### 5.1 使用上一章的构建环境

在 `vchar.c` 同目录创建 `Kbuild`：

```make
obj-m += vchar.o
```

可以复用上一章的 Makefile，也可以直接执行：

```sh
make -C "$KERNEL_BUILD" M="$PWD" \
  ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" modules
```

把 `vchar.ko` 复制到目标板后加载：

```sh
sudo insmod ./vchar.ko
dmesg | tail -n 20
grep vchar /proc/devices
ls -l /dev/vchar0
readlink -f /sys/class/vchar/vchar0
```

日志应显示动态分配的主次设备号。`/proc/devices` 证明字符设备号已注册，`/sys/class/vchar/vchar0` 证明设备模型对象存在，`ls -l` 输出开头的 `c` 表示字符设备节点，随后两个数字应与日志中的 major/minor 一致。

如果 sysfs 设备存在而 `/dev/vchar0` 没出现，先确认 rootfs 是否挂载 devtmpfs，以及 udev/mdev 是否处理了 uevent。在知道日志中的主设备号后，可以为实验临时创建节点：

```sh
sudo mknod /dev/vchar0 c <major> 0
```

`<major>` 必须替换为本次动态分配的真实值。

### 5.2 用用户程序验证 read 和 write

下面程序打开设备、写入一句话，再从同一文件描述符读回：

```c
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(void)
{
    const char message[] = "hello from userspace";
    char buffer[128];
    ssize_t written, received;
    int fd;

    fd = open("/dev/vchar0", O_RDWR);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    written = write(fd, message, sizeof(message) - 1);
    if (written < 0) {
        perror("write");
        close(fd);
        return 1;
    }

    received = read(fd, buffer, sizeof(buffer) - 1);
    if (received < 0) {
        perror("read");
        close(fd);
        return 1;
    }

    buffer[received] = '\0';
    printf("written=%zd, read=%zd, data=\"%s\"\n",
           written, received, buffer);
    close(fd);
    return 0;
}
```

使用目标板对应的用户空间工具链编译；若板上有编译器，也可原生编译：

```sh
${CROSS_COMPILE}gcc -Wall -Wextra -O2 -o vchar_test vchar_test.c
./vchar_test
```

预期 `written` 和 `read` 都等于字符串长度，`data` 为 `hello from userspace`。随后执行 `cat /dev/vchar0`，新的打开实例会从文件位置 0 读取当前内容；读到 `data_len` 后回调返回 0，`cat` 正常结束。

测试完成后卸载模块：

```sh
sudo rmmod vchar
dmesg | tail -n 20
test ! -e /dev/vchar0 && echo "device node removed"
```

## 6. VFS 在 open 时做了什么

字符设备核心实现位于 Linux 6.12 的 `fs/char_dev.c`，`struct cdev` 的公开定义位于 `include/linux/cdev.h`。文件系统解析到字符设备 inode 后，通用字符设备打开函数根据 inode 中的设备号查找 `cdev`，取得 `cdev->ops`，再把当前 `struct file` 的操作替换为驱动注册的 `file_operations`。此后 `read()` 和 `write()` 不再重复查设备号，直接从 `file->f_op` 进入 `vchar_read` 和 `vchar_write`。

这解释了几个容易混淆的现象。`cdev_add()` 没成功时，设备号到回调的映射不存在，即使手工创建同名节点，`open()` 也不能进入本驱动。反过来，如果 `cdev` 已注册但没有 `device_create()`，内核映射已经存在，只是用户空间没有自动生成节点。节点的 major/minor 如果和 `vdev->devt` 不一致，VFS 会寻找另一段映射，文件名再正确也没有意义。

读写返回值同样属于 VFS 约定。`read` 返回正数表示取得字节，返回 0 表示到达当前数据末尾，返回负数表示错误；`write` 返回正数表示消费的用户字节。准确的返回值让应用知道应该继续、结束还是处理错误。

本例在持有 mutex 时执行 `copy_to_user()`。mutex 允许睡眠，因此这在当前简单进程上下文中成立；它也意味着较慢的用户复制会暂时阻塞另一个读写者。后续并发章节会讨论怎样根据数据路径和执行上下文选择保护方式。现在先建立基本认识：用户指针通过 uaccess helper 访问，共享状态使用一致的保护，回调准确报告处理的字节。

## 7. 从虚拟缓冲区走向真实硬件

用户程序现在不需要知道 `vchar` 在内核里只是一个静态缓冲区。它只看到 `/dev/vchar0`，并使用普通文件调用完成数据交换。VFS 管理打开实例，设备号找到 `cdev`，`cdev` 提供 `file_operations`，驱动回调再访问自己的设备对象。

这个虚拟设备刻意没有寄存器、GPIO 和中断。这样可以先把字符设备框架本身讲清楚，不把“文件操作如何进入驱动”和“硬件如何改变电平”混成一个问题。下一篇会把内存缓冲区换成真实 LED：`write()` 的数据不再只保存在数组里，而会改变 RV1126 板上的引脚状态。

## 8. 参考资料

- [Linux 6.12 `fs/char_dev.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/fs/char_dev.c?h=v6.12)
- [Linux 6.12 `include/linux/cdev.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/cdev.h?h=v6.12)
- [Linux Device Drivers: Driver Model Class](https://docs.kernel.org/driver-api/driver-model/class.html)
- [野火：Linux 字符设备驱动](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_character_device.html)
