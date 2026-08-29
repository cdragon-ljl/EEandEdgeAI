---
title: "嵌入式知识体系 · Linux 驱动开发实战 #14 · Input 子系统、按键与触摸屏驱动"
description: "从私有按键协议迁移到 Input 事件模型，并理解按键、绝对坐标、多点触摸和 evdev 的连接。"
pubDate: "2026-08-29"
series: linux-driver
order: 14
tags: ["Linux Driver", "Input", "evdev", "Touchscreen"]
draft: true
---

第 13 篇的按键驱动自定义了事件结构，应用必须知道它的格式。键盘、鼠标、触摸屏和遥控器都需要报告输入，如果每个驱动都发明协议，桌面和嵌入式 GUI 无法复用。Input 子系统用 event type、code 和 value 统一描述输入。

## 1. input_dev 描述设备能报告什么

```c
input = devm_input_allocate_device(dev);
if (!input)
    return -ENOMEM;

input->name = "learning-button";
input->id.bustype = BUS_HOST;
input_set_capability(input, EV_KEY, KEY_ENTER);

ret = input_register_device(input);
```

`EV_KEY` 表示按键类事件，`KEY_ENTER` 表示按键含义。capability 让用户空间知道设备可能产生哪些 code，而不是等事件出现后猜测。

## 2. 中断线程报告一帧输入

```c
input_report_key(input, KEY_ENTER, pressed);
input_sync(input);
```

`input_report_key()` 添加事件，`input_sync()` 用 `EV_SYN/SYN_REPORT` 结束一帧。Input core 把事件交给 handler，常见 evdev 创建 `/dev/input/eventX`。驱动不再管理字符设备号、read 等待和 poll。

```sh
cat /proc/bus/input/devices
evtest /dev/input/eventX
```

通过设备名称和 capability 找到节点，再观察按下/释放事件，不要假设 event 编号固定。

## 3. 触摸屏使用绝对坐标

单点触摸通常报告 `EV_ABS`：

```c
input_set_abs_params(input, ABS_X, 0, max_x, 0, 0);
input_set_abs_params(input, ABS_Y, 0, max_y, 0, 0);
input_set_capability(input, EV_KEY, BTN_TOUCH);
```

每帧报告 X、Y 和触摸状态后调用 `input_sync()`。驱动报告的是控制器坐标，旋转、缩放和校准可由设备树属性、input transform 或用户空间处理，不能凭显示分辨率直接猜范围。

## 4. 多点触摸使用 slot

Type B 协议为每个接触点分配 slot：

```c
input_mt_slot(input, slot);
input_mt_report_slot_state(input, MT_TOOL_FINGER, active);
if (active) {
    input_report_abs(input, ABS_MT_POSITION_X, x);
    input_report_abs(input, ABS_MT_POSITION_Y, y);
}
input_mt_sync_frame(input);
input_sync(input);
```

tracking id 和 slot 让用户空间知道某根手指是否连续移动。驱动要正确处理控制器丢点、抬起和帧序号，不能只发送当前坐标。

## 5. Input 把硬件采集与应用协议分开

按键可能来自 GPIO 中断，触摸数据可能来自 I2C，但向上都成为 input_event。应用、libinput 或 GUI 框架只理解事件，不需要知道底层总线。

下一篇进入 I2C 子系统，解释触摸控制器或传感器驱动怎样取得 i2c_client、读写寄存器，并用 Regmap 减少重复代码。

## 6. 参考资料

- [Linux Input Programming](https://docs.kernel.org/input/input-programming.html)
- [Multi-touch protocol](https://docs.kernel.org/input/multi-touch-protocol.html)
- [野火：Input 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_input_subsystem.html)
- [野火：触摸驱动](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_touch_driver.html)
