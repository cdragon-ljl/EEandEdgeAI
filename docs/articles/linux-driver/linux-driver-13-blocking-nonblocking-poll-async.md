---
title: "嵌入式知识体系 · Linux 驱动开发实战 #13 · 阻塞、非阻塞 I/O、等待队列、poll 与异步通知"
description: "围绕同一个按键事件，比较阻塞 read、O_NONBLOCK、poll/epoll 和 SIGIO 的等待与唤醒语义。"
pubDate: "2026-08-29"
series: linux-driver
order: 13
tags: ["Linux Driver", "waitqueue", "poll", "fasync"]
draft: false
---

中断已经能把按键事件送到驱动，但应用何时来读？不停调用 `read()` 会忙轮询；让 `read()` 永久睡眠又会影响需要同时处理其他文件描述符的程序。Linux 用等待队列和文件状态把生产事件与消费事件连接起来。

## 1. 所有接口共享同一个事件条件

设备保存 sequence、按键值和 `event_pending`：

```c
struct button_event {
    u32 sequence;
    u32 value;
};

wait_queue_head_t readq;
spinlock_t lock;
bool event_pending;
struct button_event event;
```

中断线程在锁内更新事件并置位，然后在锁外调用 `wake_up_interruptible()`。`read`、`poll` 和 SIGIO 都围绕 `event_pending`，避免 poll 报可读而 read 却没有数据。

## 2. 阻塞 read 在条件不满足时睡眠

```c
ret = wait_event_interruptible(dev->readq,
                               READ_ONCE(dev->event_pending));
if (ret)
    return ret;
```

等待宏会反复检查条件，并把任务置于可中断睡眠。信号到达时返回 `-ERESTARTSYS`，系统调用层据此重启或把 `EINTR` 交给应用。唤醒不是数据本身，醒来后仍要在锁内再次确认并取走事件。

## 3. O_NONBLOCK 让应用自己决定何时重试

```c
if (!READ_ONCE(dev->event_pending)) {
    if (file->f_flags & O_NONBLOCK)
        return -EAGAIN;
    /* 否则进入等待 */
}
```

非阻塞 read 没数据时立即返回 `EAGAIN`。它适合事件循环，但应用不应无间隔重试；通常与 poll/epoll 配合。

## 4. poll 把等待队列交给事件循环

```c
static __poll_t button_poll(struct file *file, poll_table *wait)
{
    struct button_dev *dev = file->private_data;
    __poll_t mask = 0;

    poll_wait(file, &dev->readq, wait);
    if (READ_ONCE(dev->event_pending))
        mask |= EPOLLIN | EPOLLRDNORM;
    return mask;
}
```

`poll_wait()` 注册等待关系，返回 mask 描述当前状态。epoll 能同时等待按键、网络和定时器文件描述符，事件出现后再调用 read 消费数据。

## 5. SIGIO 是通知，不是数据传输

驱动实现 `fasync` 回调维护订阅者：

```c
static int button_fasync(int fd, struct file *file, int on)
{
    struct button_dev *dev = file->private_data;
    return fasync_helper(fd, file, on, &dev->asyncq);
}
```

事件到达时 `kill_fasync(&dev->asyncq, SIGIO, POLL_IN)` 发送信号。应用仍需 read 获取事件，并在 close/release 时从 async 队列移除。信号处理复杂且容易与线程模型冲突，现代事件循环通常优先 epoll；理解 SIGIO 能帮助阅读旧驱动。

## 6. 用同一程序比较三种模式

分别运行阻塞 read、`O_NONBLOCK` 加 epoll、SIGIO 示例，记录按键 sequence。无论采用哪种等待方式，每次有效事件只应被消费一次。若 sequence 跳号，检查驱动覆盖了未消费事件还是硬件真的丢失；若重复，检查去抖和消费标志清除。

下一篇不再给按键设计私有结构，而是接入 Input 子系统，让标准 evdev 接口表达按键和触摸事件。

## 7. 参考资料

- [Linux wait queues and poll](https://docs.kernel.org/driver-api/basics.html)
- [Linux 6.12 `fs/select.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/fs/select.c?h=v6.12)
- [野火：阻塞与非阻塞 I/O](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_blockio_noblockio.html)
- [野火：异步通知](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_asyncnoti.html)
