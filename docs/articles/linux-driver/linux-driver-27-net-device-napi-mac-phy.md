---
title: "嵌入式知识体系 · Linux 驱动开发实战 #27 · 网络子系统、net_device、NAPI、MAC 与 PHY"
description: "跟随一帧数据从 PHY、MAC DMA ring、NAPI、net_device 进入协议栈和 socket，建立网络驱动整体路径。"
pubDate: "2026-08-29"
series: linux-driver
order: 27
tags: ["Linux Driver", "net_device", "NAPI", "MAC", "PHY"]
draft: false
---

网络设备不通过普通 read/write 文件节点传输帧。驱动注册 `net_device`，协议栈通过 `ndo_start_xmit` 发送 skb，接收方向由 IRQ/NAPI 从 DMA ring 取帧并交给网络核心。

## 1. PHY 和 MAC 负责不同层

PHY 处理模拟信号、自协商、speed/duplex 和链路；MAC 处理以太网帧、DMA descriptor、过滤和统计。RGMII/RMII/SGMII 是 MAC-PHY 接口，延时和时钟必须与原理图匹配。

phylib/phylink 协调 PHY 状态和 MAC 配置，carrier 变化通过 netif_carrier_on/off 反映给网络栈。

## 2. net_device 是网络接口对象

`alloc_etherdev()` 分配 net_device 和私有数据，driver 填写 `net_device_ops`：

```c
static const struct net_device_ops demo_netdev_ops = {
    .ndo_open = demo_open,
    .ndo_stop = demo_stop,
    .ndo_start_xmit = demo_xmit,
    .ndo_get_stats64 = demo_get_stats64,
};
```

open 启动 ring、IRQ、NAPI 和队列；stop 按反向顺序停止。register_netdev 后用户看到 ethX，但接口名不是硬件成功的证明。

## 3. TX 把 skb 放入 DMA ring

`ndo_start_xmit` 映射 skb 数据、填写 descriptor、更新 producer index 并通知硬件。ring 满时调用 `netif_stop_queue()`，完成回收后 `netif_wake_queue()`。DMA mapping 生命周期必须覆盖硬件访问。

## 4. NAPI 在中断和轮询之间平衡

RX IRQ 只屏蔽/确认并调用 `napi_schedule()`；poll 按 budget 从 ring 取包：

```c
while (work < budget && descriptor_ready(rx)) {
    skb = build_skb_from_rx(rx);
    napi_gro_receive(napi, skb);
    work++;
}
if (work < budget && napi_complete_done(napi, work))
    enable_rx_irq(dev);
```

高流量时轮询批量处理，避免每包中断；流量结束后重新启用 IRQ。budget 和 ring 不变量错误会表现为丢包、卡队列或 softirq 占用。

## 5. 用分层证据调试网口

```sh
ip -details link show dev eth0
ethtool eth0
ethtool -S eth0
ip -s link show dev eth0
```

无 carrier 先看 PHY 供电/reset/接口模式；carrier 正常但 error counter 增长，看 RGMII 时序、DMA 和 descriptor；统计正常但应用不通，再查 IP、route 和 socket。

```mermaid
flowchart LR
    P["PHY/link"] --> M["MAC DMA ring"]
    M --> N["NAPI poll"]
    N --> D["net_device"]
    D --> S["network stack"]
    S --> A["socket/application"]
```

下一篇讨论 SMP。网络、DMA 和中断常在不同 CPU 上并发，cache coherence 并不自动保证 descriptor 和状态的观察顺序。

## 6. phylink 把链路状态交给 MAC

复杂 MAC 可能连接 fixed-link、外部 PHY、SFP 或 PCS。phylink 统一协商结果和 MAC 配置：link_up 时设置 speed/duplex/pause 并启用数据路径，link_down 时停止 carrier。DTS 的 `phy-mode` 和 delay 必须对应原理图，不能靠不断切换 `rgmii-id` 试出结果。

## 7. 建立从 descriptor 到 socket 的统计

driver 统计 RX descriptor error、CRC、length、missed、TX timeout；`ethtool -S` 暴露硬件计数，`ip -s link` 显示 netdev 汇总，应用再记录 packet sequence、吞吐和延迟。三层时间对齐后才能判断丢包发生在 PHY/MAC、内核队列还是网络对端。

重复 link down/up、热态大流量、不同对端和 MTU 是基本回归。stop/remove 要先停止队列、disable NAPI、mask IRQ、取消 DMA，再释放 skb/ring；否则重连或解绑后会出现旧 descriptor 访问。

## 8. 参考资料

- [Network device driver](https://docs.kernel.org/networking/netdevices.html)
- [NAPI](https://docs.kernel.org/networking/napi.html)
- [PHY](https://docs.kernel.org/networking/phy.html)
- [野火：网络子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_net_subsystem.html)
