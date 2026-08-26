---
title: "嵌入式知识体系 · USB 驱动开发实战 #07 · USB 类驱动：HID、CDC、Mass Storage 与 UVC"
description: "写 USB 驱动时，很多人第一反应是“我要给这个设备写一个专用驱动”。但在 USB 体系里，很多设备并不需要从零写私有驱动，因为它们遵循标准类规范，Linux 已经提供了成熟的类驱动。"
pubDate: "2026-08-18"
series: usb
order: 7
tags: ["USB", "Linux Driver"]
draft: false
---
USB Class 的价值是让设备用标准描述符和协议表达功能，Host 无需为每个 VID/PID 编写新驱动。Linux 仍按 interface 匹配，但 HID、MSC、CDC ACM、UVC/UAC 对 endpoint、控制请求、数据边界和上层子系统的要求完全不同。

本篇不把类驱动写成名称清单，而是比较它们如何从描述符进入 Linux 对象，再把 USB 数据接入 input、SCSI、TTY、V4L2 或 ALSA。

## HID：Report Descriptor 决定数据位含义

HID Interface Descriptor 指向 HID Descriptor，后者给出 Report Descriptor 长度。Report Descriptor 用 item 描述 Usage Page、Usage、Report Size/Count、Input/Output/Feature；interrupt endpoint 只搬运 report 字节，本身不知道哪个 bit 是按键或坐标。

Linux `usbhid` 解析 report descriptor，创建 `hid_device`，再映射到 input 或 hidraw。Boot Protocol 键盘/鼠标提供简化固定格式，但复杂设备使用 Report Protocol 和 Report ID。

排查 HID 时，`lsusb -v` 只能看到 HID descriptor，真正字段要从 debugfs hid report descriptor 或 usbmon 数据解析。报告长度与 endpoint max packet 不一致、Report ID 遗漏、logical min/max 错误都可能造成事件异常。

HID Report Descriptor 是一台小型虚拟机式的数据声明：Global item 设置 Usage Page、Logical Min/Max、Report Size/Count，Local item选择 Usage，Main item声明 Input/Output/Feature。Report ID 不为 0 时，每个 report 首字节携带 ID；Host buffer 长度和解析必须包含它。

控制请求 `GET_REPORT/SET_REPORT` 处理 Feature/Output，`SET_IDLE` 控制重复上报，`SET_PROTOCOL` 在 Boot/Report Protocol 间切换。键盘 BIOS 场景依赖 Boot Protocol，复杂传感器通常只支持 Report Protocol。错误的 Report Count/Size 可能让 endpoint 字节能收到却无法映射 input event。

调试可查看 `/sys/kernel/debug/hid/*/rdesc`、`hid-recorder`/hidraw 与 usbmon，对照 Report Descriptor 计算每个字段 bit offset，不要仅凭十六进制 payload 猜键位。

## MSC：USB bulk 传输之上仍有存储命令协议

传统 Mass Storage Bulk-Only Transport 使用一个 bulk OUT、一个 bulk IN。Host 发送 CBW（命令块封装），设备执行 SCSI 命令并传输数据，最后返回 CSW（命令状态封装）。Linux `usb-storage` 把设备接入 SCSI 中层，最终出现 `/dev/sdX`。

枚举成功、bulk endpoint 正常，不代表文件系统可用。还要区分 USB transport 错误、SCSI sense、分区和文件系统。STALL 后执行 Bulk-Only Reset 与 clear halt 是协议恢复的一部分。

高性能设备可能使用 UAS，它借助多个 stream/queue 提高并发，并由 `uas` 驱动而非 `usb-storage` 管理。设备 quirks 可能迫使 Linux 回退 BOT。

BOT 的一条命令严格经历 CBW、可选 Data、CSW。CBW 包含 signature、tag、data length、direction 和 SCSI CDB；CSW 回显 tag并给出 residue/status。Tag 不匹配或 CSW signature 错误意味着 transport失步，不是文件系统错误。

Endpoint STALL/phase error 的恢复通常执行 Mass Storage Reset、clear halt bulk IN/OUT，再重新同步 CBW/CSW。SCSI CHECK CONDITION 还要发 REQUEST SENSE，区分介质未就绪、写保护和硬件错误。

UAS 使用 USB streams 与 SCSI task management，允许多个 command并行和乱序完成；Linux `uas` 对 HCD stream/设备 quirks 有要求。不稳定设备可能通过 quirks 回退 `usb-storage` BOT。性能比较必须确认实际绑定模块与 queue depth。

## CDC ACM：两个 interface 共同形成串口功能

CDC ACM 通常包含 Communication Class interface 和 Data Class interface。控制 interface 提供 interrupt IN notification 和 line coding/control line state 请求，数据 interface 提供 bulk IN/OUT。IAD 或 Union Functional Descriptor 说明两者关系。

Linux `cdc_acm` 绑定后接入 TTY core，生成 `/dev/ttyACM*`。用户写串口参数时，驱动通过 class control request 发送 SET_LINE_CODING；bulk endpoint 才传实际字节流。

`/dev/ttyUSB*` 常来自 FTDI/CH34x/CP210x 等 vendor serial 驱动，不等于 CDC ACM。排错时先看 interface class 和绑定模块，再看设备节点名字。

控制面常见请求包括 `SET_LINE_CODING`、`GET_LINE_CODING`、`SET_CONTROL_LINE_STATE` 和 `SEND_BREAK`。Line coding 只是向设备传递期望波特率/格式，USB bulk 链路本身不按这个波特率发送；设备若桥接 UART 才据此配置 UART。

Interrupt IN notification 可上报 SERIAL_STATE（DCD/DSR/break/parity 等）。Control/Data interface通过 Union Functional Descriptor 或 IAD关联，驱动可能用 `usb_driver_claim_interface()` 占用伙伴。固件 interface 编号或 Union 引用错误，会出现控制节点绑定但 bulk data interface 被别的驱动占用。

`cdc_acm` 的 write buffer、read URB 与 TTY flip buffer构成异步链路。`ttyACM` 打开成功但无数据，要分别检查 class control、bulk endpoint、URB completion和下游 UART/协议。

## UVC：控制面和流数据面分属不同 interface

UVC 通常用 VideoControl interface 描述 Camera Terminal、Processing Unit 等 entity，用 VideoStreaming interface 的多个 altsetting 提供不同带宽。应用通过 V4L2 协商 format/frame/interval，驱动再执行 Probe/Commit 控制并切换 altsetting。

Linux `uvcvideo` 将 isochronous 或 bulk payload 解析成视频 frame，接入 V4L2 buffer queue。掉帧可能来自总线带宽、payload header、URB/packet 错误、用户 buffer 不足或传感器本身，不能只看 `/dev/video0` 是否存在。

```bash
v4l2-ctl --list-formats-ext -d /dev/video0
v4l2-ctl --stream-mmap=4 --stream-count=300 -d /dev/video0
```

Streaming 开始前，Host 在 VideoStreaming interface上执行 UVC Probe/Commit：先提交期望 format/frame/interval/payload，读取设备调整结果，再 Commit 固化。之后选择带宽足够的 Alternate Setting并提交 isochronous/bulk URB。

每个 UVC payload 有 header，包含 FID、EOF、PTS/SCR 和 error bit。`uvcvideo` 按 FID/EOF 将多个 USB packet组装成 frame；某个 iso packet status失败、payload error或 EOF 丢失都会影响一帧，而不一定让整条 URB status失败。

带宽错误应核对 `wMaxPacketSize` transaction bits、`bInterval`、altsetting和同一 Host controller 上其他 periodic endpoint。应用 buffer不足则出现在 V4L2 queue/drop，不应混为总线带宽。

## UAC：时钟、altsetting 与同步方式共同决定音频流

USB Audio Class 用 AudioControl interface 描述 clock/entity，用 AudioStreaming interface 描述 PCM format 和 endpoint。Isochronous endpoint 按帧持续传输，异步播放设备可能通过 feedback endpoint 调整 Host 发送速率。

Linux `snd-usb-audio` 接入 ALSA。设备能枚举但 `arecord/aplay` 失败时，要检查支持的 sample format/rate/channel、altsetting、clock source 和 feedback，而不是只看 endpoint 地址。

UAC 的 Clock Source/Selector、Feature Unit 与 Terminal entity形成控制拓扑。Host 选择 sample rate、channel/format和 Streaming altsetting后，iso endpoint持续搬 PCM。设备描述符声明的 rate 与实际 clock不一致会产生长期漂移。

同步类型决定速率控制：synchronous 跟随 USB SOF，adaptive 设备适应 Host，asynchronous 设备使用独立时钟并通过 feedback endpoint告诉 Host 实际消费速率。Feedback 格式与更新周期错误会造成周期性 underrun/overrun，即使每个 packet都成功。

Linux `snd-usb-audio` 日志、`/proc/asound/card*/stream*` 和 `arecord/aplay --dump-hw-params` 可核对 altsetting、endpoint、format和 rate。音频爆音要同时看 iso packet status、feedback和 ALSA XRUN。

## 标准 Class 与 Vendor Class 如何选择

HID 适合小型结构化控制数据，CDC ACM 适合串口式字节流，MSC 适合块设备，UVC/UAC 适合标准音视频生态。Vendor Class 提供最大协议自由，但 Host 需要 WinUSB/libusb 或自定义驱动，也要自行设计版本、边界、超时和恢复。

选择 class 应优先考虑 Host 生态和数据语义，不应仅因“免驱”强行套用。例如高吞吐采集若伪装成 HID，会受到 report 与 interrupt 调度限制；块存储若直接暴露自定义 bulk，则要重做缓存一致性和文件系统并发协议。

## 从 Linux 绑定结果反推 class 问题

```bash
lsusb -t
usb-devices
readlink /sys/bus/usb/devices/1-2:1.0/driver
```

没有绑定时检查 class/subclass/protocol、IAD/Union 和模块；已绑定但上层节点缺失时继续检查类驱动 probe 日志；节点存在但传输异常时进入 class control request 和数据 endpoint。`usbhid`、`usb-storage`、`cdc_acm`、`uvcvideo`、`snd-usb-audio` 的日志和 trace 各自对应不同协议层。

## 小结

USB Class 不只是预定义 endpoint 组合，而是描述符、控制请求、数据格式和 Linux 上层子系统的完整契约。HID 由 report 定义语义，MSC 在 bulk 上承载 SCSI，CDC ACM 组合控制/数据 interface，UVC/UAC 通过 altsetting 和 isochronous 调度传输媒体。下一篇将把这些层次用于系统排错，避免把所有故障都归为“USB 不稳定”。
