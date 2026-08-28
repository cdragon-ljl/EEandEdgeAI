# Linux Driver 系列学习路径与质量重构设计

## 1. 背景与已确认问题

Linux driver 系列由原 BSP 系列拆分得到 28 篇文章。拆分保留了原文章内容和编号，但没有重新设计驱动学习路径，当前存在四类问题：

1. 基础知识顺序倒置：platform/probe 早于内核模块和完整设备模型，DMA 早于内存/MMIO，设备生命周期直到第 14 篇才系统解释。
2. 主题重复且相距较远：platform/probe 与设备模型、GPIO/LED 与 pinctrl/GPIO/IRQ、调试方法论与可靠性分析存在明显交叉。
3. 28 篇几乎统一使用“先确定目标 -> 第一步 -> 第二步 -> 第三步 -> 第四步”的五章模板，文章主题不同但叙述结构机械一致。
4. 系列框架中的 Mermaid 使用单反引号，无法正常渲染；框架目录未能真正指导阅读。

本轮采用“现有 28 个 URL 保持不变，重新定义显示顺序并重构正文”的方案。文件名中的数字是历史 slug，不再代表当前学习顺序；frontmatter `order` 与标题中的 `#NN` 是网站显示顺序。

## 2. 读者与学习目标

目标读者已经具备 C 语言、基本 Linux 命令和嵌入式硬件常识，但尚未形成 Linux Driver Model、执行上下文、资源生命周期和子系统框架的完整模型。

完成系列后，读者应能够：

- 从 Device Tree/firmware description 追踪到 `struct device`、Driver match、probe 和 sysfs。
- 设计字符设备或子系统接口，明确用户 ABI、并发和 teardown。
- 正确选择内存、MMIO、同步、timer/workqueue、DMA/IOMMU API。
- 完成 GPIO/Input、I2C、SPI、UART、PWM/IIO/watchdog 等常见驱动。
- 读懂 block/MTD/netdev/USB/V4L2/ASoC/thermal 的框架入口。
- 使用 trace、日志、硬件波形、fault injection 和资源守恒方法定位并验证故障。

## 3. 资料来源与野火教程的使用边界

技术事实按以下优先级核对：

1. Linux 内核官方文档与目标版本内核源码。
2. Device Tree binding、子系统 maintainer 文档和上游示例驱动。
3. 芯片/外设官方 datasheet、TRM 和协议规范。
4. 野火《嵌入式 Linux 驱动开发实战指南》用于教学顺序、实验拆分、板端观测和初学者表达参考。

参考站点：`https://doc.embedfire.com/linux/rk356x/driver/zh/latest/index.html`。

野火教程提供的有效教学方法包括：环境/模块/字符设备逐步上手，设备模型与 platform/DT 递进，pinctrl/GPIO/IRQ 分层，随后进入总线和高级子系统；每个主题配合板端实验和可观察结果。

不得把第三方教程中的简化表述当作内核契约。例如 coherent DMA 不保证“物理连续且无需考虑 ordering”，streaming mapping 也不是驱动手工操作 CPU cache 的通用接口；这些结论必须回到 Linux DMA API 文档和架构实现核对。

## 4. URL 与编号策略

- 28 个现有 Markdown 文件名和公开 slug 保持不变。
- 每篇更新 frontmatter `order` 为新学习顺序。
- 每篇标题中的 `#NN` 与新 `order` 一致。
- `linux-driver-framework.md` 按新顺序列出“显示编号、主题、历史文件名”。
- 测试明确允许历史文件名前缀与新 `order` 不一致，但禁止两个文章使用相同 order。
- 不创建新 canonical URL，不添加重定向，不破坏现有收藏和搜索结果。

## 5. 新的 28 篇学习路径

| 新顺序 | 历史文件 | 新主题边界 |
| ---: | --- | --- |
| 1 | `linux-driver-02-first-kernel-module-and-char-device.md` | 内核模块、Kbuild、加载/卸载、最小字符设备与第一个用户 ABI |
| 2 | `linux-driver-14-linux-device-model-lifecycle.md` | bus/device/driver/class/kobject、match/probe/remove、sysfs 与 devres 生命周期 |
| 3 | `linux-driver-01-platform-device-model-and-probe.md` | DT 节点、platform_device、OF match、resource、probe 与 deferred probe |
| 4 | `linux-driver-15-driver-memory-io-mapping.md` | kmalloc/vmalloc/page、usercopy、resource、ioremap/MMIO、mmap 边界 |
| 5 | `linux-driver-03-misc-sysfs-procfs-debugfs.md` | cdev/misc 与稳定 ABI，sysfs 属性，debugfs/procfs 的正确边界 |
| 6 | `linux-driver-06-timers-workqueues-delayed-work.md` | process/IRQ/softirq context、timer、workqueue、delayed work 与取消 |
| 7 | `linux-driver-07-kernel-synchronization-primitives.md` | mutex/spinlock/atomic/completion/waitqueue/RCU/refcount 的选择与锁顺序 |
| 8 | `linux-driver-13-driver-debugging-methodology.md` | 单一故障的假设、证据、动态调试、trace 与软硬件对齐 |
| 9 | `linux-driver-16-pinctrl-gpio-irq-subsystem.md` | pinctrl、gpiolib、irqchip/irq_domain 和 descriptor API 的框架层 |
| 10 | `linux-driver-04-gpio-led-subsystem.md` | 以 LED 完成 pinctrl/GPIO/LED class 的实践，不重复框架定义 |
| 11 | `linux-driver-05-keys-interrupt-input-subsystem.md` | 以按键完成 GPIO IRQ、debounce、wakeup 和 Input event 实践 |
| 12 | `linux-driver-17-clock-reset-regulator-power-sequence.md` | clock/reset/regulator/power-domain 与可回滚上电时序 |
| 13 | `linux-driver-08-i2c-regmap-sensor-driver.md` | I2C client/adapter、regmap、sensor 数据与 PM |
| 14 | `linux-driver-09-spi-driver-transfers.md` | SPI controller/device/message/transfer、CS、DMA 与时序验证 |
| 15 | `linux-driver-10-uart-tty-console-driver.md` | UART hardware、serial core、TTY、console、DMA 与流控 |
| 16 | `linux-driver-11-pwm-adc-watchdog.md` | PWM framework、IIO ADC、watchdog 三类小型子系统的边界和实践 |
| 17 | `linux-driver-12-dma-cache-coherency.md` | DMA mapping API、DMAengine、coherent/streaming/SG、ownership 与 barrier |
| 18 | `linux-driver-18-iommu-dma-address-translation.md` | IOVA/domain/group/fault、DMA-BUF/fence 与跨设备共享 |
| 19 | `linux-driver-19-firmware-remoteproc-rpmsg.md` | firmware request、remoteproc resource table、virtio/rpmsg 生命周期 |
| 20 | `linux-driver-20-rtc-nvmem-eeprom-efuse.md` | RTC 与 NVMEM consumer/provider、EEPROM/eFuse 数据治理 |
| 21 | `linux-driver-21-block-storage-emmc-sd.md` | block layer、MMC host/card、request、partition/filesystem 与错误恢复 |
| 22 | `linux-driver-22-mtd-ubi-nor-nand.md` | raw flash、MTD、bad block/ECC、UBI/UBIFS 与掉电恢复 |
| 23 | `linux-driver-23-ethernet-mac-phy-netdev.md` | MAC/PHY/phylink/netdev、NAPI、DMA ring 与链路诊断 |
| 24 | `linux-driver-24-usb-host-device-otg.md` | Linux Controller/PHY/role/Host/Gadget 的 BSP 集成入口，协议细节链接 USB 系列 |
| 25 | `linux-driver-25-v4l2-imx415-mipi-csi.md` | V4L2 subdev/media graph/format/buffer/CSI 的驱动入口，应用链路链接音视频系列 |
| 26 | `linux-driver-26-alsa-asoc-i2s-audio.md` | ASoC component/DAI/machine/DAPM/PCM 与时钟链路 |
| 27 | `linux-driver-27-thermal-cpufreq-devfreq-pm.md` | thermal zone/cooling、CPUFreq/Devfreq、runtime/system PM 的协同 |
| 28 | `linux-driver-28-reliability-performance-debug.md` | 系统级压力、性能基线、fault injection、恢复与发布门禁 |

## 6. 重叠主题的责任边界

### 设备模型与 Platform

第 2 篇只解释通用 Driver Core 对象、sysfs 拓扑、match/probe/remove 和 devres。第 3 篇只解释 DT/OF/platform 总线如何实例化具体设备和获取资源，不再重复创建自定义 bus/class。

### GPIO 框架与实践

第 9 篇解释 pinctrl state、GPIO descriptor、gpiochip、irqchip、irq_domain 和级联中断。第 10/11 篇分别以 LED/按键完成完整实践，不再次大段解释框架。

### 内存、DMA 与 IOMMU

第 4 篇处理 CPU 内存、usercopy 和 MMIO；第 17 篇处理 DMA mapping 与 DMAengine，明确两者是不同子系统；第 18 篇处理 IOMMU/IOVA 和跨设备共享。任何文章不得把 CPU virtual/physical/DMA/IOVA 混为一个地址。

### 调试方法与可靠性

第 8 篇处理单个故障：把现象改成可验证问题，建立假设和最小观测。第 28 篇处理系统发布：长稳、性能、故障注入、恢复和资源守恒。两篇不重复工具清单。

### 专门子系统系列

USB、V4L2、ASoC 文章只讲 Linux Driver/BSP 集成入口和对象边界，深入协议、应用与端到端数据路径通过明确链接交给 USB、PCIe 或音视频独立系列。

## 7. 单篇文章质量要求

每篇文章必须先定义读者在上一讲已经掌握什么、本篇要解决什么问题。正文按主题自身组织，禁止统一套用五个“第一步/第二步/第三步/第四步”H2。

一个完整主题通常包含：

1. 问题动机和硬件/软件模型。
2. 关键内核对象、数据结构与所有权。
3. 源码入口和一次完整调用/状态路径。
4. 可组合的代码或配置示例，而非互不关联的片段。
5. 板端验证、错误路径、remove/PM 和可观测证据。

章节数量不设统一配额。只有能展开多个自然段的内容才使用 H2/H3；术语、现象和检查项使用段内加粗、列表或表格。

架构、对象关系、调用时序、状态机、buffer ownership 和排错决策在必要位置使用 Mermaid。图必须被相邻正文解释，不能以图数量替代内容。

每篇应引用实际使用的一手资料。第三方教程可列为延伸阅读，但技术结论必须由 Linux 官方文档/源码或硬件规范支撑。

## 8. 代码与实验要求

- 代码必须说明目标内核版本语义、调用上下文、前置条件、返回值和回滚。
- probe 示例展示依赖顺序，remove/error path 展示逆序收敛。
- 异步对象必须说明提交、in-flight、completion/cancel 和释放 ownership。
- DTS 示例使用通用占位 compatible/资源时明确说明，不能伪装成可直接复制的具体 SoC binding。
- 板端命令说明观察字段和不同结果含义，不只列命令。
- 实验从最小路径递进到并发、PM、unbind、故障注入和长稳。
- 不编造 benchmark、API、源码路径或硬件寄存器行为。

## 9. Framework 页面重写

`linux-driver-framework.md` 将改为可发布前的内部路线图：

- 修复 Mermaid 为三反引号 fenced block。
- 按新顺序展示 28 篇，并标注四个学习阶段。
- 说明历史文件名数字不代表当前顺序。
- 明确 BSP、USB、PCIe、音视频独立系列的边界。
- 给出每阶段完成后的能力和建议实验，而非只列标题。

## 10. 自动测试与人工审读

新增 `tests/linux-driver-learning-path.test.mjs`，检查：

- 28 个历史文件名完全保留。
- frontmatter order 为连续 1..28，标题 `#NN` 与 order 一致。
- 每个文件映射到设计指定的新顺序和主题。
- Framework 使用有效 Mermaid fence，并按新顺序列全文章。
- 文章正文不再同时出现整套统一五步 H2 模板。
- 没有正文重复 H1、占位符和旧 BSP 编号/series。
- 关键基础文章按前置知识顺序引入对象。
- 需要图示和官方来源的文章满足逐篇 contract。

测试不使用字符数或标题数证明文章质量。每批还要人工审读：入门是否自然、术语是否先定义、源码/实验是否闭环、与前后文章是否重复、图是否必要且正确。

## 11. 实施与部署

实施分为六批：Framework/验收标准；基础 1-8；资源与外设 9-16；DMA/跨处理器 17-20；高级子系统 21-27；可靠性 28 与全系列审读。

每批先写失败测试，再调整 frontmatter/正文，运行专项测试并提交。全部完成后运行全量测试、Mermaid 解析、Astro check、生产构建和代表性页面渲染检查，随后合并 `main`、推送并验证 GitHub Pages。
