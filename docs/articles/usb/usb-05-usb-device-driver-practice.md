---
title: "嵌入式知识体系 · USB 驱动开发实战 #05 · USB 设备驱动实践：从匹配到数据收发"
description: "前面几篇已经把 USB 架构、描述符、Linux USB 驱动框架和 URB 讲过了。这一篇把这些知识串起来，完成一个最小可运行的 USB 设备驱动实践。"
pubDate: "2026-08-18"
series: usb
order: 5
tags: ["USB", "Linux Driver"]
draft: false
---
前四篇分别建立了枚举、Linux 驱动对象、描述符和 URB。本篇把它们收束成一个可落地的自定义 bulk interface 驱动。目标不是给出“能编译的最长代码”，而是解释每个对象由谁拥有、异步请求何时停止，以及拔出设备和用户文件描述符并发时如何避免 use-after-free。

场景是一台包含 bulk IN 和 bulk OUT endpoint 的自定义设备，驱动向用户态暴露字符接口，写路径异步提交 URB，读路径维护持续接收请求。

## 私有对象必须同时表达硬件状态和软件寿命

```c
struct demo_usb {
    struct usb_device *udev;
    struct usb_interface *intf;
    struct kref kref;
    struct mutex io_mutex;
    spinlock_t rx_lock;
    struct usb_anchor submitted;
    wait_queue_head_t read_wait;

    u8 bulk_in;
    u8 bulk_out;
    size_t in_maxp;
    bool disconnected;

    struct urb *rx_urb;
    u8 *rx_buf;
    size_t rx_len;
    int rx_status;
};
```

`usb_device` 引用保证驱动仍可使用设备对象；`kref` 让 disconnect 与最后一次 close 解耦；mutex 串行化可睡眠的 open/read/write/disconnect 状态；自旋锁只保护 completion 与 reader 共享的短接收状态；`usb_anchor` 管理所有在途异步 URB。

“设备已拔出”和“私有对象可释放”不是同一时刻。disconnect 先撤销硬件能力并停止 URB，用户仍持有文件描述符时对象继续存在；最后一个 `kref_put()` 才释放内存。

## probe 先验证 interface，再发布字符设备

现代内核提供 endpoint helper，避免每个驱动手写遍历：

```c
struct usb_endpoint_descriptor *bulk_in;
struct usb_endpoint_descriptor *bulk_out;

ret = usb_find_common_endpoints(intf->cur_altsetting,
                                &bulk_in, &bulk_out,
                                NULL, NULL);
if (ret)
    return ret;
```

找到 endpoint 后取得地址和 `usb_endpoint_maxp()`，分配私有对象、RX URB 和 buffer，初始化 lock/anchor/waitqueue，并用 `usb_set_intfdata()` 绑定 interface。只有全部内部状态可用后才调用 `usb_register_dev()` 发布字符 minor。

失败回滚按发布顺序反向执行：先撤销用户入口，再 kill 已提交 URB，释放 URB/buffer，清 intfdata，最后 `usb_put_dev()` 和释放对象。把 `usb_set_intfdata()` 放得过早又不在失败路径清空，会让 disconnect 取得半初始化对象。

```mermaid
flowchart LR
    M[interface matched] --> E[find endpoints]
    E --> O[allocate object URBs buffers]
    O --> I[set intfdata]
    I --> R[register char device]
    R --> S[start RX URB]
    S --> P[published to user space]
```

## open 和 release 只管理引用，不重新初始化硬件

open 根据 minor 找到 interface，取得 intfdata，在锁内检查 `disconnected`，成功后 `kref_get()` 并把对象放进 `file->private_data`。release 只执行 `kref_put()`。

不要在 open 中保存裸 interface 指针后立即放掉所有引用，也不要在 release 中无条件关闭全局硬件：多个进程可能同时打开。同一设备是否只允许单开，应由明确的 open count 或 exclusive 标志控制。

## 异步 write 的 buffer 必须由 completion 释放

```c
static ssize_t demo_write(struct file *file,
                          const char __user *user,
                          size_t count, loff_t *ppos)
{
    struct demo_usb *dev = file->private_data;
    struct urb *urb;
    void *buf;
    int ret;

    if (count == 0)
        return 0;

    buf = memdup_user(user, count);
    if (IS_ERR(buf))
        return PTR_ERR(buf);

    urb = usb_alloc_urb(0, GFP_KERNEL);
    if (!urb) {
        kfree(buf);
        return -ENOMEM;
    }

    usb_fill_bulk_urb(urb, dev->udev,
        usb_sndbulkpipe(dev->udev, dev->bulk_out),
        buf, count, demo_write_complete, dev);
    urb->transfer_flags |= URB_FREE_BUFFER;
    usb_anchor_urb(urb, &dev->submitted);
    ret = usb_submit_urb(urb, GFP_KERNEL);
    if (ret)
        usb_unanchor_urb(urb);
    usb_free_urb(urb);
    return ret ? ret : count;
}
```

`usb_free_urb()` 在提交后只释放驱动持有的引用，HCD 的引用仍让 URB 活到 completion。`URB_FREE_BUFFER` 让 core 在最终释放 URB 时释放 buffer。若不用该标志，completion 必须明确释放，不能在 write 返回前释放仍供 DMA 使用的内存。

Completion 先从 anchor 自动脱离，再区分正常完成、主动取消和真实错误。若需要限制队列深度，可统计 anchor 中请求或使用 semaphore，在 write 入口施加背压。

## 持续 bulk IN 用 completion 与 waitqueue 连接用户 read

驱动通常预先提交一个或多个 RX URB。Completion 把 `actual_length` 和 status 提交到接收队列，唤醒 `read_wait`，再在未断开时重新提交。用户 read 睡眠等待“有数据或已断开”，醒后在锁保护下复制并消费。

单一 RX buffer 只能在用户消费后重提，否则 completion 会覆盖尚未读取的数据。高吞吐实现应使用多个 buffer/ring，并定义 FREE、IN_FLIGHT、READY、USER_OWNED 等所有权状态，而不是只增加 URB 数量。

Completion 不能调用 `copy_to_user()`，也不应获取可能睡眠的 mutex。它只做短状态提交，用户线程完成可睡眠操作。

## read、poll 和非阻塞语义必须共享同一个接收状态

持续 RX 不应只保存一块 `rx_buf + rx_len`，否则 completion 在用户尚未读取时再次到来会覆盖数据。教学实现至少使用一个带 producer/consumer 的 ring，或多个 FREE/IN_FLIGHT/READY buffer。Completion 在 `rx_lock` 下把 buffer 从 IN_FLIGHT 移到 READY，随后唤醒 `wait_queue`。

`read()` 的等待条件应是“READY 队列非空、设备断开或发生不可恢复错误”：

```c
ret = wait_event_interruptible(dev->read_wait,
        demo_has_ready(dev) || READ_ONCE(dev->disconnected));
if (ret)
    return ret;
if (READ_ONCE(dev->disconnected) && !demo_has_ready(dev))
    return -ENODEV;
```

若文件以 `O_NONBLOCK` 打开且当前无数据，返回 `-EAGAIN`，不能仍然睡眠。取得 READY buffer 后再 `copy_to_user()`；复制可能睡眠，因此不能持 completion 使用的自旋锁。通常先在锁内摘下 buffer并改为 USER_OWNED，解锁后复制，最后重新提交 RX。

`poll()` 注册同一个 waitqueue，并根据相同条件返回 `EPOLLIN`；断开返回 `EPOLLHUP`，错误返回 `EPOLLERR`。Read 与 poll 如果使用不同状态变量，会出现“poll 可读但 read 阻塞”或永久漏唤醒。

## 异步写队列需要背压和取消策略

每次 write 分配 URB/buffer在低速应用中可接受，但高并发会无界占用内存。可以用 semaphore 限制在途 write 数，或维护固定 TX request pool。队列满时阻塞或 `O_NONBLOCK -> -EAGAIN`，语义与 read 一致。

Completion 释放配额并唤醒写者。Disconnect 先阻止新 write，再 kill anchor；所有 completion 返回后配额和对象引用应回到初始值。错误重试要由设备协议决定，不能对所有 `-EPIPE/-EPROTO` 自动重提造成风暴。

## autosuspend 前后要停止并恢复数据流

Interface driver 可使用 runtime PM。Open/首次 I/O 通过 `usb_autopm_get_interface()` 保证设备 active，空闲后 `usb_autopm_put_interface()`；每次成功 get 都必须在错误、release 和 disconnect 路径配对。

Suspend 回调停止持续 RX 或让设备进入低功耗，resume 重新确认 altsetting/endpoint 状态并提交 request。设备支持 remote wakeup 时还要配置标准 feature 与 class 状态。物理仍连接不代表 URB 在 autosuspend 期间可继续提交。

调试“空闲一段时间后第一次读失败”时，记录 runtime status、autosuspend delay、resume 回调和 RX 重提，而不是把错误归因于随机 USB timeout。

## disconnect 的顺序决定是否安全

```c
static void demo_disconnect(struct usb_interface *intf)
{
    struct demo_usb *dev = usb_get_intfdata(intf);

    usb_set_intfdata(intf, NULL);
    mutex_lock(&dev->io_mutex);
    dev->disconnected = true;
    mutex_unlock(&dev->io_mutex);
    wake_up_all(&dev->read_wait);

    usb_deregister_dev(intf, &demo_class);
    usb_kill_anchored_urbs(&dev->submitted);
    usb_kill_urb(dev->rx_urb);
    kref_put(&dev->kref, demo_delete);
}
```

先清 intfdata 阻止新 open，设置断开标志让现有 file operation 返回 `-ENODEV`，唤醒睡眠 reader，再撤销字符节点并同步停止 URB。最后释放 interface 拥有的 kref。用户仍打开时，`demo_delete()` 会推迟到 release。

若 completion 会重提 RX，必须让它在看到 disconnected 后停止，否则 kill 完成一次回调，回调又提交新 URB，disconnect 永远无法收敛。

## 调试一条完整数据路径

先确认 interface driver 绑定和 endpoint：

```bash
lsusb -t
cat /sys/bus/usb/devices/1-2:1.0/uevent
sudo cat /sys/kernel/debug/usb/usbmon/1u
```

写无返回时检查 OUT URB 是否提交、completion status、设备是否 STALL；读卡住时检查 IN URB 是否在 anchor/HCD、completion 是否到达、waitqueue 条件是否提交。拔出崩溃则重点审计 intfdata、kref、anchor 和 buffer 的释放顺序，而不是只给 disconnect 加延时。

## 小结

一个可用的 USB bulk 驱动不是 probe 加两个 `usb_bulk_msg()`，而是一套对象寿命协议：`usb_find_common_endpoints` 建立通道，kref 管理拔出后的软件对象，`usb_anchor` 管理在途 URB，completion 与 waitqueue 连接异步 I/O，disconnect 依次关闭入口、停止请求和释放引用。下一篇转到 Device 侧，解释 Linux 如何通过 Gadget/UDC 主动成为 USB 外设。
