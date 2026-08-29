---
title: "USB 驱动开发实战 · Linux 6.12 系列框架"
description: "USB 协议、usbcore、设备驱动、Gadget、HCD 与调试的 14 篇学习顺序和资料策略。"
pubDate: "2026-08-29"
series: usb
order: 0
tags: ["USB", "Framework", "Linux 6.12"]
draft: true
---

本系列以 Linux 6.12 LTS 为代码基线，从总线协议逐步进入 usbcore 对象和驱动生命周期，再覆盖 Class、Gadget、Host Controller 与系统调试。

| 顺序 | 文章 | 学习目标 |
| --- | --- | --- |
| 01 | 总线拓扑、速度、事务与四类传输 | 建立 Packet/Transaction/Transfer 与总线时间模型 |
| 02 | 枚举状态机 | 走通 Hub、EP0、地址、配置与匹配调用链 |
| 03 | 描述符层级 | 掌握 TLV 防御解析和 Linux 对象映射 |
| 04 | Linux USB 子系统架构 | 分清 HCD、usbcore、Interface/Class Driver |
| 05 | usbcore 对象模型 | 明确 Device、Interface、Altsetting、Endpoint 所有权 |
| 06 | usbcore API 与 DMA | 根据上下文选择 Pipe、同步消息、URB 和缓冲 |
| 07 | URB 生命周期 | 处理 submit、completion、unlink、kill 与 poison |
| 08 | Interface Driver 生命周期 | 处理发布、open、PM、reset、disconnect 和 kref |
| 09 | HID Boot 与 Input | 从报告字节映射到 Linux Input Event |
| 10 | Vendor Bulk 字符驱动 | 组织异步 IN/OUT、FIFO、poll、背压和热插拔 |
| 11 | USB Class Driver | 比较 HID、MSC/UAS、CDC、UVC 与 UAC |
| 12 | Gadget 与 Composite | 理解 UDC、EP0、Function、ConfigFS 与 FunctionFS |
| 13 | xHCI、DWC3 与设备树 | 从硬件资源建立 HCD、Root Hub 和角色切换 |
| 14 | 调试与 CherryUSB 对照 | 构建 usbmon/trace/DMA 证据树并映射到 MCU 栈 |

资料优先级为 USB-IF 规范、Linux 6.12 文档与源码、相关开源项目固定版本。

野火资料只用于参考教学层次和知识展开方式，文章叙述、图示和示例源码均重新编写。
