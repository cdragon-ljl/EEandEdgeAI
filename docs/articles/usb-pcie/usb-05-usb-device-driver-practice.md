---
title: "嵌入式知识体系 · USB 驱动开发实战 #05 · USB 设备驱动实践：从匹配到数据收发"
description: "前面几篇已经把 USB 架构、描述符、Linux USB 驱动框架和 URB 讲过了。这一篇把这些知识串起来，完成一个最小可运行的 USB 设备驱动实践。"
pubDate: "2026-08-18"
series: usb-pcie
order: 5
tags: ["USB", "Linux Driver"]
draft: false
---
前面几篇已经把 USB 架构、描述符、Linux USB 驱动框架和 URB 讲过了。这一篇把这些知识串起来，完成一个最小可运行的 USB 设备驱动实践。

这类实践的目标不是一上来就写 UVC 摄像头、USB 声卡这种复杂驱动，而是先掌握一条最核心的链路：**设备匹配 → probe 初始化 → 端点解析 → URB 提交 → 用户态访问 → disconnect 清理**。

只要这条链路跑通，后面面对真实 USB 外设时，就不会只停留在看 `lsusb` 的层面，而是能真正进入驱动代码。

## 一、实践目标

这一篇的目标是写一个面向自定义 bulk 设备的最小 USB 驱动。它具备以下能力：

- 通过 VID/PID 匹配设备
- 在 `probe()` 中解析 bulk IN / bulk OUT 端点
- 保存设备私有数据
- 向用户态暴露一个字符设备接口
- 支持基本读写
- 拔出设备时安全释放资源

实际项目里，很多 USB 调试器、采集设备、私有协议外设，本质上都是类似思路。

## 二、为什么选择 bulk 设备作为练习对象

USB 有 control、bulk、interrupt、isochronous 四种传输方式。学习驱动时，bulk 是最适合入门实践的一类。

原因很简单：

- 比 control 更接近真实数据通路
- 比 interrupt 更适合大块数据
- 比 isochronous 更容易保证可靠性
- 不涉及复杂音视频时序

bulk 传输常用于：

- U 盘
- 调试下载器
- 采集设备
- 自定义通信设备

## 三、驱动整体结构

一个 USB bulk 驱动通常包含以下结构：

```mermaid
flowchart LR
    A[usb_driver 注册] --> B[id_table 匹配]
    B --> C[probe 初始化]
    C --> D[解析 endpoint]
    D --> E[注册字符设备]
    E --> F[用户态 read/write]
    F --> G[提交 URB 或同步 bulk 消息]
    G --> H[disconnect 清理]
```

工程上你应该重点关注三件事：

1. 端点是否找对
2. 缓冲区生命周期是否安全
3. 拔出时是否还有未完成访问

## 四、最小驱动骨架

```c
#include <linux/module.h>
#include <linux/usb.h>
#include <linux/slab.h>

#define USB_VENDOR_ID   0x1234
#define USB_PRODUCT_ID  0x5678

struct demo_usb {
    struct usb_device *udev;
    struct usb_interface *interface;
    unsigned char bulk_in_ep;
    unsigned char bulk_out_ep;
    size_t bulk_in_size;
    unsigned char *bulk_in_buf;
    struct mutex lock;
};

static const struct usb_device_id demo_table[] = {
    { USB_DEVICE(USB_VENDOR_ID, USB_PRODUCT_ID) },
    { }
};
MODULE_DEVICE_TABLE(usb, demo_table);
```

这里的私有结构体保存了驱动运行所需的关键资源：USB 设备对象、接口对象、端点地址、缓冲区和锁。

## 五、probe：驱动接管设备的入口

`probe()` 是设备匹配成功后的入口。它必须完成端点解析和资源初始化。

```c
static int demo_probe(struct usb_interface *interface,
                      const struct usb_device_id *id)
{
    struct demo_usb *dev;
    struct usb_host_interface *iface_desc;
    struct usb_endpoint_descriptor *endpoint;
    int i;

    dev = kzalloc(sizeof(*dev), GFP_KERNEL);
    if (!dev)
        return -ENOMEM;

    dev->udev = usb_get_dev(interface_to_usbdev(interface));
    dev->interface = interface;
    mutex_init(&dev->lock);

    iface_desc = interface->cur_altsetting;

    for (i = 0; i < iface_desc->desc.bNumEndpoints; i++) {
        endpoint = &iface_desc->endpoint[i].desc;

        if (!dev->bulk_in_ep && usb_endpoint_is_bulk_in(endpoint)) {
            dev->bulk_in_size = usb_endpoint_maxp(endpoint);
            dev->bulk_in_ep = endpoint->bEndpointAddress;
            dev->bulk_in_buf = kmalloc(dev->bulk_in_size, GFP_KERNEL);
        }

        if (!dev->bulk_out_ep && usb_endpoint_is_bulk_out(endpoint)) {
            dev->bulk_out_ep = endpoint->bEndpointAddress;
        }
    }

    if (!(dev->bulk_in_ep && dev->bulk_out_ep && dev->bulk_in_buf)) {
        kfree(dev->bulk_in_buf);
        usb_put_dev(dev->udev);
        kfree(dev);
        return -ENODEV;
    }

    usb_set_intfdata(interface, dev);
    dev_info(&interface->dev, "demo usb device attached\n");
    return 0;
}
```

这段代码体现了 `probe()` 的关键原则：先申请资源，再检查端点，任何一步失败都要回滚。

## 六、读写接口的两种实现方式

USB bulk 传输可以通过同步接口或 URB 异步接口实现。

### 1. 同步 bulk 消息

适合简单驱动和调试验证。

```c
ret = usb_bulk_msg(dev->udev,
                   usb_rcvbulkpipe(dev->udev, dev->bulk_in_ep),
                   dev->bulk_in_buf,
                   dev->bulk_in_size,
                   &actual_len,
                   5000);
```

优点是代码简单，缺点是并发和吞吐能力有限。

### 2. 异步 URB

适合高吞吐或持续流式传输。

驱动提交 URB 后立即返回，完成后由回调函数处理数据。这种方式更接近真实产品驱动。

## 七、用户态接口怎么设计

最常见做法是注册字符设备，让用户态通过 `read()` / `write()` 访问。

对于教学驱动，可以先实现：

- `open()`：获取设备私有数据
- `read()`：从 bulk IN 读取数据
- `write()`：向 bulk OUT 写数据
- `release()`：释放用户态引用

真实项目里还可能加入：

- `ioctl()` 配置设备
- `poll()` 支持非阻塞等待
- `mmap()` 映射共享缓冲区

## 八、disconnect：拔出时必须安全收尾

```c
static void demo_disconnect(struct usb_interface *interface)
{
    struct demo_usb *dev = usb_get_intfdata(interface);

    usb_set_intfdata(interface, NULL);
    if (!dev)
        return;

    kfree(dev->bulk_in_buf);
    usb_put_dev(dev->udev);
    kfree(dev);

    dev_info(&interface->dev, "demo usb device disconnected\n");
}
```

如果驱动使用异步 URB，还必须在这里取消未完成 URB，避免设备拔出后回调继续访问已经释放的内存。

## 九、编译和加载

一个简单 Makefile 可以这样写：

```makefile
obj-m += demo_usb.o

KDIR ?= /lib/modules/$(shell uname -r)/build
PWD  := $(shell pwd)

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean
```

编译并加载：

```bash
make
sudo insmod demo_usb.ko
dmesg -w
```

查看设备是否绑定：

```bash
lsusb
usb-devices
ls /sys/bus/usb/drivers/
```

## 十、调试路径

### 1. probe 没触发

检查：

- VID/PID 是否写对
- 设备是否枚举成功
- 驱动模块是否加载
- 是否已被其他类驱动抢先绑定

### 2. probe 触发但返回失败

检查：

- 端点类型是否符合预期
- bulk IN / OUT 是否都存在
- 缓冲区是否分配成功

### 3. read/write 失败

检查：

- pipe 方向是否正确
- endpoint 地址是否正确
- timeout 是否太短
- 设备固件是否真的响应

### 4. 拔出后崩溃

检查：

- 是否还有未完成 URB
- 用户态 fd 是否仍在访问
- 私有数据是否提前释放
- 是否缺少引用计数保护

## 十一、验证清单

交付一个 USB 设备驱动前，至少确认：

- `lsusb` 能看到设备
- `dmesg` 能看到 probe 日志
- 端点解析结果正确
- read/write 能完成一次闭环
- 设备拔出不会崩溃
- 模块卸载不会资源泄漏
- 异常路径有完整释放逻辑

## 十二、小结

这一篇把 USB 驱动从理论推进到实践。真正有用的不是记住一段模板，而是建立一条完整链路：

**匹配设备 → 接管接口 → 解析端点 → 建立传输 → 暴露接口 → 安全清理**。

只要这条链路清楚，后续面对真实 USB 外设时，就能从枚举、端点、URB、用户态接口几个方向系统排查，而不是只会看设备有没有插上。

> 🏷️ USB驱动 / bulk传输 / probe / disconnect / endpoint / URB / 字符设备

---

## 初学者扩展讲解


## 最小 USB 驱动实验应该怎么做

写第一个 USB 驱动时，不建议一开始就做复杂设备。可以选择一个已知 VID/PID 的简单 USB 设备，只做枚举匹配和日志打印。第一步写 `usb_device_id` 表，第二步注册 `usb_driver`，第三步在 `probe()` 中打印接口号、端点数量和端点类型，第四步在 `disconnect()` 中释放资源。这样可以先确认驱动能不能绑定设备。

下一步再增加端点解析。驱动需要遍历当前 interface 的 endpoint descriptor，找到 bulk in、bulk out 或 interrupt in endpoint。找到以后，要保存 endpoint 地址、最大包长和轮询间隔。很多传输失败问题都来自端点找错，例如把 IN/OUT 方向写反，或者把 interrupt endpoint 当成 bulk endpoint 用。

再往后才是提交 URB 或使用 `usb_bulk_msg()`。同步接口适合最小验证，异步 URB 适合长期运行和高并发传输。初学时建议先用同步接口跑通，再改成异步 URB，并观察完成回调什么时候执行。


## USB 学习中的关键主线

USB 的核心主线可以概括为：Host 控制总线，Device 提供描述符，Interface 表示功能，Endpoint 承担数据通道，URB 表示一次传输请求。初学者只要把这五个词连成一条线，就能理解大多数 USB 驱动问题。

设备插入以后，Host 先检测到连接状态变化，然后复位端口，再读取设备描述符。设备描述符告诉系统这个设备的 VID、PID、USB 版本和最大包长等基本信息。接着系统继续读取配置描述符、接口描述符和端点描述符。配置描述符说明设备有几组配置；接口描述符说明设备暴露了哪些功能；端点描述符说明每个功能如何传输数据。

为什么很多 USB 驱动是按 interface 绑定，而不是按 device 绑定？因为一个 USB 设备可能是复合设备。例如一个 USB 摄像头可能同时包含视频接口、音频接口和控制接口；一个手机接到电脑上，可能同时提供 MTP、ADB、网络共享等功能。Linux 需要让不同接口绑定到不同驱动，所以 USB 驱动开发时经常看到的是 `struct usb_interface`，而不是只操作整个设备。

## 端点和传输类型要一步步理解

USB 端点有方向，IN 表示设备到主机，OUT 表示主机到设备。这个方向是从 Host 视角定义的，初学者很容易反过来理解。端点还有类型：control 用于控制传输，bulk 用于大块可靠数据，interrupt 用于小数据低延迟轮询，isochronous 用于音视频这类实时数据。

这里要特别注意：USB 的 interrupt transfer 不是 CPU 中断。它只是 USB 协议里的一种传输类型，由 Host 周期性查询设备端点。比如 USB 键盘鼠标常用 interrupt endpoint，是因为数据量小但希望延迟低；这和 PCIe 设备通过 MSI/MSI-X 触发 CPU 中断完全不是一回事。

## USB 排错的顺序

USB 排错建议按下面顺序走：

```bash
lsusb
lsusb -t
lsusb -v
dmesg -w
modprobe usbmon
```

`lsusb` 看设备是否枚举；`lsusb -t` 看拓扑、速率和驱动绑定；`lsusb -v` 看描述符是否符合预期；`dmesg` 看内核报错；`usbmon` 看传输细节。如果 `lsusb` 都看不到设备，优先查线材、供电、VBUS、OTG 模式和控制器驱动；如果 `lsusb` 能看到但驱动没绑定，再查 VID/PID、class/subclass/protocol 和模块是否加载；如果驱动绑定但传输失败，再看 URB 状态码、端点地址、包长、超时和设备协议。

## USB 驱动代码阅读建议

阅读 USB 驱动时，可以按函数调用顺序看。先看 `usb_device_id` 匹配表，确认它匹配的是 VID/PID 还是 class。再看 `usb_driver` 结构体，找到 `probe` 和 `disconnect`。进入 `probe` 后，重点看驱动如何解析 interface、如何找到 endpoint、如何分配私有结构体、如何注册字符设备或输入设备、如何提交 URB。最后看完成回调函数，因为真正的数据处理通常发生在 URB complete callback 里。

一个合格的 USB 驱动，不只是能提交 URB，还必须处理断开、超时、错误码、并发访问和资源释放。设备拔掉时如果还有 URB 在飞，驱动必须取消并等待完成，否则很容易出现 use-after-free 或内核崩溃。


## 面向初学者的阅读方法

刚开始学习这类驱动文章时，最容易犯的错误，是把每一个名词都当成孤立知识点去背。实际工程里，驱动不是由名词堆起来的，而是一条从硬件连接、总线枚举、内核匹配、资源申请、数据传输到用户态验证的完整链路。读这一篇时，建议先抓住三件事：第一，这个机制解决什么问题；第二，Linux 内核用什么对象表达它；第三，出现故障时应该从哪一层开始查。

例如看到“枚举”，不要只记住它叫 enumeration，而要理解为：系统需要先发现设备、识别设备能力、给设备分配地址或资源，然后才可能让具体驱动接管。看到“驱动匹配”，也不要只背 `probe()`，而要继续追问：是谁触发 `probe()`？匹配表里放了什么？设备还没有出现时驱动会不会执行？驱动执行以后第一步应该申请什么资源？这些问题连起来，才是真正能在板子上排错的知识。

## 从硬件到软件的完整路径

一条外设链路通常可以分成五层。第一层是硬件层，包括供电、时钟、复位、信号线、连接器和外设本身。第二层是总线层，也就是 USB、PCIe、I2C、SPI 这类协议如何发现设备、传输数据。第三层是内核框架层，Linux 会把设备抽象成 `struct device`、总线对象、驱动对象和资源对象。第四层是具体驱动层，驱动负责把通用框架和具体芯片寄存器、端点、队列、描述符连接起来。第五层是用户态验证层，包括命令行工具、测试程序、日志和性能统计。

初学者排错时不要一上来就怀疑驱动代码。设备没有被系统看到时，驱动代码通常还没有执行；驱动没有绑定时，可能是匹配表或描述符问题；驱动绑定了但不能传输时，才更可能进入 buffer、DMA、中断、同步和协议细节。按照这个顺序排查，可以避免在错误层面浪费时间。

## 建议准备的实验环境

学习 USB/PCIe 驱动，最好准备一台 Linux 主机、一块支持外设扩展的开发板，以及至少一个真实设备。USB 方向可以从 U 盘、USB 串口、USB 摄像头、USB 网卡开始；PCIe 方向可以从 NVMe、PCIe 网卡、PCIe 转串口卡、FPGA PCIe Endpoint 或开发板自带 PCIe 插槽开始。没有 PCIe 硬件时，也可以先通过 `lspci` 观察 PC 上已有设备，理解配置空间、BAR 和驱动绑定。

每次实验都建议记录四类信息：硬件连接照片或说明、内核版本和设备树/配置、关键命令输出、问题现象和解决过程。驱动学习的进步往往不是来自“看懂一段代码”，而是来自反复把现象、日志、源码和硬件状态对应起来。

## 常用观察命令

无论是 USB 还是 PCIe，都建议养成先看系统状态的习惯：

```bash
uname -a
dmesg -w
lsmod
cat /proc/interrupts
cat /proc/iomem
```

`uname -a` 用来确认内核版本；`dmesg -w` 用来实时观察设备插拔、枚举和驱动 probe 日志；`lsmod` 用来看模块是否加载；`/proc/interrupts` 用来看中断是否触发；`/proc/iomem` 可以帮助理解 MMIO 资源分配。不要小看这些基础命令，很多现场问题并不是复杂 bug，而是设备没枚举、驱动没加载、资源没分配或中断没到。

## 初学者最容易混淆的点

第一，不要把“用户态能看到设备节点”等同于“驱动完全正常”。设备节点只说明某个驱动创建了接口，真正的数据通路还要看读写、ioctl、mmap、poll、DMA 和中断是否正常。

第二，不要把“驱动 probe 成功”等同于“硬件已经工作”。probe 成功通常只代表资源申请和初始化基本完成，后续传输仍可能因为时钟、复位、buffer、协议状态或固件问题失败。

第三，不要把“命令没有报错”等同于“性能达标”。高速设备还要统计吞吐、延迟、CPU 占用、内存拷贝次数、DMA 是否真正生效，以及异常恢复是否可靠。

## 推荐的验证闭环

一篇驱动文章学完以后，不建议只停留在阅读层面。至少做一个小闭环：先用命令确认设备存在，再找到它绑定的驱动，然后观察内核日志，再做一次最小读写或传输测试，最后故意制造一个小错误，例如拔掉设备、改错匹配 ID、禁用模块或调整 buffer 数量，观察系统如何报错。只有经历过“正常路径”和“异常路径”，才能真正理解驱动框架为什么这样设计。
