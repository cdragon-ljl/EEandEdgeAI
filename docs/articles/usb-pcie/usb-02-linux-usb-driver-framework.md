---
title: "嵌入式知识体系 · USB 驱动开发实战 #02 · Linux USB 驱动框架"
description: "上一讲我们把 USB 的整体架构和枚举流程搭起来了。这一讲进入真正的驱动开发核心：**Linux USB 驱动框架**。"
pubDate: "2026-08-18"
series: usb-pcie
order: 2
tags: ["USB", "Linux Driver"]
draft: false
---
上一讲我们把 USB 的整体架构和枚举流程搭起来了。这一讲进入真正的驱动开发核心：**Linux USB 驱动框架**。

如果说上一讲解决的是“系统怎么认识一个 USB 设备”，这一讲解决的就是“内核怎么把这个设备交给正确的驱动，以及驱动怎么接管它”。USB 驱动不是简单的字符设备包装，也不是 platform 驱动那种“设备树节点对上就行”的模型，它的关键在于：**先匹配，再探测，再建立端点和传输通路**。

## 一、USB 驱动的核心思路

USB 设备插入后，Linux 内核会先完成枚举，解析出设备的 Vendor ID、Product ID、类信息和接口信息，然后在已注册驱动中寻找匹配项。匹配成功后，内核才会调用驱动的 `probe()`。

所以 USB 驱动最核心的两个回调是：

- `probe()`：设备绑定成功时调用
- `disconnect()`：设备拔出或解绑时调用

这两个回调构成了 USB 驱动最重要的生命周期。

## 二、USB 驱动为什么和其他驱动不一样

和 platform 驱动相比，USB 驱动的对象不是固定物理地址，而是一个被枚举出来的接口对象。和字符设备相比，USB 驱动不是天然就有 `open/read/write` 入口，它往往先通过内核 USB core 完成匹配，再决定如何把数据通路暴露给用户态。

换句话说，USB 驱动开发要同时理解三层逻辑：

1. **总线匹配**：怎么找到正确设备
2. **接口解析**：怎么找到正确接口和端点
3. **传输实现**：怎么把数据稳定传起来

## 三、Linux USB 驱动的基本结构

一个最小 USB 驱动通常围绕 `struct usb_driver` 定义：

```c
static const struct usb_device_id xxx_table[] = {
    { USB_DEVICE(0x1234, 0x5678) },
    { }
};
MODULE_DEVICE_TABLE(usb, xxx_table);

static int xxx_probe(struct usb_interface *interface,
                     const struct usb_device_id *id)
{
    return 0;
}

static void xxx_disconnect(struct usb_interface *interface)
{
}

static struct usb_driver xxx_driver = {
    .name       = "xxx_driver",
    .probe      = xxx_probe,
    .disconnect = xxx_disconnect,
    .id_table   = xxx_table,
};

module_usb_driver(xxx_driver);
```

这段骨架背后有几个关键点：

- `id_table` 负责告诉内核“我能匹配谁”
- `probe()` 负责“设备来了以后我怎么接管”
- `disconnect()` 负责“设备走了以后我怎么收尾”

## 四、id_table 是什么

`id_table` 可以理解为 USB 驱动的身份证匹配表。

### 1. 按 Vendor / Product 匹配

最常见的写法是：

```c
{ USB_DEVICE(0x1234, 0x5678) }
```

这表示这个驱动只接管某个厂商的某个产品。

这种方式适合：

- 厂商专用设备
- 调试板
- 自定义 USB 外设
- 私有协议设备

### 2. 按类匹配

USB 还有很多标准类驱动，例如 HID、Mass Storage、CDC、UVC。对于这类设备，驱动可以按类信息匹配，而不必只看某个固定 VID/PID。

### 3. 为什么有些设备不用你自己写 id_table

因为 Linux 内核已经提供了很多成熟的通用类驱动。比如 U 盘、键盘、鼠标、标准串口类设备，很多时候插上就能用，背后就是标准类规范和通用驱动在工作。

## 五、probe() 里应该做什么

`probe()` 是 USB 驱动真正的起点。设备被匹配成功后，内核会把控制权交给它。

典型工作包括：

1. 获取 `usb_device`
2. 保存驱动私有数据
3. 读取当前接口和 altsetting
4. 遍历端点
5. 判断端点类型和方向
6. 初始化 URB 或其他传输资源
7. 建立字符设备、netdev 或其他上层接口

一个常见的起步模板如下：

```c
static int xxx_probe(struct usb_interface *interface,
                     const struct usb_device_id *id)
{
    struct usb_device *udev = interface_to_usbdev(interface);
    struct usb_host_interface *cur_altsetting = interface->cur_altsetting;
    int i;

    for (i = 0; i < cur_altsetting->desc.bNumEndpoints; i++) {
        struct usb_endpoint_descriptor *ep;

        ep = &cur_altsetting->endpoint[i].desc;
        if (usb_endpoint_is_bulk_in(ep)) {
            /* 记录 bulk in 端点 */
        } else if (usb_endpoint_is_bulk_out(ep)) {
            /* 记录 bulk out 端点 */
        }
    }

    return 0;
}
```

### probe() 最重要的原则

`probe()` 不是“打印一下设备名”就结束的地方，而是驱动生命周期里最关键的资源接管点。你在这里要决定：

- 这个设备是否真的可用
- 端点是否符合预期
- 资源是否能正确分配
- 后续是否能稳定传输

如果 `probe()` 出错，应该及时返回错误码，不要强行让设备进入半初始化状态。

## 六、disconnect() 里应该做什么

`disconnect()` 是设备拔出时的回调。这个阶段最重要的不是“再做点什么功能”，而是**彻底释放资源**。

通常要处理：

- 取消未完成的 URB
- 停止异步传输
- 释放内存和私有结构体
- 注销字符设备或其他上层接口
- 清理引用计数

### 为什么热插拔特别危险

USB 设备是可以随时拔掉的。如果驱动里还有后台线程、workqueue、URB 完成回调或用户态引用没处理好，就很容易出现：

- 野指针
- 内核告警
- 内存泄漏
- 设备拔出后还继续访问旧对象

所以 USB 驱动必须非常重视生命周期管理。

## 七、接口 Interface 的意义

很多初学者会把 USB 设备理解成“一个设备一个驱动”，但实际情况往往是：**USB 驱动绑定的是接口，不一定是整个设备**。

这是因为很多设备本来就是复合设备：

- 一个接口负责控制
- 一个接口负责数据
- 一个接口负责音频
- 一个接口负责视频

因此，在 `probe()` 中你接收到的通常是 `struct usb_interface *interface`，而不是一个“裸设备”。

## 八、端点怎么找

真正的数据收发靠端点。你需要在 `probe()` 中遍历接口里的端点，判断它们是什么类型。

### 常见判断方法

```c
if (usb_endpoint_is_bulk_in(ep)) { }
if (usb_endpoint_is_bulk_out(ep)) { }
if (usb_endpoint_is_int_in(ep)) { }
if (usb_endpoint_is_isoc_in(ep)) { }
```

### 你要关注的几个维度

- 方向：IN 还是 OUT
- 类型：bulk / interrupt / isochronous / control
- 最大包长：影响吞吐和缓冲区设计
- 端点个数：决定是否能满足业务需求

很多 USB 驱动问题，根本原因不是代码逻辑错了，而是端点类型理解错了。

## 九、USB core 和驱动是怎么配合的

Linux 的 USB 子系统里，USB core 负责底层总线管理和驱动匹配，具体驱动负责设备行为。

USB core 做的事情包括：

- 枚举
- 解析设备对象
- 组织 interface
- 在驱动表中做匹配
- 调用 `probe()` / `disconnect()`

驱动做的事情包括：

- 初始化设备逻辑
- 选择端点
- 提交 URB
- 处理数据传输
- 暴露上层接口

可以把 USB core 理解成“交通规则”，驱动理解成“具体开车的人”。

## 十、一个最小 USB 驱动的生命周期

```mermaid
flowchart LR
    A[模块加载] --> B[注册 usb_driver]
    B --> C[USB core 开始匹配]
    C --> D[命中 id_table]
    D --> E[调用 probe]
    E --> F[初始化端点和资源]
    F --> G[设备正常工作]
    G --> H[设备拔出]
    H --> I[调用 disconnect]
    I --> J[释放资源]
```

这条主线一定要背下来。后面不管是 bulk 设备、HID、UVC，还是 gadget，核心生命周期都绕不开它。

## 十一、实际硬件上怎么验证

### 实验 1：观察现有 USB 设备

```bash
lsusb
lsusb -t
dmesg -w
```

重点看设备层级、驱动绑定和速率协商情况。

### 实验 2：插 USB 转串口

```bash
ls /dev/ttyUSB*
dmesg -w
```

观察系统是否加载串口驱动并创建设备节点。

### 实验 3：插 USB 摄像头

```bash
v4l2-ctl --list-devices
dmesg -w
```

观察视频类驱动是否接管成功。

### 实验 4：在支持 gadget 的板子上测试

尝试让开发板作为 USB Device 工作，验证：

- 串口 gadget
- 网卡 gadget
- 自定义 gadget

## 十二、调试 USB 驱动时看什么

### 1. dmesg

先看内核日志，确认 `probe()` 是否触发、端点是否正确、传输是否超时。

### 2. lsusb -v

看描述符细节，确认设备声明的能力是否与驱动预期一致。

### 3. usbmon

需要深入抓传输包时，用 usbmon 看控制请求、bulk 包和完成状态。

### 4. /sys 和 debugfs

很多 USB 总线信息都能从 sysfs 和 debugfs 进一步挖出来。

## 十三、几个最容易踩的坑

### 坑 1：只看 VID/PID，不看接口

复合设备经常不是整个设备绑定，而是某个接口绑定。

### 坑 2：端点类型判断错

把 bulk 当 interrupt，或者 IN/OUT 弄反，后面必然出问题。

### 坑 3：probe() 没做错误回滚

前面申请了资源，后面失败了却没释放，容易泄漏。

### 坑 4：热插拔没处理好

设备拔出后还访问旧对象，这是 USB 驱动最常见的稳定性问题之一。

### 坑 5：把 USB 当普通字符设备写

USB 驱动不是简单的 `open/read/write`，它先要走匹配和传输模型。

## 十四、把这一讲记成一句话

USB 驱动的核心不是“写一个会收发的程序”，而是：

**让 Linux 在设备插入后正确匹配它、接管它、找到端点、建立传输，并在拔出时安全释放。**

## 十五、小结

这一讲你应该掌握了：

- `struct usb_driver` 的作用
- `probe()` 和 `disconnect()` 的职责
- `id_table` 的匹配逻辑
- 接口和端点在驱动中的位置
- USB core 和驱动的协作方式
- 如何结合 `lsusb`、`dmesg`、`usb-devices` 做硬件验证

下一讲我们会继续深入 USB 描述符，把 Device Descriptor、Configuration Descriptor、Interface Descriptor 和 Endpoint Descriptor 逐个讲清楚。

---

## 初学者扩展讲解


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
