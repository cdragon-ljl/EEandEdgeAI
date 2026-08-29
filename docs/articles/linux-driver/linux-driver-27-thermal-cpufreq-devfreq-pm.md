---
title: "嵌入式知识体系 · Linux 驱动开发实战 #27 · thermal、CPUFreq、Devfreq 与 PM"
description: "以持续图像处理负载下的温度与性能曲线为主线，建立 thermal zone、cooling device、CPUFreq、Devfreq 和 runtime PM 的验证方法。"
pubDate: "2026-08-16"
series: linux-driver
order: 27
tags: ["Linux BSP", "Thermal", "CPUFreq", "Devfreq", "Runtime PM", "Power Management"]
draft: false
---

系统首先从 thermal sensor 取得经过校准的温度读数，内核把传感器组织为 thermal zone；zone 中的 trip point 定义策略触发边界，并通过 cooling device 请求降频、风扇或其他冷却动作。CPUFreq 管理 CPU 性能状态，Devfreq 管理 DDR/GPU/NPU 等设备频率，runtime PM 则负责让空闲设备真正停止时钟或电源。

这三类机制控制的对象不同。温度升高后的降频可能是保护策略正常生效，也可能暴露散热能力不足；正在处理任务的加速器降频与空闲设备无法 suspend 也不是同一问题。只看一次温度、一个 governor 名称或瞬时频率，无法解释端到端性能。

本章以持续图像采集和处理负载为主线，把温度、频率、吞吐、功耗与冷却状态放在同一时间轴上。目标是验证保护边界和性能预期，而不是通过抬高 trip 数值换取短时跑分。

## 一、先建立热、性能和功耗的因果链

CPU 负载高不一定是温度最高的来源，DDR、ISP、NPU、编码器、PMIC 和屏幕背光都可能贡献热量。

温度传感器读数也不是芯片表面温度的直接等价物；它表示某个 sensor 位置、校准和采样策略下的逻辑温度。

```mermaid
flowchart LR
    A[workload: capture/infer/encode] --> B[CPU/DDR/accelerator activity]
    B --> C[power consumption]
    C --> D[die and board temperature]
    D --> E[thermal zone trip]
    E --> F[cooling device]
    F --> G[CPUFreq/Devfreq/fan/power cap]
    G --> H[throughput and latency]
    H --> A
```

| 观察量 | 说明 | 不能单独证明 |
| --- | --- | --- |
| thermal zone 温度 | 内核用于 policy 的传感读数 | 外壳真实温度或 sensor 精度 |
| CPU frequency | 当前或策略选择频率 | CPU 实际执行效率 |
| devfreq rate | DDR/GPU/NPU 等设备频率 | 端到端吞吐 |
| workload FPS/latency | 业务输出 | 哪个硬件导致瓶颈 |
| 输入功耗/电流 | 系统能源消耗 | 单个模块功耗分解 |
| fan PWM/RPM | 散热执行状态 | 风道和散热器效率 |

先固定负载、环境温度、机箱状态和供电，再记录数据。只改变一个条件，才能比较散热片、风扇策略或频率 policy 的影响。

## 二、确认 thermal zone、trip 与 cooling device 的关系

thermal zone 引用传感器并定义 trip 点与 hysteresis；cooling map 将特定 trip 关联到 CPUFreq、Devfreq、风扇或其他冷却设备。

属性、单位和可用 cooling device 依赖 SoC thermal binding 与当前内核驱动，下面只显示结构。

```dts
thermal-zones {
    soc_thermal {
        polling-delay-passive = <ACTUAL_DELAY_MS>;
        polling-delay = <ACTUAL_DELAY_MS>;

        trips {
            passive_trip: passive {
                temperature = <ACTUAL_PASSIVE_MILLIC>;
                hysteresis = <ACTUAL_HYSTERESIS_MILLIC>;
                type = "passive";
            };

            critical_trip: critical {
                temperature = <ACTUAL_CRITICAL_MILLIC>;
                hysteresis = <0>;
                type = "critical";
            };
        };

        cooling-maps {
            map0 {
                trip = <&passive_trip>;
                cooling-device = <&cpu0 THERMAL_NO_LIMIT THERMAL_NO_LIMIT>;
            };
        };
    };
};
```

critical trip 涉及硬件安全，不应为追求 benchmark 分数而随意抬高。

passive trip 与 hysteresis 则要匹配散热能力和产品体验，过于激进会造成频率来回抖动，过于宽松会使外壳温度超标或接近 critical。

```mermaid
flowchart TD
    A[thermal sensor] --> B[thermal zone]
    B --> C{temperature crosses trip?}
    C -- no --> D[normal governor policy]
    C -- passive --> E[request cooling states]
    C -- hot --> F[stronger throttle/fan]
    C -- critical --> G[hardware protection/shutdown]
```

### 不要用单个温度命令判断政策是否工作

系统通常暴露多个 thermal zone，名称、type 和温度单位可能不同。

先列出全部 zone，再找对应 SoC/PMIC/板级 sensor。

```sh
for z in /sys/class/thermal/thermal_zone*; do
    printf '%s ' "$z"
    cat "$z/type" "$z/temp"
done

for c in /sys/class/thermal/cooling_device*; do
    printf '%s ' "$c"
    cat "$c/type" "$c/cur_state" "$c/max_state"
done
```

如果 zone 从未升温，先验证 sensor driver 和采样，不要因为没有触发 throttle 就认定散热良好。

## 三、区分 CPUFreq、Devfreq 与 runtime PM 的控制对象

CPUFreq 调节 CPU cluster 的频率/电压策略；Devfreq 调节 DDR、GPU、NPU 或其他支持的设备频率；runtime PM 则让闲置 device 进入低功耗状态。

它们不是同一开关，必须分别观察。

```mermaid
flowchart LR
    A[CPU scheduler load] --> B[CPUFreq governor]
    C[DDR/GPU/NPU activity] --> D[Devfreq governor]
    E[device idle reference count] --> F[runtime PM]
    B --> G[CPU clock/voltage]
    D --> H[device/DDR clock]
    F --> I[device suspend/resume]
    G --> J[thermal cooling constraints]
    H --> J
```

可读取政策和频率，但注意不同内核和 vendor driver 的 sysfs 路径可能不同。

```sh
find /sys/devices/system/cpu/cpufreq -maxdepth 2 -type f | sort
cat /sys/devices/system/cpu/cpufreq/policy0/scaling_governor
cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq

find /sys/class/devfreq -maxdepth 2 -type f | sort
find /sys/bus -path '*/power/runtime_status' -type f | head
```

不要为了“锁频”在生产系统中永久关闭 governor 或 thermal constraint。

锁频可以是受控基准测试的一个条件，但必须明确记录它不代表实际产品的热稳定状态。

### runtime PM 的目标是闲置设备，而不是压低正在使用的设备

一个摄像头、USB controller 或 codec 在使用时被 runtime suspend，会造成帧丢失、断链或杂音。

反过来，一个本应闲置的设备长期保持 active，可能持续消耗电流并加热系统。

driver 必须用正确的 pm_runtime_get/put 生命周期包围硬件访问，应用不能以不断读 sysfs 的方式“保持唤醒”。

## 四、建立可重复的热负载实验与关联记录

选择能代表产品峰值的稳定 workload，例如固定分辨率的摄像头采集加推理或编码。

启动前记录 idle 温度、频率、功耗与环境；运行中以固定间隔采样 thermal、CPUFreq、Devfreq、FPS、掉帧和输入电流。

```mermaid
sequenceDiagram
    participant T as test harness
    participant W as fixed workload
    participant S as sysfs sensors
    participant P as power meter
    T->>S: record idle baseline
    T->>W: start workload
    loop every fixed interval
        T->>S: temperature/frequency/cooling state
        T->>P: voltage/current
        T->>W: fps/latency/errors
    end
    T->>W: stop workload
    T->>S: record cooldown
```

```sh
while true; do
    date -Is
    cat /sys/class/thermal/thermal_zoneACTUAL/temp
    cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq
    sleep 5
done | tee /tmp/thermal-run.log
```

示例只记录两项。实际测试应包含 workload 自身的 frame count/latency、所有相关 zone、cooling state 和外部功耗仪读数。

不要把日志采样本身做得过重，以至于影响实时 workload。

### 用曲线而不是单点判断 throttle

```mermaid
flowchart TD
    A[temperature rises] --> B{trip crossed?}
    B -- no --> C[frequency follows governor]
    B -- yes --> D[cooling state increases]
    D --> E[frequency ceiling lowers]
    E --> F[throughput may decline]
    F --> G{temperature stabilizes?}
    G -- yes --> H[policy and cooling balanced]
    G -- no --> I[thermal design/workload insufficient]
```

温度稳定、频率下降、吞吐下降可能是正常的 passive cooling 结果。

温度持续升高直到 critical、频率反复剧烈跳变、风扇不转或 workload 异常退出，则需分别检查散热硬件、trip/cooling map、驱动与应用限流策略。

## 五、验证热态恢复、低功耗和保护边界

热管理的验收包括升温，也包括负载停止后的降温和频率恢复。

同时需要验证闲置时的 runtime PM、待机/唤醒策略和关键外设恢复，不应只追求峰值 FPS。

```mermaid
flowchart TD
    A[idle baseline] --> B[peak workload]
    B --> C[thermal steady state]
    C --> D[stop workload]
    D --> E[cooldown and frequency recovery]
    E --> F[idle power measurement]
    F --> G[suspend/resume if product uses it]
    G --> H[peripheral functionality recheck]
```

| 现象 | 优先检查 |
| --- | --- |
| 温度显示固定值 | thermal sensor、DTS、driver probe |
| 高温但 cooling state 不变 | trip、cooling-map、cooling device 注册 |
| 性能周期性抖动 | hysteresis、governor、风扇策略、功耗峰值 |
| 空闲功耗过高 | runtime PM usage、唤醒源、后台任务、regulator |
| 待机后摄像头/音频失败 | driver suspend/resume、clock/regulator/pinctrl state |
| critical reset | 散热能力、workload 上限、trip 设置、传感可靠性 |

critical shutdown 和硬件温度保护不是测试失败后要关闭的“障碍”，而是产品安全底线。

若产品在额定环境与代表负载下触发它，应通过散热、功耗预算、负载策略或硬件设计解决。

### 官方资料

- [Linux generic thermal sysfs API](https://docs.kernel.org/driver-api/thermal/sysfs-api.html)
- [CPU frequency and voltage scaling](https://docs.kernel.org/admin-guide/pm/cpufreq.html)
- [Device frequency scaling](https://docs.kernel.org/driver-api/devfreq.html)
- [Runtime Power Management Framework](https://docs.kernel.org/power/runtime_pm.html)

### 本章练习

列出当前系统全部 thermal zone 和 cooling device，标注其对应 SoC、PMIC 或风扇实体。

选择固定图像处理负载，记录至少 30 分钟的温度、CPU/Devfreq、cooling state、FPS、错误和输入功耗。

比较开盖/合盖、不同风扇策略或不同环境温度下的稳态曲线，但每次只变更一个条件。

停止负载后验证温度、频率和 runtime PM 状态恢复，并在需要的产品模式下执行一次 suspend/resume 外设回归。

## 六、小结与验收

热管理不是孤立的温度阈值表，而是一条从负载、功耗和温升到策略动作，再返回业务吞吐的闭环。正确验收既要证明临界边界不会被突破，也要证明负载结束后频率、功耗和设备活动状态能够回到基线。

### 验收问题

完成本章后，应能独立回答：

- thermal zone、trip、cooling device 与 thermal map 如何关联；
- 为什么 temperature 值和芯片表面温度不是简单等号；
- CPUFreq、Devfreq 与 runtime PM 分别控制什么；
- 为什么锁频只适合作为受控基准条件；
- 如何用曲线判断正常 throttling 与散热不足；
- 为什么 hysteresis 会影响性能抖动和用户体验；
- 如何找出闲置设备未进入 runtime suspend 的功耗问题；
- 如何同时验证热态稳定、冷却恢复和低功耗恢复能力。

热设计、频率策略和工作负载不是三个独立问题。把它们放到同一条时间曲线中记录，才能做出既安全又可预测的产品性能取舍。

> 🏷️ Linux BSP · thermal zone · CPUFreq · Devfreq · runtime PM · cooling device · power
