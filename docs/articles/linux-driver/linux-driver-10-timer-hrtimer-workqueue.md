---
title: "嵌入式知识体系 · Linux 驱动开发实战 #10 · 内核定时器、hrtimer、workqueue 与延迟任务"
description: "从一个可重新安排的延迟动作理解 jiffies、timer、hrtimer 与 delayed_work 的回调上下文，并正确取消异步工作。"
pubDate: "2026-08-29"
series: linux-driver
order: 10
tags: ["Linux Driver", "jiffies", "timer_list", "hrtimer", "workqueue"]
draft: false
---

上一章的 LED 状态不只会被当前的 sysfs 写入修改。驱动还经常需要表达“再过一会儿做一次”：上电后延迟初始化、等待外设复位完成、通信超时，或把一次中断后的较重工作推迟到合适的上下文。这里最危险的误解是把延迟 API 当成普通的 `sleep()`：驱动安排回调后会立即继续执行，而回调将来可能和 `remove()` 同时发生。

本章围绕一个单次“延迟报告”动作展开。加载模块后它安排一次日志；修改模块参数会把到期时间重新安排；卸载则保证这个动作已经取消或完全结束。这个小实验不需要 GPIO，因而可在与运行内核匹配的任意测试系统上复现。它先建立 callback 生命周期的直觉，再比较 `timer_list`、`hrtimer` 和 `delayed_work` 各自适合的时间尺度与执行上下文。

## 1. jiffies 是内核的粗粒度时间尺

`jiffies` 是随时钟 tick 增加的全局节拍计数。`HZ` 表示每秒 tick 数，因此 `msecs_to_jiffies(250)` 能把 250 毫秒转换为适合普通内核定时器的延迟值。不要自己写 `HZ / 1000 * ms`：它既可能丢失精度，也没有处理溢出和不同配置。

`jiffies` 会回绕，比较未来时间不能写成普通的 `if (jiffies > deadline)`。内核提供 `time_after()`、`time_before()` 等宏，以有符号差值处理回绕。大多数驱动不必直接比较它们，因为 `mod_timer()` 与 `queue_delayed_work()` 已经接收相对延迟；知道这个规则仍然有用，它解释了为何内核时间代码总是使用这些专门宏。

普通 timer 的到期不是硬实时承诺。若系统忙、tick 有合并或回调等待 CPU，实际执行可晚于请求时间。LED 闪烁、保活超时和延迟初始化通常在意“不要早于这个时刻”，而不要求纳秒级边沿，因此比起追求小数点后的时间，先选择正确的执行上下文更重要。

## 2. 三种延迟机制回答三个不同问题

### 2.1 `timer_list` 负责在 jiffies 到期时通知

`struct timer_list` 用 `timer_setup()` 初始化，`mod_timer()` 安排或修改到期时间。它的回调运行在原子上下文，不能睡眠，也不应做长操作。它适合在到期时设置超时标志、轻量更新状态，或把工作提交给 workqueue：

```c
static void timeout_fn(struct timer_list *timer)
{
    struct device_state *state = from_timer(state, timer, timeout);

    set_bit(STATE_TIMED_OUT, &state->flags);
    schedule_work(&state->recover_work);
}

timer_setup(&state->timeout, timeout_fn, 0);
mod_timer(&state->timeout, jiffies + msecs_to_jiffies(500));
```

`mod_timer()` 也可以用于已经 pending 的 timer，因此比“先删除、再添加”的手工序列更适合反复重排。销毁拥有 timer 的对象前使用 `del_timer_sync()`，它不仅尝试删除尚未到期的 timer，还会等待正在执行的 timer 回调结束。

### 2.2 `hrtimer` 表达更精细的到期时间

`hrtimer` 以 `ktime_t` 表示时间，并能在平台和内核配置支持时使用高分辨率时钟事件。初始化和启动的形状如下：

```c
hrtimer_init(&state->pulse_timer, CLOCK_MONOTONIC, HRTIMER_MODE_REL);
state->pulse_timer.function = pulse_timer_fn;
hrtimer_start(&state->pulse_timer, ms_to_ktime(2), HRTIMER_MODE_REL);
```

回调同样处在不允许睡眠的环境。它返回 `HRTIMER_NORESTART` 表示单次动作结束；周期性计时器需要在回调中用 `hrtimer_forward_now()` 推进下一次到期，并返回 `HRTIMER_RESTART`。高分辨率表示计时基础更细，不表示回调可以任意晚、任意长，或能越过调度延迟。若需求是给 GPIO 产生严格波形，通常还要审视硬件 PWM、实时性和 SoC 时钟能力，而不是仅把 `timer_list` 换成 hrtimer。

### 2.3 `delayed_work` 把“何时”和“在哪做”放在一起

`struct delayed_work` 由一个延迟 timer 和一个普通 `work_struct` 组成。到期的 timer 只负责把 work 放进工作队列，真正的 work 函数在进程上下文执行，因此可以拿 mutex、访问可能睡眠的 GPIO 扩展器，或进行较长的协议处理。它适合本章的“到期后输出报告”以及多数延迟设备初始化任务。

`delayed_work` 并不让数据天然安全。它只是改变回调执行的位置；与第 09 篇相同，若 sysfs、IRQ 和 work 都访问状态，仍要由 mutex、spinlock 或原子变量说明谁保护什么。

## 3. 一个能重新安排的延迟动作

下面的外部模块 `delay_action.c` 不操作硬件。参数 `delay_ms` 在加载时决定第一次到期；模块加载完成后，写入 `/sys/module/delay_action/parameters/delay_ms` 会把尚未执行的动作改到新的相对延迟。它也演示了一个容易遗漏的细节：模块参数在 `init` 之前就可能被设置，所以参数回调只能在 `live` 为真时重排已经初始化的 work。

```c
#include <linux/jiffies.h>
#include <linux/module.h>
#include <linux/mutex.h>
#include <linux/workqueue.h>

static DEFINE_MUTEX(control_lock);
static struct delayed_work report_work;
static unsigned int delay_ms = 1000;
static bool live;

static void report_fn(struct work_struct *work)
{
    unsigned int delay;

    mutex_lock(&control_lock);
    delay = delay_ms;
    mutex_unlock(&control_lock);
    pr_info("delay_action: fired after requested %u ms\n", delay);
}

static int delay_ms_set(const char *value, const struct kernel_param *kp)
{
    unsigned int next;
    int ret;

    ret = kstrtouint(value, 0, &next);
    if (ret)
        return ret;

    mutex_lock(&control_lock);
    delay_ms = next;
    if (live)
        mod_delayed_work(system_wq, &report_work,
                         msecs_to_jiffies(delay_ms));
    mutex_unlock(&control_lock);
    return 0;
}

static const struct kernel_param_ops delay_ms_ops = {
    .set = delay_ms_set,
    .get = param_get_uint,
};
module_param_cb(delay_ms, &delay_ms_ops, &delay_ms, 0644);
MODULE_PARM_DESC(delay_ms, "Delay before the one-shot report");

static int __init delay_action_init(void)
{
    INIT_DELAYED_WORK(&report_work, report_fn);

    mutex_lock(&control_lock);
    live = true;
    mod_delayed_work(system_wq, &report_work, msecs_to_jiffies(delay_ms));
    mutex_unlock(&control_lock);
    pr_info("delay_action: armed\n");
    return 0;
}

static void __exit delay_action_exit(void)
{
    mutex_lock(&control_lock);
    live = false;
    mutex_unlock(&control_lock);

    cancel_delayed_work_sync(&report_work);
    pr_info("delay_action: removed\n");
}
module_init(delay_action_init);
module_exit(delay_action_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("One-shot delayed-work teaching module");
```

`mod_delayed_work()` 在同一 work 已经等待时修改它的到期，而不是排入第二个同名动作。`live = false` 在互斥锁内完成，参数回调就不可能在退出流程开始后重新排队；锁外的 `cancel_delayed_work_sync()` 随后等待 `report_fn()`，所以 `rmmod` 返回时回调不会再读取本模块的静态状态。把同步取消写成普通的 `cancel_delayed_work()` 会留下一个窗口：回调若已开始，模块代码和数据可能在它执行时消失。

## 4. 编译、重排并观察日志

同目录的 `Kbuild` 只有一行：

```make
obj-m += delay_action.o
```

使用第 01 篇确认过的内核构建目录编译并在目标系统加载：

```sh
make -C "$KERNEL_BUILD" M="$PWD" \
  ARCH=arm CROSS_COMPILE="$CROSS_COMPILE" modules
sudo insmod delay_action.ko delay_ms=5000
dmesg | tail -n 10
```

在 5 秒到期前，把时间改为 200 毫秒：

```sh
printf '200\n' | sudo tee /sys/module/delay_action/parameters/delay_ms
sleep 1
dmesg | tail -n 10
```

日志会先出现 `armed`，再出现一次 `fired after requested 200 ms`。它记录的是该次安排使用的参数，不是精确测量的实际延迟；要观测真实时间差，可在加载前后用 `date +%s%N` 记录并考虑调度误差。再次设置参数是在 work 已执行后安排新的一次动作，而不是让已结束的动作自动周期化。

取消路径可以通过“安排很长、立即卸载”观察：

```sh
sudo insmod delay_action.ko delay_ms=60000
sudo rmmod delay_action
dmesg | tail -n 10
```

正常日志中应有 `removed`，随后一分钟内不应再出现这次加载产生的 `fired`。该观察说明同步取消覆盖了 pending 回调；它不依赖 RV1126 特定设备，因此不会把未经执行的板级结果伪装成事实。

## 5. 让延迟动作回到驱动的生命周期

在真实 LED 驱动中，可以把 `report_fn()` 换成“读取当前请求状态后更新硬件”的 work 函数。IRQ 顶半部只更新状态并 `mod_delayed_work()`，work 函数在可睡眠上下文处理 GPIO 或总线。若设备支持解绑，`remove()` 的顺序应先阻止新的请求和 IRQ，再同步取消 delayed work，最后释放 GPIO、pinctrl 和私有数据。顺序的核心不是形式上的反向书写，而是确保任何异步入口都不能在其依赖对象已经释放之后继续运行。

从这里可以看到第 09 篇的同步选择和时间 API 的关系：timer/htrimer 的 callback 很短，通常只移动状态或投递工作；delayed work 允许慢操作，但它仍与其他路径并发；取消 API 则把“今后不再执行”和“当前已经执行完”区分开来。下一篇会补上 LED 真正依赖的资源层：引脚先由 pinctrl 选择功能和电气配置，再由 GPIO descriptor 以逻辑语义提供给消费者驱动。

## 6. 参考资料

- Linux Kernel Documentation, [Driver Basics: Timers](https://docs.kernel.org/6.12/driver-api/basics.html)、[Workqueue](https://docs.kernel.org/6.12/core-api/workqueue.html) 与 [High resolution timer design notes](https://docs.kernel.org/6.12/timers/highres.html)。
- Linux kernel stable source, [include/linux/timer.h (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/timer.h?h=v6.12)、[include/linux/workqueue.h (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/workqueue.h?h=v6.12)、[kernel/time/timer.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/time/timer.c?h=v6.12)、[kernel/time/hrtimer.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/time/hrtimer.c?h=v6.12) 与 [kernel/workqueue.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/workqueue.c?h=v6.12)。
- EmbedFire, [Linux 内核定时器](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_timer.html)，用于课程实验对照；本文以 Linux 6.12 的 API 和异步取消语义为准。
