---
title: "嵌入式知识体系 · USB 驱动开发实战 #08 · USB 问题排查：从枚举失败到传输异常"
description: "USB 设备插上没反应、枚举到一半失败、驱动不绑定、bulk 传输超时、摄像头掉帧，这些问题在嵌入式 Linux 工程里非常常见。"
pubDate: "2026-08-18"
series: usb
order: 8
tags: ["USB", "Linux Driver"]
draft: false
---
USB 故障排查最浪费时间的方式，是看到“设备不能用”就同时修改设备树、驱动和应用。有效方法是找到最后一个已经成立的状态：控制器是否工作、端口是否检测连接、EP0 是否完成枚举、interface 是否绑定、URB 是否提交、class 协议是否正确。

本篇按证据层次组织工具和现象，所有命令都回答一个具体问题，不再附加通用排错清单。

## 先冻结环境，避免比较不同系统

记录内核版本、控制器驱动、拓扑、设备 VID/PID 和复现动作：

```bash
uname -a
lsusb -t
lsusb
lspci -k | grep -A3 -i usb
journalctl -kf
```

同一设备在 USB 2.0 Hub、USB 3.x 直连、不同线材或供电口下可能协商不同速度。先固定拓扑与线材，再比较日志；否则一次“修复”可能只是换了连接路径。

## 第一层：供电、角色、PHY 与连接检测

插入后内核完全无日志，优先检查 VBUS、GND、D+/D- 或 SuperSpeed pair、连接器、供电电流、Host/Device 角色和 PHY。开发板还要核对 clock/reset/regulator、`dr_mode`、Type-C role switch 或 ID/VBUS 检测。

Hub 端口能报告 connect 但 reset 失败，说明软件已经看到电气连接，问题缩小到信号质量、速度握手、Device 固件或 PHY。反复 connect/disconnect 常见于供电跌落、接触不良和 EMI，不应先修改 interface driver。

## 第二层：EP0 枚举和描述符

`dmesg` 中常见错误要结合阶段解释：

- `-71`（EPROTO）常见于 PID/CRC/bitstuff/握手等协议错误或信号问题；
- `-110`（ETIMEDOUT）表示预期响应未到，可能是 Device 固件卡住、地址切换错误或传输未完成；
- `-32`（EPIPE）表示 STALL，标准请求或 endpoint 状态不被设备接受；
- `-19`（ENODEV）常见于传输期间设备消失。

使用 usbmon 抓取 EP0：

```bash
sudo modprobe usbmon
sudo cat /sys/kernel/debug/usb/usbmon/0u
```

Wireshark 可直接打开 usbmon 接口，把 Setup packet 解码成 `GET_DESCRIPTOR`、`SET_ADDRESS`、`SET_CONFIGURATION`。找到最后一个成功请求，再检查下一请求的 setup 字段、返回长度和 status。枚举阶段不需要先解码 UVC/MSC 数据。

描述符错误用原始字节确认：

```bash
lsusb -v -d vid:pid
hexdump -C /sys/bus/usb/devices/1-2/descriptors
```

重点检查 `bLength`、`wTotalLength`、interface/endpoint 数量、IAD/Union 引用和 endpoint 类型。Device 固件日志应能对应 EP0 setup 与状态阶段。

## 第三层：interface 匹配和 probe

设备能被 `lsusb` 识别但没有功能节点，检查每个 interface 的 modalias 和 driver symlink：

```bash
find /sys/bus/usb/devices/1-2:1.* -maxdepth 1 -name modalias -o -name driver -ls
lsusb -t
modprobe -c | grep 'v1234p5678'
```

没有匹配可能是 id/class 不符；被错误驱动占用可以临时 unbind 验证；probe 返回错误则启用 dynamic debug：

```bash
echo 'file drivers/usb/* +p' | sudo tee /sys/kernel/debug/dynamic_debug/control
echo 'module demo_usb +p' | sudo tee /sys/kernel/debug/dynamic_debug/control
```

日志应标出 endpoint 解析、buffer/URB 分配、上层节点注册和回滚的具体步骤，而不是只有一条失败信息。

## 第四层：URB 是否进入 HCD 并正确完成

驱动绑定后传输超时，使用 usbmon/Wireshark 对照驱动日志。先确认请求方向、endpoint、长度和类型，再看 completion status 与 `actual_length`。

Bulk IN 短包可能是正常边界；STALL 需要按设备协议 clear halt/reset；持续 `-EPROTO/-EILSEQ` 更像链路或设备协议；`-ESHUTDOWN` 多发生在拔出或控制器关闭。若驱动日志显示提交成功但 usbmon 没有对应请求，应继续检查 HCD、runtime PM 和 endpoint 是否 enable。

内核 USB tracepoint 和 ftrace 可以确认 submit/complete 时间。不同内核暴露事件名称可能不同，先查看：

```bash
find /sys/kernel/tracing/events/usb -maxdepth 2 -type f 2>/dev/null
```

不要在生产系统盲目打开所有 trace；选择 URB submit/complete 和目标 bus/device，控制日志量。

## 第五层：Class 协议和用户接口

`/dev/ttyACM0` 存在但不能通信，继续检查 CDC line coding、control line state 和 bulk 数据；U 盘出现但 I/O 失败，要区分 BOT/UAS transport、SCSI sense 和文件系统；摄像头掉帧要检查 UVC Probe/Commit、altsetting、iso packet status、带宽和 V4L2 buffer。

这时 usbmon 与类工具要一起使用：

```bash
v4l2-ctl --all -d /dev/video0
arecord --dump-hw-params -D hw:1,0 /dev/null
udevadm info /dev/ttyACM0
```

用户节点只证明上层子系统注册成功，不证明数据路径、协议状态和性能正确。

## 拔出、休眠和恢复是独立测试场景

热拔出压力测试要覆盖 I/O 进行中拔出、反复打开关闭、进程退出、suspend/resume 和 runtime PM。KASAN、lockdep 和 kmemleak 能发现引用与锁问题；`usb_kill_urb`/anchor、kref 和 disconnect 标志是审计重点。

恢复后设备地址和 interface 对象可能重建，应用不能永久缓存 sysfs 路径或 minor。设备固件 remote wakeup、Host autosuspend 与 class driver PM 回调也必须形成闭环。

## 小结

USB 排错是一条从物理连接到 class 协议的证据链：无连接日志先查硬件/角色，EP0 失败看 setup 与描述符，枚举成功后看 interface 匹配，驱动绑定后看 URB，节点出现后再看 class 协议。usbmon、Wireshark、dynamic_debug 和 tracepoint 各自回答不同层次的问题。下一篇进入 Host 控制器和设备树，解释为何 root hub 都没有出现时上述上层工具无从发挥。
