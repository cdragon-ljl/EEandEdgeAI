---
title: "嵌入式知识体系 · Linux 驱动开发实战 #18 · Linux 电源管理、runtime PM、系统休眠与 watchdog"
description: "区分 runtime PM 与系统休眠的控制范围，理解 usage count、autosuspend、唤醒和 watchdog 恢复机制。"
pubDate: "2026-08-29"
series: linux-driver
order: 18
tags: ["Linux Driver", "Power Management", "runtime PM", "watchdog"]
draft: true
---

设备没有业务时仍保持时钟和电源，会增加功耗；系统进入 suspend 时，所有驱动还要按依赖顺序保存状态。runtime PM 与 system sleep 都涉及“暂停设备”，但触发者和范围不同。

## 1. runtime PM 管理运行系统中的空闲设备

驱动在 probe 完成硬件初始化后设置 autosuspend 并启用 runtime PM：

```c
pm_runtime_set_autosuspend_delay(dev, 500);
pm_runtime_use_autosuspend(dev);
pm_runtime_set_active(dev);
pm_runtime_enable(dev);
```

业务开始前 `pm_runtime_resume_and_get()` 增加 usage count 并确保设备 active；完成后 `pm_runtime_mark_last_busy()` 与 `pm_runtime_put_autosuspend()` 允许延迟休眠。计数不平衡会导致设备永不休眠或使用中断电。

## 2. runtime callback 控制设备资源

```c
static int demo_runtime_suspend(struct device *dev)
{
    demo_stop(dev);
    clk_disable_unprepare(demo->clk);
    return 0;
}

static int demo_runtime_resume(struct device *dev)
{
    int ret = clk_prepare_enable(demo->clk);
    if (ret)
        return ret;
    return demo_restore(dev);
}
```

回调需要可重复，失败时保持可解释状态。regulator、clock、reset 和 pinctrl 的顺序来自硬件手册，而不是固定模板。

## 3. system sleep 协调全系统

suspend 由 PM core 遍历设备依赖，调用 prepare/suspend/late/noirq 等阶段；resume 反向恢复。驱动可使用 `SET_SYSTEM_SLEEP_PM_OPS` 与 runtime PM helper 复用逻辑，但要区分唤醒源和系统状态。

支持 wakeup 的按键需要 `device_init_wakeup()` 和 `enable_irq_wake()`，并在恢复后解释唤醒原因。仅设置 DTS 的 wakeup 属性不等于整个 IRQ/power domain 路径都支持。

## 4. watchdog 是故障恢复而非省电

watchdog 由硬件倒计时，系统健康任务定期喂狗；内核或应用失去服务后，倒计时触发复位。它不能修复死锁，也不能替代故障日志。

```sh
wdctl /dev/watchdog0
cat /sys/class/watchdog/watchdog0/status 2>/dev/null
```

测试 watchdog 会复位设备，只能在可恢复测试环境进行，并确认启动后能读取 reset reason。

## 5. 记录功耗和状态变化

对 runtime PM 实验同时记录 usage、runtime_status、时钟/电源状态与外部电流。对系统 suspend 记录进入、唤醒和恢复后的第一次 I/O。低功耗成立的证据不是一条日志，而是设备状态和功耗同时变化。

下一篇进入 IIO/ADC，学习连续采样设备如何提供 raw、scale 和 buffer 接口。

## 6. 设计一个可重复的 PM 实验

先在 idle 状态记录 `runtime_status`、clock summary 和输入电流；执行一次真实 I/O，按固定间隔采样 active → autosuspend → suspended 的变化；随后再次 I/O，记录 resume 延迟与数据是否正确。测试期间不要用持续轮询工具无意中保持设备 active。

```sh
cat /sys/bus/platform/devices/<device>/power/runtime_status
cat /sys/bus/platform/devices/<device>/power/runtime_usage
cat /sys/bus/platform/devices/<device>/power/autosuspend_delay_ms
```

系统 suspend 实验则分别覆盖无唤醒源、按键唤醒和设备繁忙三种状态。串口日志要能区分 suspend callback、noirq 阶段、wakeup reason 和 resume callback。恢复后执行与 suspend 前相同的功能测试，而不是只确认 shell 重新出现。

watchdog 测试单独进行：记录 timeout、喂狗进程、停止喂狗时间、复位时间和下次启动的 reset reason。这样才能判断复位来自 watchdog 而非掉电或其他异常。

## 7. 参考资料

- [Runtime PM](https://docs.kernel.org/power/runtime_pm.html)
- [System Sleep](https://docs.kernel.org/power/devices.html)
- [Watchdog API](https://docs.kernel.org/watchdog/watchdog-api.html)
- [野火：电源管理](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_power_management.html)
