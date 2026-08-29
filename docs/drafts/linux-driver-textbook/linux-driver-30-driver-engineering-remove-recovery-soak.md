---
title: "嵌入式知识体系 · Linux 驱动开发实战 #30 · 驱动工程化：回滚、解绑、异常恢复与长稳测试"
description: "把前面后置的工程要求集中起来，设计 probe 回滚、remove/解绑、在途任务取消、故障恢复、性能基线和长稳发布门禁。"
pubDate: "2026-08-29"
series: linux-driver
order: 30
tags: ["Linux Driver", "Reliability", "remove", "Soak Test"]
draft: true
---

驱动在实验室成功 probe 一次，只证明正常路径存在。产品还会遇到资源申请中途失败、用户仍打开节点、IRQ/DMA 正在运行、设备掉线、系统休眠和长期压力。本章不再引入新子系统，而是把前面学过的机制组织成可恢复生命周期。

## 1. probe 每前进一步都要能回退

资源存在依赖：regulator → clock → reset → IRQ → 硬件启动 → 用户接口。失败标签按反向撤销：

```c
ret = clk_prepare_enable(dev->clk);
if (ret)
    return ret;
ret = request_irq(dev->irq, handler, 0, name, dev);
if (ret)
    goto err_clk;
ret = register_user_interface(dev);
if (ret)
    goto err_irq;
return 0;

err_irq:
free_irq(dev->irq, dev);
err_clk:
clk_disable_unprepare(dev->clk);
return ret;
```

devm 减少内存式资源释放，但不能替驱动停止硬件、取消 job 或建立业务安全状态。managed 与 manual 资源顺序要明确。

## 2. remove 先阻止新工作，再等待旧工作

正确顺序通常是：

1. 标记设备离线并让新系统调用返回 `-ENODEV`；
2. 注销上层接口，阻止新请求；
3. mask IRQ、停止队列和 DMA 提交；
4. `cancel_work_sync`、`del_timer_sync`、`synchronize_irq`、`dmaengine_terminate_sync` 等待在途路径；
5. 关闭硬件并释放 mapping、buffer、clock、regulator。

若对象仍被打开，私有内存要有引用生命周期，不能在 remove 返回前盲目释放。

## 3. 故障注入验证真正的错误路径

内核 fault-injection、fail_function、debugfs 开关或驱动测试参数可以让第 N 次分配/传输失败。每个注入点检查：

- probe 返回原始错误；
- 已取得资源全部释放；
- sysfs/dev 节点无残留；
- 再次 bind 可以成功；
- 日志能指出失败阶段。

故障注入只在测试系统执行，并保留配置和恢复步骤。

## 4. 异常恢复要有状态机

设备超时后，先判断能否局部 reset、是否需要重新初始化 register/cache、在途请求返回什么错误，以及上层是否允许自动重试。无限 reset loop 会掩盖硬件故障，应限制次数并上报 health 状态。

watchdog 复位后读取 reset reason 和持久化日志，形成“故障发生—恢复动作—结果”的证据，而不是只记录重新启动。

## 5. 性能基线先固定工作负载

记录吞吐、p50/p99 latency、CPU、IRQ/softirq、内存、温度、频率和错误计数。先测单功能，再组合摄像头、网络、存储等负载。优化前要回答瓶颈在哪一层，不能只调整队列参数。

## 6. 长稳测试成为可重复发布门禁

长稳需要版本化 manifest、固定负载、明确阈值、持续日志和失败 signature。通过标准不是“跑了一夜没死”，而是在规定时间和环境中：

- 无 kernel warning/oops、IOMMU fault、I/O error；
- sequence、丢包、XRUN 等业务错误不超过阈值；
- 内存和 DMA buffer 无持续增长；
- 温度与频率策略可解释；
- 断网、拔插、服务重启和系统 suspend 后能恢复。

失败时保留首次异常前后的 trace、统计和复现步骤；修复后运行同一 workload 证明 signature 消失。

## 7. 完成一条从学习到工程的路径

从第 1 篇环境记录，到模块、字符设备、设备模型、总线、中断、DMA 和复杂子系统，每一步都在为最后的生命周期负责。工程化并不是在代码末尾添加更多检查，而是让对象、ownership、上下文和状态转换从设计开始就可解释。

## 8. 参考资料

- [Fault injection](https://docs.kernel.org/fault-injection/index.html)
- [Driver binding](https://docs.kernel.org/driver-api/driver-model/binding.html)
- [Kernel testing guide](https://docs.kernel.org/dev-tools/testing-overview.html)
