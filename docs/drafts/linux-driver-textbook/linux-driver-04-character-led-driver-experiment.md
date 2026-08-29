---
title: "嵌入式知识体系 · Linux 驱动开发实战 #04 · 字符设备 LED 驱动完整实验"
description: "把虚拟字符设备的 write 回调连接到已核实的 RV1126 LED GPIO，完成从原理图、设备树证据到用户程序控制的第一次硬件实验。"
pubDate: "2026-08-29"
series: linux-driver
order: 4
tags: ["Linux Driver", "Character Device", "GPIO", "LED", "RV1126"]
draft: true
---

上一篇的 `vchar` 把数据保存在内存里。用户写入 `/dev/vchar0` 后再读回，已经足以说明 VFS、`cdev` 和 `file_operations` 的连接没有问题，但它没有改变板上的任何东西。现在把同一条 `write()` 路径接到一只 LED 上：应用仍然只写一个设备文件，驱动却把这个字符转换为 GPIO 输出电平。

这是一项刻意收窄的实验。我们暂时使用已经核实的全局 GPIO 编号和旧式整数 GPIO 接口，只为看清“文件操作怎样到达一根引脚”。Linux 6.12 推荐的新代码使用 descriptor GPIO API，它需要由设备树或固件把 GPIO 作为资源交给驱动；这个模型会在第 11 篇完整建立。这里不提前假装已经有一个可移植的 DT 设备，也不把手工 GPIO 编号当作长期方案。

## 1. 先确认这只 LED 确实由哪根线控制

LED 不亮时，最危险的做法是随意换一个 GPIO 编号重试。LED 可能经过三极管或电平转换器，因而有高有效和低有效两种情况；同一 SoC 管脚也可能被复用为 UART、I2C 或摄像头复位。驱动代码只能控制 GPIO 控制器看见的逻辑线，不能替代原理图对 LED 网络、供电和有效电平的说明。

在当前 RV1126 SDK 中，先从开发板原理图记录 LED 的网络名、连接的 `GPIOx_Ay` 形式管脚和有效电平。再到实际参与启动的 DTS/DTSI 中搜索该网络名、`gpios`、`pinctrl` 和可能已经存在的 `gpio-leds` 节点。仓库的 `docs/articles/video-audio/src/rv1126-alientek-800p.dts` 虽然不是 LED 示例，却能说明这种证据如何出现：`&i2c1` 下的相机节点用 `pwdn-gpios = <&gpio2 RK_PA6 GPIO_ACTIVE_HIGH>;` 表达“GPIO 控制器、引脚、逻辑有效电平”三部分，并用 `pinctrl-0` 选择复用状态。它不能证明本板 LED 在 `gpio2` 或 `RK_PA6`，因此本篇不从它推导 LED 编号。

把核实结果写成下面的实验记录。尖括号不是可直接编译的数值，而是要求替换为当前板证据的字段：

```text
LED 网络名：<LED_NET>
SoC 管脚：<GPIOx_Ay>
逻辑有效电平：<0 或 1>
GPIO 控制器在 DTS 中的节点：<&gpioN>
当前 pinctrl 状态与占用者：<路径或节点名>
Linux 导出的全局 GPIO 编号：<LED_GPIO_NUMBER>
```

全局编号不是从 `GPIOx_Ay` 靠心算可靠得出的。gpiochip 的 base 可以随内核配置和启动探测顺序改变。若目标系统启用了 debugfs，可先挂载它并观察 GPIO 使用者：

```sh
sudo mount -t debugfs none /sys/kernel/debug 2>/dev/null || true
cat /sys/kernel/debug/gpio
```

输出会按 gpiochip 列出可见范围和已请求的线。将原理图中的 bank、pin 与这里的范围交叉核对，得到本次启动中真正的 `<LED_GPIO_NUMBER>`。若该行已有消费者，先回到 DTS 查清它是谁；不要让两个驱动同时改变一根线。没有 debugfs 时，可以在厂商内核的 GPIO 驱动、DTS 和启动日志中继续追踪。把这个限制写在实验前面，是为了让“点灯”成为一次可解释的硬件操作。

### 1.1 从字符到引脚电平的路径

本例把用户输入限制为 `0` 或 `1`。`1` 表示“点亮”，`0` 表示“熄灭”，它们是用户可见的逻辑状态；驱动依据 `active_low` 把逻辑状态翻译为实际输出电平。这样，低有效 LED 不会迫使用户记住“写 0 才亮”。

```mermaid
flowchart LR
    A["echo 1 > /dev/rv1126_led0"] --> B["ledchar_write"]
    B --> C["逻辑亮灭状态"]
    C --> D["active_low 翻译"]
    D --> E["GPIO 输出寄存器"]
    E --> F["板级 LED 电路"]
```

GPIO 控制器通常有方向、输出数据和输入数据等寄存器。把线设为输出，相当于允许控制器驱动这个引脚；改变输出值则让驱动级输出高或低。`gpio_direction_output()` 和 `gpio_set_value_cansleep()` 把寄存器布局留在 GPIO 子系统中，字符驱动不需要猜测 RV1126 的寄存器偏移。此处仍是整数 GPIO API，原因只是下一段代码需要显式展示“请求哪一根线”；第 11 篇会把这个整数替换为 `struct gpio_desc *`。

## 2. 把硬件动作放进已有的字符设备框架

下面的 `rv1126_led_char.c` 是完整的外部模块。它没有声明任何特定 RV1126 编号：加载参数 `led_gpio` 和 `active_low` 才是板级证据进入模块的位置。模块若没有得到有效 GPIO 编号会拒绝加载，避免意外操作 GPIO 0。

```c
#include <linux/cdev.h>
#include <linux/device.h>
#include <linux/fs.h>
#include <linux/gpio.h>
#include <linux/kernel.h>
#include <linux/module.h>
#include <linux/mutex.h>
#include <linux/string.h>
#include <linux/uaccess.h>

struct ledchar_device {
    dev_t devt;
    struct cdev cdev;
    struct class *class;
    struct device *device;
    struct mutex lock;
    bool on;
};

static struct ledchar_device ledchar;
static int led_gpio = -1;
static bool active_low;

module_param(led_gpio, int, 0444);
MODULE_PARM_DESC(led_gpio, "Verified global GPIO number for the LED");
module_param(active_low, bool, 0444);
MODULE_PARM_DESC(active_low, "True when a low output turns the LED on");

static int ledchar_set(struct ledchar_device *dev, bool on)
{
    int raw = on ^ active_low;

    gpio_set_value_cansleep(led_gpio, raw);
    dev->on = on;
    return 0;
}

static int ledchar_open(struct inode *inode, struct file *file)
{
    file->private_data = container_of(inode->i_cdev,
                                      struct ledchar_device, cdev);
    return 0;
}

static ssize_t ledchar_read(struct file *file, char __user *buf,
                            size_t count, loff_t *ppos)
{
    struct ledchar_device *dev = file->private_data;
    char state[8];
    int length;

    mutex_lock(&dev->lock);
    length = scnprintf(state, sizeof(state), "%u\n", dev->on);
    mutex_unlock(&dev->lock);
    return simple_read_from_buffer(buf, count, ppos, state, length);
}

static ssize_t ledchar_write(struct file *file, const char __user *buf,
                             size_t count, loff_t *ppos)
{
    struct ledchar_device *dev = file->private_data;
    char input[8];
    bool on;
    int ret;

    if (!count || count >= sizeof(input))
        return -EINVAL;
    if (copy_from_user(input, buf, count))
        return -EFAULT;
    input[count] = '\0';
    ret = kstrtobool(strim(input), &on);
    if (ret)
        return ret;

    mutex_lock(&dev->lock);
    ledchar_set(dev, on);
    mutex_unlock(&dev->lock);
    return count;
}

static const struct file_operations ledchar_fops = {
    .owner = THIS_MODULE,
    .open = ledchar_open,
    .read = ledchar_read,
    .write = ledchar_write,
    .llseek = no_llseek,
};

static int __init ledchar_init(void)
{
    struct ledchar_device *dev = &ledchar;
    int ret, idle_raw;

    if (!gpio_is_valid(led_gpio))
        return -EINVAL;

    mutex_init(&dev->lock);
    idle_raw = 0 ^ active_low;
    ret = gpio_request(led_gpio, "rv1126-led-char");
    if (ret)
        return ret;
    ret = gpio_direction_output(led_gpio, idle_raw);
    if (ret)
        goto err_gpio;

    ret = alloc_chrdev_region(&dev->devt, 0, 1, "rv1126_led");
    if (ret)
        goto err_gpio;
    cdev_init(&dev->cdev, &ledchar_fops);
    ret = cdev_add(&dev->cdev, dev->devt, 1);
    if (ret)
        goto err_region;
    dev->class = class_create("rv1126_led");
    if (IS_ERR(dev->class)) {
        ret = PTR_ERR(dev->class);
        goto err_cdev;
    }
    dev->device = device_create(dev->class, NULL, dev->devt, NULL,
                                "rv1126_led0");
    if (IS_ERR(dev->device)) {
        ret = PTR_ERR(dev->device);
        goto err_class;
    }

    pr_info("rv1126_led: gpio=%d active_low=%u major=%u\n", led_gpio,
            active_low, MAJOR(dev->devt));
    return 0;
err_class:
    class_destroy(dev->class);
err_cdev:
    cdev_del(&dev->cdev);
err_region:
    unregister_chrdev_region(dev->devt, 1);
err_gpio:
    gpio_free(led_gpio);
    return ret;
}

static void __exit ledchar_exit(void)
{
    struct ledchar_device *dev = &ledchar;

    ledchar_set(dev, false);
    device_destroy(dev->class, dev->devt);
    class_destroy(dev->class);
    cdev_del(&dev->cdev);
    unregister_chrdev_region(dev->devt, 1);
    gpio_free(led_gpio);
}

module_init(ledchar_init);
module_exit(ledchar_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Scoped RV1126 LED character-device experiment");
```

`gpio_request()` 是此实验唯一的硬件所有权声明：请求失败通常表示那根线已被别的消费者占用，或编号不属于当前内核可见 GPIO。`gpio_direction_output()` 同时设置方向和初始电平，避免先输出后写值造成短暂闪烁。`read()` 报告逻辑状态，`write()` 用 `kstrtobool()` 接受 `0`、`1`、`true`、`false` 等明确输入；`mutex` 让并发读写看到一致的 `on` 状态。这里尚未讨论中断、延迟任务或热解绑，它们会在相应章节与实际需要一起出现。

## 3. 编译、加载与用户空间控制

在同一目录放置 `Kbuild`：

```make
obj-m += rv1126_led_char.o
```

使用第 1 篇确认过的构建输出编译。`ARCH=arm` 只是本项目 RV1126 SDK 常见的 32 位场景；以实际构建日志中的值为准。

```sh
make -C "$KERNEL_BUILD" M="$PWD" \
  ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" modules
```

将 `rv1126_led_char.ko` 复制到板端，并把占位值替换为前面记录的证据。下面命令不会声称某块未接入的板已经点亮 LED；它们给出在已核实板上可以观察的过程。

```sh
sudo insmod ./rv1126_led_char.ko \
  led_gpio=<LED_GPIO_NUMBER> active_low=<0-or-1>
dmesg | tail -n 20
ls -l /dev/rv1126_led0
cat /sys/kernel/debug/gpio

printf '1\n' | sudo tee /dev/rv1126_led0
cat /dev/rv1126_led0
printf '0\n' | sudo tee /dev/rv1126_led0
cat /dev/rv1126_led0
```

加载后，日志应包含实际 GPIO 编号和动态分配的主设备号；`/dev/rv1126_led0` 的类型应为字符设备；debugfs GPIO 列表中该线的消费者应显示 `rv1126-led-char`。写入 `1` 后读取应得到 `1`，写入 `0` 后读取应得到 `0`。这证明的是驱动内部的逻辑状态和 GPIO 所有权；LED 的肉眼现象还要与原理图中的有效电平相符。若逻辑读回正确但 LED 没变化，不要先反转参数，应先测该 LED 网络电平并检查 pinctrl 复用、外部使能和板级电路。

为了把用户程序也放进实验，下面程序比 shell 更清楚地检查每次写入后的读取结果：

```c
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int set_and_read(int fd, const char *value)
{
    char state[8] = { 0 };
    ssize_t n;

    if (write(fd, value, strlen(value)) != (ssize_t)strlen(value))
        return -1;
    n = read(fd, state, sizeof(state) - 1);
    if (n < 0)
        return -1;
    printf("requested=%c reported=%s", value[0], state);
    return 0;
}

int main(void)
{
    int fd = open("/dev/rv1126_led0", O_RDWR);

    if (fd < 0 || set_and_read(fd, "1\n") || set_and_read(fd, "0\n")) {
        perror("rv1126_led0");
        return 1;
    }
    return close(fd) < 0;
}
```

用目标用户空间对应的工具链编译并运行：

```sh
${CROSS_COMPILE}gcc -Wall -Wextra -O2 -o led_test led_test.c
./led_test
sudo rmmod rv1126_led_char
```

卸载函数先把 LED 恢复到逻辑熄灭状态，再撤销设备节点、class、`cdev`、设备号和 GPIO 请求。若 `rmmod` 报模块正在使用，说明仍有进程打开设备；关闭该进程或文件描述符后再卸载。若系统没有自动创建设备节点，可以依照第 3 篇的真实 major 号临时 `mknod`，但应先解决 devtmpfs/udev 配置问题。

## 4. 从一次手工连接走向设备模型

这次 LED 驱动仍把三种不同职责放在同一个模块里：它知道字符设备名，自己请求 GPIO，还假定加载参数代表板级信息。实验短小正是它的优点，但这也解释了为什么“把硬件描述和驱动代码分开”很快会成为必要的问题。

下一篇先不增加 GPIO 细节，而是回头观察本例已经创建的 `class` 和 `device`：`/sys/class/rv1126_led/rv1126_led0` 为什么是一个链接，它最终指向的设备对象又如何与 bus 和 driver 相连。第 11 篇再以 descriptor GPIO API 取代本篇的全局 GPIO 编号，让设备树正式成为 GPIO 资源的来源。

## 5. 参考资料

- Linux Kernel Documentation, [GPIO Descriptor Consumer Interface](https://docs.kernel.org/6.12/driver-api/gpio/consumer.html)，说明新驱动使用的 descriptor 模型与旧 GPIO API 的迁移方向。
- Linux kernel stable source, [include/linux/gpio.h (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/gpio.h?h=v6.12) 与 [drivers/gpio/gpiolib.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/gpio/gpiolib.c?h=v6.12)。
- Linux kernel stable source, [fs/char_dev.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/fs/char_dev.c?h=v6.12)。
- 本项目 RV1126 DTS 样本，[rv1126-alientek-800p.dts](/D:/EEandEdgeAI/.worktrees/linux-driver-learning-path/docs/articles/video-audio/src/rv1126-alientek-800p.dts)，用于核对 GPIO 和 pinctrl 属性的写法，不作为 LED 引脚证据。
- EmbedFire, [Linux LED 灯实验](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_led_character_device.html)，用于课程实验的范围参考；本文的 API 取舍以 Linux 6.12 文档和源码为准。
