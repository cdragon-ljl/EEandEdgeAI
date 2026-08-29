---
title: "嵌入式知识体系 · Linux 驱动开发实战 #17 · PWM 子系统与背光、电机控制实验"
description: "从周期、占空比、极性出发理解 Linux PWM provider/consumer，并完成可测量的背光或低功率输出实验。"
pubDate: "2026-08-29"
series: linux-driver
order: 17
tags: ["Linux Driver", "PWM", "Backlight", "Motor"]
draft: true
---

PWM 在固定周期内控制有效时间。占空比改变平均能量，频率决定重复速度。LED 调光、背光、蜂鸣器和电机控制都可能使用 PWM，但负载电路和控制目标不同。

## 1. pwm_state 描述完整输出

```c
struct pwm_state state;

pwm_get_state(pwm, &state);
state.period = 20000;       /* ns */
state.duty_cycle = 10000;   /* 50% */
state.polarity = PWM_POLARITY_NORMAL;
state.enabled = true;
ret = pwm_apply_might_sleep(pwm, &state);
```

一次应用完整 state 比先改 period 再改 duty 更容易避免瞬间无效配置。`duty_cycle` 不能大于 `period`。

## 2. provider 和 consumer 分工

SoC PWM controller 注册 pwm_chip，consumer 通过设备树引用 channel：

```dts
backlight {
    compatible = "pwm-backlight";
    pwms = <&pwm2 0 20000 0>;
    brightness-levels = <0 10 30 60 100>;
    default-brightness-level = <3>;
};
```

已有 `pwm-backlight` 时应使用标准驱动，不再创建私有字符设备。自定义 consumer 通过 `devm_pwm_get()` 取得 PWM，并在 probe 中读取实际能力。

## 3. 占空比不等于感知亮度

人眼亮度感知、LED 电流和显示面板曲线都不是简单线性关系，因此 backlight 使用 brightness table。电机还需要驱动桥、电流能力、方向和保护，SoC PWM 引脚不能直接带动电机。

## 4. 用波形验证配置

改变 10%、50%、90% 占空比，用示波器测周期、有效电平和极性。sysfs/debugfs 显示配置并不能证明引脚复用和外部电路正确。

```sh
cat /sys/kernel/debug/pwm 2>/dev/null
find /sys/class/backlight -maxdepth 2 -type f
```

suspend/remove 前把负载置于安全状态，再释放 PWM。下一篇讨论 runtime PM 和系统睡眠如何让整个设备而非单个 PWM 进入低功耗。

## 5. provider 会对请求参数进行舍入

PWM controller 的输入 clock 和计数器位宽决定可实现的 period。consumer 请求 20 000 ns，provider 可能只能配置一个接近值。调用 `pwm_apply_might_sleep()` 后用 `pwm_get_state()` 读取实际 state，并用示波器确认，不要假定所有纳秒值都能精确实现。

provider driver 通常在 `apply` 中计算 prescaler/period counter、处理 polarity，并以不会产生危险毛刺的顺序更新寄存器。若硬件要求先 disable 再修改，consumer 在运行中切换 period 可能产生短暂空窗；这属于 controller 能力，应由 provider 统一处理。

## 6. 完成一组可比较的调光实验

固定 period，依次应用 0%、10%、50%、90% 和 100% duty，记录 requested state、actual state、波形和负载现象。再固定 duty ratio 改变 frequency，观察 LED 是否闪烁、蜂鸣器音调或驱动电路开关损耗变化。

```c
static int set_brightness(struct demo_pwm *demo,
                          unsigned int value, unsigned int max)
{
    struct pwm_state state;

    pwm_get_state(demo->pwm, &state);
    state.duty_cycle = DIV_ROUND_CLOSEST_ULL(
        state.period * value, max);
    state.enabled = value != 0;
    return pwm_apply_might_sleep(demo->pwm, &state);
}
```

这个函数把用户亮度映射到 duty，但产品通常还需要非线性 table、功放 enable 或 regulator 时序。卸载和 suspend 时明确选择关闭还是保持状态，不能让输出停在不确定电平。

## 7. 参考资料

- [Linux PWM](https://docs.kernel.org/driver-api/pwm.html)
- [野火：PWM 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_pwm_subsystem.html)
