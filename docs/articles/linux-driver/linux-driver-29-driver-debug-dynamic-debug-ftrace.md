---
title: "嵌入式知识体系 · Linux 驱动开发实战 #29 · 驱动调试：日志、dynamic debug、tracepoint 与 ftrace"
description: "从可复现现象出发，按层次建立假设，选择日志、dynamic debug、tracepoint、ftrace 和源码证据定位驱动故障。"
pubDate: "2026-08-29"
series: linux-driver
order: 29
tags: ["Linux Driver", "Debug", "dynamic debug", "ftrace"]
draft: false
---

调试不是把所有日志打开，而是回答一个逐渐缩小的问题：设备没被发现、没匹配、probe 失败、数据路径没启动，还是运行一段时间后状态错误？工具应服务于假设。

## 1. 先把现象写成可重复条件

记录硬件 revision、kernel/DTB/rootfs/firmware 版本、启动方式、操作步骤、期望与实际结果，以及首次异常前后的完整日志。只写“偶发失败”无法比较修复。

## 2. 按层次寻找第一个断点

以 I2C 设备为例：供电和波形、DTS/live tree、i2c_client、driver link、probe 日志、寄存器事务、上层接口。找到最后一个确定成功的层，再检查下一层，避免同时改 DTS、clock 和驱动。

```mermaid
flowchart LR
    A["硬件/电气"] --> B["固件描述"]
    B --> C["device/driver match"]
    C --> D["probe/resources"]
    D --> E["数据传输"]
    E --> F["用户接口"]
```

## 3. 日志应携带对象和状态

使用 `dev_err/dev_info/dev_dbg` 自动带设备名，错误路径打印操作和返回码。避免在高频中断逐包打印；使用 ratelimited helper 或计数。

dynamic debug 可以只打开目标文件：

```sh
echo 'file drivers/i2c/* +p' | sudo tee /sys/kernel/debug/dynamic_debug/control
echo 'module my_driver +p' | sudo tee /sys/kernel/debug/dynamic_debug/control
```

## 4. tracepoint 记录稳定事件

tracepoint 比临时 printk 更适合高频结构化事件。先查看可用事件：

```sh
mount -t tracefs nodev /sys/kernel/tracing 2>/dev/null || true
find /sys/kernel/tracing/events -maxdepth 2 -type d | head
echo 1 > /sys/kernel/tracing/events/irq/irq_handler_entry/enable
cat /sys/kernel/tracing/trace_pipe
```

事件字段、sequence 和统一 trace clock 能把中断、workqueue、DMA completion 与应用时间线对应起来。

## 5. ftrace 回答函数何时被调用

function/function_graph tracer 可观察目标函数和耗时：

```sh
echo function_graph > /sys/kernel/tracing/current_tracer
echo 'my_driver_*' > /sys/kernel/tracing/set_ftrace_filter
echo 1 > /sys/kernel/tracing/tracing_on
```

过滤范围要小，采集完成立即关闭。若问题是 CPU 热点而非调用时序，再选择 perf；若是竞争，使用 lockdep/KCSAN。

## 6. 让证据否定假设

每次实验只改变一个变量，并在记录中写明假设、预期证据和结果。找不到预期 trace 说明路径没有执行；执行了但状态错，再检查输入与 ownership。调试的进展是排除错误解释，而不是日志数量增加。

下一篇把这些方法用于工程化生命周期：故意触发 probe 失败、unbind、DMA 取消和长稳压力，证明驱动可以恢复。

## 7. 以“第二次启动失败”为例串起工具

先复现：第一次 stream/start 正常，stop 后第二次 start 超时。日志证明 probe 只执行一次，因此不是匹配问题；在 start/stop/IRQ completion 加 dynamic debug sequence，发现第二次没有 completion。启用 IRQ tracepoint 看到 IRQ 计数停止，再用 function_graph 确认 stop 路径关闭 clock 后 start 没有重新 enable。

修复后运行相同 start/stop 循环并比较同一组 sequence、IRQ 和函数 trace。这种流程中，每个工具只回答一个问题：日志定位状态，tracepoint 判断事件是否发生，ftrace 判断调用和耗时，源码解释为何状态未恢复。

## 8. 让调试改动可以撤销

临时日志和 debugfs 开关不应变成永久高频输出。保留真正有运维价值的 error counter/tracepoint，移除逐包 printk；把复现脚本和期望 signature 加入回归。一次修复只有在原始现象消失、无新 warning 且功能循环通过后才完成。

## 9. 参考资料

- [Dynamic debug](https://docs.kernel.org/admin-guide/dynamic-debug-howto.html)
- [Linux tracing](https://docs.kernel.org/trace/index.html)
- [ftrace](https://docs.kernel.org/trace/ftrace.html)
