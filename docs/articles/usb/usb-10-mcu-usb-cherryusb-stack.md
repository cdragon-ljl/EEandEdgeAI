---
title: "嵌入式知识体系 · USB 驱动开发实战 #10 · MCU USB 与 CherryUSB 协议栈"
description: "从 MCU USB Device/Host/OTG 控制器、endpoint FIFO、DMA 与 cache 出发，拆解 CherryUSB v1.6.1 的 core、class、DCD/HCD、OSAL、移植和最小示例。"
pubDate: "2026-08-25"
series: usb
order: 10
tags: ["USB", "MCU", "CherryUSB", "Embedded", "Protocol Stack"]
draft: false
---
MCU 上的 USB 与 Linux 使用同一套线缆、描述符和传输协议，但软件边界不同。没有 usbcore、driver core 和通用 HCD 帮你管理设备时，固件必须直接处理 USB IP 中断、endpoint/FIFO、DMA、枚举状态和 Class 协议。开源协议栈的价值，就是把“USB 规范公共逻辑”与“某个 MCU 的控制器寄存器”分开。

本篇固定使用 [CherryUSB v1.6.1](https://github.com/cherry-embedded/CherryUSB/tree/v1.6.1)，commit `c9625ffa773ad10b8824d1b5361bca2ccc1f3d1e`。内容同时覆盖 Device 与 Host，重点解释 core、class、port 和 OSAL 的契约，不绑定某块开发板。

## MCU USB IP 先决定角色、endpoint 和数据搬运能力

MCU USB 外设通常提供 Device、Host 或 OTG/dual-role 能力。Device 模式响应 Host 调度，管理 EP0 和若干 IN/OUT endpoint；Host 模式产生 SOF、端口 reset、地址和 token，并管理 channel/pipe；OTG 还要根据 ID/VBUS/Type-C 状态切换角色。

控制器实现可能是专用 USB FS device、DWC2、MUSB、ChipIdea 等。差异包括 endpoint 数量、FIFO 是否共享、是否有独立 DMA、setup packet 存放位置、Host channel 数、isochronous 支持和 cache 一致性要求。协议栈不能用一个寄存器驱动覆盖这些差异，因此需要 Device Controller Driver（DCD）和 Host Controller Driver（HCD）层。

Endpoint buffer 的生命周期尤其重要。DMA 读取 IN buffer 前要完成 CPU 写入和必要 cache clean；DMA 写 OUT buffer 后 CPU 读取前要 invalidate。Buffer 不能放在函数局部栈上后异步返回，也不能在 completion 前复用。

### Endpoint FIFO、DMA 与 cache 决定移植是否真的可用

有些 USB IP 为所有 endpoint共享 RX FIFO和多个 TX FIFO，需要按最大包长、burst和并发 endpoint分配；FIFO太小可能只在复合设备或高速流量下溢出。专用 FS Device IP 则可能使用 PMA/BDT，buffer地址和双缓冲规则完全不同。

DCD/HCD 的异步 API返回成功后，buffer仍由 USB IP/DMA拥有。带 D-cache MCU 必须按 cache line对齐，IN/Host OUT 前 clean，OUT/Host IN 完成后 invalidate，并避免同一 cache line混放 CPU 正在修改的其他对象。若 DMA区要求 non-cacheable，要在 linker/MPU中显式安排。

Setup packet、endpoint completion和 SOF 由 ISR上报。ISR 只提取硬件状态并调用 core event handler；Class文件系统、网络栈或长拷贝转到线程。把所有 class逻辑塞进 USB IRQ 会造成漏 SOF、NAK和其他实时中断抖动。

## CherryUSB 用四层把协议和硬件分开

```mermaid
flowchart TB
    APP[Application] --> CLASS[CDC MSC HID UVC UAC classes]
    CLASS --> CORE[Device core or Host core]
    CORE --> PORT[DCD usb_dc or HCD usb_hc]
    PORT --> IP[MCU USB IP registers FIFO DMA IRQ]
    CORE --> OSAL[OSAL thread semaphore mutex queue timer]
```

官方目录中，`core` 实现标准请求、枚举和总线对象；`class` 实现 CDC ACM、MSC、HID 等 Device/Host class；`port` 适配 DWC2、MUSB、EHCI、OHCI、ChipIdea 等 USB IP；`common` 提供描述符、错误码和公共 DCD/HCD/OSAL 接口；`osal` 适配 FreeRTOS、RT-Thread、NuttX 等环境；`demo` 提供组合示例。

Device core 可以裸机运行，Host 枚举、Hub 和阻塞/异步传输通常需要 OSAL 提供线程、信号量、mutex、消息队列、timer、临界区和内存。使用 FreeRTOS 时应检查 `osal/usb_osal_freertos.c` 对 stack size、priority 和 ISR API 的映射，而不是假设任意 OSAL 都有相同单位。

### Core、Port 和 OSAL 之间的数据所有权

Device core维护 bus、EP0 request、descriptor、interface/endpoint注册和 class回调；DCD只拥有当前硬件 transfer。Host core维护 bus/hubport、address、descriptor和 class object；HCD拥有提交中的 `usbh_urb`。

Host Hub线程通过 OSAL message queue接收端口变化，执行 debounce/reset/enumeration；同步 class API使用 semaphore等待 URB，异步 API通过 completion。FreeRTOS OSAL 中 stack size、priority、timeout单位与应用配置相关，`CONFIG_USBHOST_PSC_STACKSIZE` 不能直接照抄到所有 RTOS。

内存要区分协议对象、DMA descriptor和 payload。`usb_osal_malloc()` 适合普通对象，不保证 DMA属性；具体 DCD/HCD port应使用平台 DMA allocator或静态对齐区。Class demo能枚举不代表高速 DMA/cache路径正确。

## DCD 移植把 Device core 接到 USB 中断

公共 DCD 接口位于 [`common/usb_dc.h`](https://github.com/cherry-embedded/CherryUSB/blob/v1.6.1/common/usb_dc.h)。移植层实现 `usb_dc_init/deinit`、地址设置、endpoint open/close/stall，以及异步 `usbd_ep_start_write()`、`usbd_ep_start_read()`。

硬件 ISR 解析 controller 状态后必须调用 core 事件入口，例如：

- reset：`usbd_event_reset_handler()`；
- setup：`usbd_event_ep0_setup_complete_handler()`；
- IN 完成：`usbd_event_ep_in_complete_handler()`；
- OUT 完成：`usbd_event_ep_out_complete_handler()`；
- suspend/resume/connect/disconnect 对应事件 handler。

DCD 负责 packetization、FIFO/DMA 和硬件错误，core 负责 EP0 标准请求、描述符和 class 分发。若 setup bytes 或完成长度传错，表现会出现在枚举/class 层，但根因仍在 DCD。

### 从 reset 到 SET_CONFIGURATION 的 Device core 调用链

`usbd_initialize()` 注册 bus、调用 `usb_dc_init()` 并让控制器可响应。总线 reset 中断进入 `usbd_event_reset_handler()`，core清地址、配置和 endpoint状态；setup中断调用 `usbd_event_ep0_setup_complete_handler()`，core解析标准请求。

`GET_DESCRIPTOR` 从 `usbd_desc_register()` 提供的 descriptor集合取数据；`SET_ADDRESS` 通过 `usbd_set_address()` 协调状态阶段；`SET_CONFIGURATION` 打开已注册 interface/endpoint并向应用发送 configured event。Class/Vendor request按 recipient与 interface分发。

DCD 必须只在 transfer真正完成后调用 IN/OUT complete handler并报告准确 `nbytes`。短包、STALL、reset期间取消和 ZLP都属于 port契约；错误完成顺序会让 core误复用 buffer。

## Device 最小 CDC ACM 由描述符、interface 和 endpoint 组成

v1.6.1 的 CDC template 使用如下初始化顺序：

```c
usbd_desc_register(busid, &cdc_descriptor);
usbd_add_interface(busid,
    usbd_cdc_acm_init_intf(busid, &intf0));
usbd_add_interface(busid,
    usbd_cdc_acm_init_intf(busid, &intf1));
usbd_add_endpoint(busid, &cdc_out_ep);
usbd_add_endpoint(busid, &cdc_in_ep);
ret = usbd_initialize(busid, reg_base, usbd_event_handler);
```

描述符必须与注册的 interface/endpoint 对应。CDC ACM 需要控制和数据 interface；Host 发来的 line coding、control line state 由 class 回调处理。OUT endpoint 应预先调用 `usbd_ep_start_read()` 提供 buffer，IN 使用 `usbd_ep_start_write()` 异步发送，完成后才能复用。

把 CDC 换成 MSC 或 HID，core/DCD 不变，变化集中在描述符、class interface 和数据回调。MSC 还要实现 block read/write/capacity；HID 要提供 report descriptor；复合设备按描述符顺序注册多个 interface 和 endpoint。

### CDC、MSC、HID 的应用回调边界不同

CDC ACM 的 control interface处理 line coding/control line state，data interface通过 bulk endpoint收发字节。应用在 OUT complete后重新 `usbd_ep_start_read()`，IN complete后才能复用发送 buffer。

MSC Class把 CBW/SCSI请求转为 block read/write/capacity回调。回调必须遵守 block size、LBA范围和介质状态；若后端是 Flash，还要处理擦写、缓存和并发，不能在 USB IRQ中直接执行长擦除。

HID 需要 Report Descriptor与 endpoint report长度一致。应用发送 keyboard/mouse/custom report前检查 configured/suspend状态，remote wakeup还需 Host授权。

复合设备按 descriptor interface顺序调用多个 `usbd_add_interface()` 和 endpoint。Endpoint地址/FIFO冲突应在初始化阶段 assert，而不是等 Host枚举到一半失败。

## HCD 移植为 Host core 提供 root hub 和 URB

公共 HCD 接口位于 [`common/usb_hc.h`](https://github.com/cherry-embedded/CherryUSB/blob/v1.6.1/common/usb_hc.h)。移植层实现 `usb_hc_init/deinit`、frame number、root hub control、`usbh_submit_urb()` 和 `usbh_kill_urb()`。

`struct usbh_urb` 包含 hubport、endpoint descriptor、setup、buffer、length、timeout、iso frame 和 completion。HCD 把它映射到 Host channel/descriptor；timeout 为 0 时可走异步 completion，非零时由实现/上层提供等待语义。

Host 初始化入口是：

```c
int ret = usbh_initialize(busid, reg_base, usbh_event_handler);
```

它建立 bus、root hub、Hub 事件线程/队列并启动 HCD。端口连接后 Host core 执行 reset、读取描述符、分配地址、解析 interface，再从 `struct usbh_class_info` 中匹配 class driver，调用 connect/disconnect。应用不应在设备尚未枚举完成时直接猜 endpoint。

### Host 枚举和 Class 自动绑定的内部顺序

`usbh_initialize()` 创建 bus与 root hub，调用 `usb_hc_init()`，建立 Hub消息队列/线程。HCD检测端口变化后通知 Hub层；Hub线程完成供电等待、debounce、reset、读取前 8 字节 Device Descriptor、分配地址、读取配置树并创建 interface/endpoint。

每个 interface根据 class/subclass/protocol、VID/PID等在 `CLASS_INFO_DEFINE` 注册表中查找 `struct usbh_class_info`，匹配后调用对应 `struct usbh_class_driver` 的 connect，disconnect时反向停止 class URB与业务线程。

`usbh_submit_urb()` 的 timeout为 0 时常用于异步 completion，非零用于阻塞语义；port必须在 kill/timeout时保证 completion与硬件 descriptor收敛。Hub拔出后迟到 completion不得继续访问已释放 class/hport。

## Host CDC、MSC、HID 示例从 class connect 取得对象

CherryUSB Host class driver通过 `CLASS_INFO_DEFINE` 注册匹配信息。CDC serial、MSC 和 HID 连接后，demo 的 event handler 可获得 class 对象并创建业务线程：串口线程执行收发，MSC 访问 block/filesystem，HID 解析 report。

Host 侧必须为每个设备和 interface区分对象，Hub 拔出时停止业务线程/URB再释放 class。OSAL message queue 和 semaphore 负责把 ISR/HCD completion 交给线程，不能在中断里执行文件系统或长时间 class 处理。

## 移植时按硬件、core、class 三层验证

第一步只验证 USB IP 和 DCD/HCD：时钟、PHY、IRQ、FIFO、reset、SOF/port status 是否正确。Device 可先确认 EP0 reset/setup；Host 可先确认 root port connect/reset。

第二步验证 core：Device 抓取 `GET_DESCRIPTOR/SET_ADDRESS/SET_CONFIGURATION`，Host 打印枚举状态和原始描述符。第三步才验证 CDC/MSC/HID class 和业务数据。

常见问题包括：

- `usb_config.h` 的 endpoint/channel/buffer 数量小于描述符或设备需求；
- DMA buffer 未对齐或 cache 维护缺失；
- endpoint 地址与 DCD FIFO 配置不一致；
- ISR 没有调用对应 core event handler；
- OSAL stack size/priority 单位映射错误；
- Host class 已 disconnect，业务线程仍使用旧对象。

官方配置模板见 [`cherryusb_config_template.h`](https://github.com/cherry-embedded/CherryUSB/blob/v1.6.1/cherryusb_config_template.h)，STM32 与 ESP32 示例分别见 [cherryusb_stm32](https://github.com/CherryUSB/cherryusb_stm32) 和 [cherryusb_esp32](https://github.com/CherryUSB/cherryusb_esp32)。移植应从与 USB IP 相同的 port 开始，而不是只按 MCU 品牌选择文件。

## 从 EP0 到压力测试的分层验收

Device 先测 reset/setup/descriptor/address/configuration，再测单个 CDC/HID endpoint，随后复合设备、长传输、短包/ZLP、suspend/resume、反复插拔和 cache/DMA压力。

Host 先测 root port connect/reset，再打印原始描述符与 class匹配，随后 CDC/MSC/HID基本操作、外部 Hub、多设备、timeout/kill、拔出、低/全/高速组合。每层保留 controller IRQ counter、core event、URB和 class日志。

逻辑分析仪/USB analyzer能区分 MCU没有发包、Host没有调度和协议 STALL；内存 watchpoint/cache关闭对比可定位 DMA一致性。禁止日志后性能测试还要记录 CPU、IRQ、FIFO underrun/overrun和数据校验，不只看枚举成功。

## 小结

MCU USB 开发的关键是把协议状态、Class 逻辑和 USB IP 分层。CherryUSB v1.6.1 用 Device/Host core 实现公共协议，用 class 实现 CDC/MSC/HID 等功能，用 DCD/HCD 适配寄存器、FIFO、DMA 和 IRQ，用 OSAL 适配线程同步。`usbd_initialize` 和 `usbh_initialize` 是两条角色主线，可靠移植则必须从控制器事件一路验证到 core，再进入 class。
