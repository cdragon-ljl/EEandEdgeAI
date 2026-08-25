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

## MSC：USB bulk 传输之上仍有存储命令协议

传统 Mass Storage Bulk-Only Transport 使用一个 bulk OUT、一个 bulk IN。Host 发送 CBW（命令块封装），设备执行 SCSI 命令并传输数据，最后返回 CSW（命令状态封装）。Linux `usb-storage` 把设备接入 SCSI 中层，最终出现 `/dev/sdX`。

枚举成功、bulk endpoint 正常，不代表文件系统可用。还要区分 USB transport 错误、SCSI sense、分区和文件系统。STALL 后执行 Bulk-Only Reset 与 clear halt 是协议恢复的一部分。

高性能设备可能使用 UAS，它借助多个 stream/queue 提高并发，并由 `uas` 驱动而非 `usb-storage` 管理。设备 quirks 可能迫使 Linux 回退 BOT。

## CDC ACM：两个 interface 共同形成串口功能

CDC ACM 通常包含 Communication Class interface 和 Data Class interface。控制 interface 提供 interrupt IN notification 和 line coding/control line state 请求，数据 interface 提供 bulk IN/OUT。IAD 或 Union Functional Descriptor 说明两者关系。

Linux `cdc_acm` 绑定后接入 TTY core，生成 `/dev/ttyACM*`。用户写串口参数时，驱动通过 class control request 发送 SET_LINE_CODING；bulk endpoint 才传实际字节流。

`/dev/ttyUSB*` 常来自 FTDI/CH34x/CP210x 等 vendor serial 驱动，不等于 CDC ACM。排错时先看 interface class 和绑定模块，再看设备节点名字。

## UVC：控制面和流数据面分属不同 interface

UVC 通常用 VideoControl interface 描述 Camera Terminal、Processing Unit 等 entity，用 VideoStreaming interface 的多个 altsetting 提供不同带宽。应用通过 V4L2 协商 format/frame/interval，驱动再执行 Probe/Commit 控制并切换 altsetting。

Linux `uvcvideo` 将 isochronous 或 bulk payload 解析成视频 frame，接入 V4L2 buffer queue。掉帧可能来自总线带宽、payload header、URB/packet 错误、用户 buffer 不足或传感器本身，不能只看 `/dev/video0` 是否存在。

```bash
v4l2-ctl --list-formats-ext -d /dev/video0
v4l2-ctl --stream-mmap=4 --stream-count=300 -d /dev/video0
```

## UAC：时钟、altsetting 与同步方式共同决定音频流

USB Audio Class 用 AudioControl interface 描述 clock/entity，用 AudioStreaming interface 描述 PCM format 和 endpoint。Isochronous endpoint 按帧持续传输，异步播放设备可能通过 feedback endpoint 调整 Host 发送速率。

Linux `snd-usb-audio` 接入 ALSA。设备能枚举但 `arecord/aplay` 失败时，要检查支持的 sample format/rate/channel、altsetting、clock source 和 feedback，而不是只看 endpoint 地址。

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
