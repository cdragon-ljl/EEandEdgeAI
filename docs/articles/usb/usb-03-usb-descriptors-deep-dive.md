---
title: "嵌入式知识体系 · USB 驱动开发实战 #03 · USB 描述符深度解析"
description: "做 USB 驱动时，很多问题表面看是 `probe()` 没进、端点找不到、bulk 传输超时、摄像头没有 `/dev/videoX`，但往根上追，往往都能回到同一个基础问题：**描述符没有看懂**。"
pubDate: "2026-08-18"
series: usb
order: 3
tags: ["USB", "Linux Driver"]
draft: false
---
描述符是 Device 在 EP0 上提供的自描述数据。Linux 能把同一物理设备拆成多个 interface、为 endpoint 建立 pipe，并自动加载类驱动，前提是这串变长字节流内部一致。很多“能枚举但驱动异常”的根因，不在驱动 API，而在 `bLength`、总长度、interface 归属或 class-specific descriptor。

本篇从描述符公共头开始，逐层解释 Device、Configuration、Interface、Endpoint、IAD、BOS 和类描述符，并说明 Linux 如何保存和解析它们。

## 每个描述符先由 `bLength` 和类型自证边界

所有标准描述符前两个字节都是 `bLength` 和 `bDescriptorType`。解析器不能假设结构体天然对齐，也不能在未知类型上固定前进某个 C 结构体大小；它必须验证 `bLength >= 2`、不超过剩余缓冲，再移动到下一个描述符。

多字节字段使用 little-endian，例如 VID/PID、`bcdUSB` 和 `wTotalLength`。Linux 结构体常使用 `__le16`，读取时通过相应转换宏，避免在不同 CPU endian 上产生歧义。

损坏的 `bLength = 0` 会让遍历无法前进，错误的 `wTotalLength` 会让 Host 少读或越界解析。设备固件即使能响应 `GET_DESCRIPTOR`，也不代表描述符树有效。

## Device Descriptor 只说明设备级身份

Device Descriptor 固定 18 字节，包含 USB 版本、EP0 最大包长、设备级 class/subclass/protocol、VID/PID、设备版本、字符串索引和配置数量。

`bDeviceClass == 0` 常表示 class 在各 interface 中声明，不表示“没有 class”。复合设备可能使用 Miscellaneous + IAD，也可能让每个 interface 独立声明。Linux 的 interface driver 匹配不能只看 Device Descriptor。

`bMaxPacketSize0` 决定 EP0 包长。Host 枚举早期先读取部分 Device Descriptor 正是为了得到它。高速及更新规范对编码有特殊规则，固件应使用 USB IP 与协议栈要求的值，而不是从 bulk endpoint 包长复制。

## Configuration 是一棵连续字节树

Configuration Descriptor 的 `wTotalLength` 覆盖自身及其下所有 Interface、Endpoint 和 class-specific descriptor。Host 通常先读取 9 字节配置头，再按总长度读取完整树。

Interface Descriptor 使用 `bInterfaceNumber` 标识接口，用 `bAlternateSetting` 表示同一接口的可选带宽/endpoint 组合。一个 interface 在任一时刻只有一个 altsetting 生效；UVC/UAC 常用 alt 0 表示零带宽，再切换到带 isochronous endpoint 的 altsetting。

Endpoint Descriptor 给出 `bEndpointAddress`、`bmAttributes`、`wMaxPacketSize` 和 `bInterval`。高速 periodic endpoint 的额外 transaction 信息也编码在最大包字段中。驱动应使用 `usb_endpoint_is_bulk_in()` 等 helper 判断类型和方向，避免手写位运算遗漏细节。

```text
Configuration
  Interface 0 alt 0
    class-specific descriptors
    Endpoint 0x81 interrupt IN
  Interface 1 alt 0
  Interface 1 alt 1
    class-specific descriptors
    Endpoint 0x02 isochronous OUT
```

## IAD 把多个 interface 声明为一个功能

Interface Association Descriptor（IAD）用 first interface + count 把连续 interface 组合成一个 function，并给出 function class/subclass/protocol。CDC ACM 常用 control interface 和 data interface 组成一个功能；视频设备也可能由控制和流 interface 组成。

缺少或错误的 IAD 可能导致 Host 把 interface 当作无关功能，类驱动配对失败。IAD 必须出现在所关联第一个 Interface Descriptor 之前，interface 编号范围必须连续且存在。

Linux 仍为每个 interface 创建对象，类驱动再根据 union/function 描述符找到伙伴 interface。IAD 不会把多个 endpoint 自动合并成一个 interface。

## BOS 描述 USB 2.0 之后的设备能力

BOS（Binary Object Store）包含一个 BOS 头和若干 Device Capability。USB 2.0 Extension、SuperSpeed capability、Container ID、Platform Capability 等不适合塞进固定 Device Descriptor，因此通过 BOS 扩展。

WebUSB 和 Microsoft OS 2.0 descriptor 常借助 Platform Capability 提供 vendor code 或 descriptor set 信息。Host 是否读取这些能力取决于 USB 版本与平台；固件必须保证 capability 长度、UUID 和后续 vendor request 一致。

Linux 在 `struct usb_device` 中保留 BOS 解析结果。排查 SuperSpeed 功能或平台 capability 时，不能只看 `lsusb -v` 的配置树。

## Class-specific descriptor 决定真正协议

HID Report Descriptor、CDC functional descriptor、UVC/UAC 的 class-specific Interface/Endpoint Descriptor 都使用各自规范。通用 usbcore只负责保存 extra bytes，类驱动解释其中语义。

在 Linux 驱动中，`cur_altsetting->extra`、endpoint extra 或 helper `usb_get_extra_descriptor()` 可用于查找指定类型。解析时仍必须验证长度和引用关系，例如 CDC Union Descriptor 指向的 master/slave interface 是否存在。

不要把 class-specific descriptor 强制转换成结构体后直接信任所有字段。来自外部设备的描述符是非可信输入，长度、索引、数量和乘法都需要边界检查。

## 用工具把原始字节与 Linux 对象对应起来

```bash
lsusb -v -d vid:pid
usb-devices
hexdump -C /sys/bus/usb/devices/1-2/descriptors
```

sysfs `descriptors` 文件提供原始字节，`lsusb -v` 给出解码结果。遇到 `config descriptor too short`、`invalid descriptor` 或类驱动拒绝绑定时，先对照 offset 检查 `bLength` 和总长度，再检查 interface/endpoint 数量是否与实际字节一致。

抓包时观察 `GET_DESCRIPTOR` 的 `wValue`、`wIndex`、`wLength` 和实际返回长度。短包可以正常终止控制读，但返回数据仍必须形成完整合法描述符。Device 固件修改描述符后应冷插拔或重置设备，避免 Host 缓存旧配置影响判断。

## 小结

描述符不是静态资料表，而是 Linux 构建 USB 对象和驱动匹配关系的输入协议。`bLength` 保证字节流前进，Device Descriptor 给出设备级身份，Configuration 树组织 interface/altsetting/endpoint，IAD 关联复合功能，BOS 与 class-specific descriptor 扩展能力。下一篇将使用这些 endpoint 信息构造 URB，并解释异步传输如何在拔出和取消中保持安全。
