---
title: "嵌入式知识体系 · Linux 驱动开发实战 #28 · SMP、内存屏障、per-CPU 数据与多核驱动并发"
description: "理解 cache coherence 与内存顺序的区别，学习 barrier、acquire/release、per-CPU 数据在多核驱动中的作用。"
pubDate: "2026-08-29"
series: linux-driver
order: 28
tags: ["Linux Driver", "SMP", "Memory Barrier", "per-CPU"]
draft: false
---

在单核实验中，错误顺序可能很难出现；SMP 上中断、worker、用户线程和设备完成路径可以在不同 CPU 同时运行。cache coherence 最终让 CPU 看到相同数据，却不保证它们按源码顺序观察多个写操作。

## 1. coherence 不等于 ordering

生产者先填写 descriptor，再把 ready 置 1；消费者看到 ready 后读取 descriptor。如果 CPU 或编译器重排，消费者可能看到 ready，却仍读到旧内容。

```c
/* producer */
WRITE_ONCE(desc->length, length);
smp_store_release(&desc->ready, 1);

/* consumer */
if (smp_load_acquire(&desc->ready))
    use_length(READ_ONCE(desc->length));
```

release 保证此前写在 ready 之前可见，acquire 保证看到 ready 后的读取不会越过它。

## 2. barrier 要匹配通信关系

`barrier()` 只限制编译器；`smp_mb/rmb/wmb` 约束 CPU 间内存访问；`dma_wmb/rmb` 用于 CPU 与设备共享 descriptor 的 ordering。选择 barrier 需要先画出谁写、谁读、以哪个 flag/doorbell 交接。

锁内部已经包含必要顺序，普通锁保护代码不应再随意堆 barrier。错误 barrier 往往既不能修复数据竞争，又降低性能。

## 3. atomic 不是所有字段的事务

atomic 可安全更新单个计数，但“状态、指针、长度”组成的不变量仍需锁、RCU 或明确的无锁协议。`READ_ONCE/WRITE_ONCE` 防止编译器合并/拆分单次访问，也不自动建立跨字段顺序。

## 4. per-CPU 数据减少共享竞争

`DEFINE_PER_CPU` 为每个 CPU 提供独立实例，适合统计和本地缓存：

```c
this_cpu_inc(driver_rx_packets);
sum = 0;
for_each_possible_cpu(cpu)
    sum += per_cpu(driver_rx_packets, cpu);
```

访问时要考虑抢占和 CPU hotplug；需要稳定指针时使用 get_cpu_ptr/put_cpu_ptr 或适合上下文的 helper。per-CPU 适合可后聚合数据，不适合必须立即全局一致的状态。

## 5. 用并发证据而不是概率判断

KCSAN 可检测数据竞争，lockdep 检查锁关系，trace/perf 观察 CPU 迁移和热点。设计无锁 ring 时，应写出 producer/consumer index 的 ownership、wrap 和 memory-order contract，并在压力测试中验证。

下一篇建立系统化调试流程，把日志、dynamic debug、tracepoint 和 ftrace 放到同一条证据链。

## 6. DMA descriptor 还需要设备侧顺序

CPU 填写 descriptor 后通常执行 `dma_wmb()`，再写 doorbell；完成路径读到硬件 ownership 已归还后，用 `dma_rmb()` 再读取 length/status。SMP barrier 和 DMA barrier 的通信对象不同，不能互换名称后凭感觉使用。

```c
desc->addr = cpu_to_le64(dma);
desc->length = cpu_to_le32(length);
dma_wmb();
writel(next, regs + DOORBELL);

if (READ_ONCE(desc->owned_by_device) == 0) {
    dma_rmb();
    consume(le32_to_cpu(desc->actual_length));
}
```

## 7. 用 litmus 和压力测试审查无锁协议

先用文字列出变量初值、每个 CPU 的操作和禁止结果，再选择 acquire/release 或锁。运行时加入 sequence、wrap counter 和 invariant assertion；KCSAN 检测 data race，lockdep 只检查锁，不会证明无锁协议正确。

如果没有明确性能瓶颈，优先使用可读的锁。无锁实现要同时维护原子性、ordering、对象生命周期和 ABA/wrap 等问题，复杂度远高于少量 lock contention。

## 8. 参考资料

- [Linux memory barriers](https://docs.kernel.org/core-api/wrappers/memory-barriers.html)
- [per-CPU](https://docs.kernel.org/core-api/this_cpu_ops.html)
- [KCSAN](https://docs.kernel.org/dev-tools/kcsan.html)
- [野火：SMP](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/advance_smp.html)
