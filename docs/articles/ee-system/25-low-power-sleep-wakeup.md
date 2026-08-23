---
title: "嵌入式知识体系 · #25 · 低功耗设计实战：STOP / STANDBY 模式与唤醒策略"
description: "电池供电的设备，功耗就是生命线。一个传感器节点用 3.7V/2000mAh 锂电池供电，如果一直运行在 Run 模式（几十 mA），几天就没电了；如果用好了低功耗模式，同样的电池可以跑几个月甚至几年。"
pubDate: "2026-08-23"
series: "ee-system"
order: 25
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
电池供电的设备，功耗就是生命线。一个传感器节点用 3.7V/2000mAh 锂电池供电，如果一直运行在 Run 模式（几十 mA），几天就没电了；如果用好了低功耗模式，同样的电池可以跑几个月甚至几年。

STM32 的睡眠体系提供了三个层次的省电模式——Sleep、Stop、Standby——每个模式都在功耗、唤醒延迟和保持状态之间做了取舍。本文从这三个模式的底层硬件行为讲起，给出三个实测案例，最后对比 ESP32 的低功耗体系。

---

## 一、STM32 三态睡眠体系

### 1.1 Sleep 模式：CPU 停，其他照跑

**状态：** 只关 CPU 内核时钟，外设（UART、Timer、DMA、ADC）继续运行。

```
Sleep 模式功耗：约 0.5~5 mA（取决于外设开启数量）
唤醒延迟：     < 1 μs
保持状态：     SRAM 全保留，寄存器全保留
```

```c
void enter_sleep(void) {
    /* 进入 Sleep 模式（WFI 指令触发的深度睡眠） */
    HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI);
    /* 醒来后直接从这里继续执行 */
}
```

**典型场景：** MCU 在等待 UART 数据时进入 Sleep，UART RX 中断唤醒，立即处理。

### 1.2 Stop 模式：时钟停，SRAM 保

**状态：** 关闭所有系统时钟（HSI/HSE/PLL 全停），主调压器关闭或进入低功耗模式。SRAM 和寄存器内容保持。

```
Stop 模式功耗：约 20~100 μA（取决于调压器模式和 RTC 是否运行）
唤醒延迟：     约 5~20 μs（需要等待时钟重新稳定）
保持状态：     SRAM 全保留，寄存器全保留（Stop Mode 1 甚至保持连接状态）
```

```c
void enter_stop(void) {
    /* 配置 RTC 闹钟用于定时唤醒（1 分钟后唤醒） */
    RTC_AlarmTypeDef alarm = {0};
    HAL_RTC_GetTime(&hrtc, &rtc_time, RTC_FORMAT_BIN);
    
    alarm.AlarmTime.Seconds = (rtc_time.Seconds + 60) % 60;
    alarm.Alarm = RTC_ALARM_A;
    HAL_RTC_SetAlarm_IT(&hrtc, &alarm, RTC_FORMAT_BIN);
    
    /* 进入 Stop 模式（保留 SRAM，LP 调压器） */
    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
    
    /* 醒来后执行系统时钟重新配置（HAL 会自动恢复）*/
    SystemClock_Config();   /* 从 HSI 重新启动 PLL */
}
```

**典型场景：** 传感器节点在采集间隔（几秒到几分钟）进入 Stop，RTC 闹钟唤醒采集数据。

### 1.3 Standby 模式：几乎全关

**状态：** 关闭内部调压器，SRAM 内容丢失（除了备份域），大部分唤醒逻辑关闭。

```
Standby 模式功耗：约 1~2 μA
唤醒延迟：        约 100~500 μs（从复位唤醒，需重新初始化）
保持状态：        SRAM 丢失！仅备份寄存器 + RTC 保留
```

```c
void enter_standby(void) {
    /* 清除 Standby 唤醒标志 */
    __HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU);
    
    /* 使能 Wakeup Pin（PA0）*/
    HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1);
    
    /* 进入 Standby 模式 */
    HAL_PWR_EnterSTANDBYMode();
    
    /* 醒来后相当于从复位启动，不会回到这里 */
}
```

**典型场景：** 遥控器、按键唤醒的电池设备——90% 时间处于 1 μA 左右的极致低功耗，按下按键后"冷启动"开始工作。

### 1.4 三种模式对比

| 模式 | 功耗 | 唤醒延迟 | 保留状态 | 唤醒源 |
|------|:----:|:--------:|:---------|:------|
| **Sleep** | mA 级 | < 1 μs | 全部保留 | 任意中断 |
| **Stop** | 20~100 μA | 5~20 μs | SRAM + 寄存器 | EXTI、RTC、UART Wakeup |
| **Standby** | 1~2 μA | 100~500 μs | 仅备份域 | Wakeup Pin、RTC、IWDG |

---

## 二、唤醒源选择

### 2.1 EXTI（外部中断）

任何 GPIO 都可以配置为 EXTI 唤醒源——这是最通用的唤醒方式。

```c
/* 配置 PA0（按键）作为 Stop 唤醒源 */
void exti_config(void) {
    GPIO_InitTypeDef gpio = {0};
    
    /* PA0 上拉输入 */
    gpio.Pin = GPIO_PIN_0;
    gpio.Mode = GPIO_MODE_IT_RISING;
    gpio.Pull = GPIO_PULLDOWN;
    HAL_GPIO_Init(GPIOA, &gpio);
    
    /* EXTI 线 0 中断使能 */
    HAL_NVIC_SetPriority(EXTI0_IRQn, 2, 0);
    HAL_NVIC_EnableIRQ(EXTI0_IRQn);
}

/* 唤醒后从中断处理返回 HALT */
void EXTI0_IRQHandler(void) {
    HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_0);
}
```

### 2.2 RTC 闹钟 / 唤醒定时器

定时唤醒是最常见的功耗管理手段。RTC 可以在 Stop 和 Standby 模式下保持运行。

```c
/* RTC 闹钟唤醒配置（循环定时 10 秒）*/
void rtc_wakeup_config(void) {
    RTC_WakeUpTypeDef wakeup = {0};
    
    wakeup.WakeUpClock = RTC_WAKEUPCLOCK_CK_SPRE_16BITS;  /* 2 Hz tick */
    wakeup.WakeUpCounter = 20 - 1;                         /* 20 ticks = 10 秒 */
    HAL_RTCEx_SetWakeUpTimer_IT(&hrtc, &wakeup, RTC_FORMAT_BIN);
}

void RTC_WKUP_IRQHandler(void) {
    HAL_RTCEx_WakeUpTimerIRQHandler(&hrtc);
}
```

### 2.3 USART 唤醒

Stop 模式下，USART 可以通过检测起始位唤醒 MCU。这在"串口命令待机"场景极其有用。

```c
/* USART2 唤醒配置 */
void uart_wakeup_config(void) {
    USART_WakeUpTypeDef wakeup = {0};
    
    /* 使能 USART 的 Stop 模式唤醒 */
    wakeup.WakeUpEvent = USART_WAKEUP_ON_STARTBIT;
    HAL_USARTEx_StopModeWakeUpConfig(&huart2, &wakeup);
    
    /* 使能 USART 中断（必须，否则不产生唤醒信号）*/
    __HAL_USART_ENABLE_IT(&huart2, USART_IT_WUF);
}
```

### 2.4 Wakeup Pin（Standby 模式专用）

STM32 在 Standby 模式下只有少数管脚可以作为唤醒源：

| 芯片系列 | Wakeup Pin 引脚 |
|---------|----------------|
| STM32F0/1/3/4 | PA0 (WKUP1) |
| STM32L0/1/4 | PA0, PC13, PE6 等（多个） |
| STM32G0/G4 | PB7, PC13 等 |

> Wakeup Pin 的边沿检测是在 Standby 模式下**唯一能唤醒**的 GPIO 功能。其他 EXTI 引脚在 Standby 下无效。

### 2.5 唤醒时间对比

```
Sleep:  │██┤ < 1 μs
Stop:   │███████████████████┤ 5~20 μs
Standby:│██████████████████████████████████████████████████████████████┤ 100~500 μs
```

**实际影响：** 如果设备每秒唤醒一次做几微秒的事情，Sleep 模式的功耗浪费可忽略；如果用 Standby，每次唤醒重新初始化外设 + 系统时钟，占用的时间可能接近工作时间本身。

---

## 三、实测案例

### 案例 1：定时传感器采集（Stop + RTC）

**场景：** 温湿度传感器每隔 5 分钟采集一次数据，通过 LoRa 发送。

```c
void sensor_node_app(void) {
    /* 初始化外设 */
    sensor_init();     /* SHT30 I2C */
    lora_init();       /* LoRa 模块 */
    rtc_wakeup_config(5 * 60);  /* 5 分钟唤醒 */
    
    uint32_t measurement_count = 0;
    
    while (1) {
        /* 采集 */
        sensor_read(&temp, &humid);
        lora_send(temp, humid);
        
        measurement_count++;
        
        /* 5 分钟内不会被唤醒——进入 Stop */
        __HAL_RTC_WAKEUPTIMER_CLEAR_FLAG(&hrtc, RTC_FLAG_WUTF);
        HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
        
        /* 醒来：重新配置时钟 */
        SystemClock_Config();
        
        /* RTC_WKUP_IRQHandler 已处理，继续循环 */
    }
}
```

**功耗预算：**

| 阶段 | 电流 | 持续时间 | 能量占比 |
|------|:----:|:--------:|:--------:|
| Run（采集+发送） | 30 mA | 500 ms | 60% |
| Stop（睡眠） | 50 μA | 299.5 s | 40% |
| **平均电流** | **~0.55 mA** | — | — |

> 一块 2000 mAh 锂电池：理论续航 ≈ 2000 / 0.55 = 3636 小时 ≈ **151 天**。

**如果不用 Stop 而是一直 Run（30 mA）：** 续航 ≈ 2000 / 30 = 66 小时 ≈ **2.8 天**。差距就是这么大。

### 案例 2：按键唤醒（Standby + Wakeup Pin）

**场景：** 手持遥控器，平时不耗电，按任意键触发。

```c
void remote_app(void) {
    /* 上电初始化 */
    if (__HAL_PWR_GET_FLAG(PWR_FLAG_SB) != RESET) {
        /* 从 Standby 醒来（按键唤醒）*/
        __HAL_PWR_CLEAR_FLAG(PWR_FLAG_SB);
        
        /* 使用备份寄存器判断是否需要执行操作 */
        if (RTC->BKP4R == 0xA5A5) {
            send_remote_command();     /* 发送射频指令 */
        }
    }
    
    /* 保存状态到备份寄存器 */
    RTC->BKP4R = 0xA5A5;
    
    /* 配置 Wakeup Pin 并进入 Standby */
    HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1);
    HAL_PWR_EnterSTANDBYMode();    /* 1.5 μA */
}

void send_remote_command(void) {
    /* 初始化 RF 模块 */
    rf_init();
    rf_send(COMMAND_START);
    rf_deinit();
}
```

**功耗：** Standby 下仅 1.5 μA，每天按 10 次，每次工作 100 ms（30 mA），理论续航数年。

### 案例 3：串口唤醒（Stop + USART）

**场景：** 设备通过 USB-UART 接收主机命令，平时处于低功耗，收到命令立即处理。

```c
void uart_slave_app(void) {
    uart_wakeup_config();     /* 配置 USART 唤醒 */
    
    while (1) {
        /* 进入 Stop，等待 UART 数据唤醒 */
        HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
        
        /* 被 UART 起始位唤醒 */
        SystemClock_Config();
        
        /* 正常接收数据帧 */
        if (uart_receive_frame(&cmd_buf, timeout_ms(100))) {
            process_command(&cmd_buf);
        }
    }
}
```

**注意：** UART 唤醒只在 **Stop 模式**下有效（不是 Standby）。UART RX 线上的起始位跳变会触发内部 WUF（Wake-Up From）中断，将系统从 Stop 带回 Run。第一个字节的起始位本身可能无法被正确接收——所以唤醒后的第一帧可能会有误码，需要软件层面的重试或帧头同步。

---

## 四、ESP32 低功耗模式对比

ESP32 也有类似的睡眠模式，但它的 WiFi/BLE 协议栈带来了额外的复杂性：

| 模式 | 功耗 | 唤醒延迟 | 状态保持 | 说明 |
|------|:----:|:--------:|:---------|:-----|
| **Modem-sleep** | 3~5 mA | < 1 ms | 全部 | CPU 跑，关闭 WiFi/BLE 射频 |
| **Light-sleep** | 130~500 μA | < 3 ms | SRAM + RTC | CPU 暂停 + 时钟门控 |
| **Deep-sleep** | 5~10 μA | ~25 ms | RTC 内存仅 8KB | 大部分 SRAM 掉电 |
| **Hibernation** | 2.5 μA | 慢（~45ms） | 仅 RTC 定时器 | 极致省电，RTC 内存也丢 |

### ESP32 深度睡眠实战

```c
#include "esp_sleep.h"

void app_main(void) {
    /* 配置唤醒源 */
    const int wakeup_time_sec = 3600;  /* 1 小时 */
    esp_sleep_enable_timer_wakeup(wakeup_time_sec * 1000000);

    /* 也可以组合多个唤醒源 */
    esp_sleep_enable_ext0_wakeup(GPIO_NUM_0, 0);  /* GPIO0 低电平唤醒 */
    
    /* 保存数据到 RTC 内存（Deep-sleep 中保留）*/
    RTC_DATA_ATTR int boot_count = 0;
    boot_count++;
    
    /* 进入深度睡眠 */
    esp_deep_sleep_start();
    /* 到不了这里 */
}

void setup(void) {
    /* 醒来后从 app_main 重新开始 */
    init_uart();
    init_sensor();
    
    read_sensor_and_report();
    
    /* 继续睡 */
    esp_deep_sleep_start();
}
```

**ESP32 Deep-sleep 的特别之处：** RTC 内存（RTC_DATA_ATTR 修饰的变量）是 Deep-sleep 后唯一保留的数据区——只有 8KB，必须精打细算。

---

## 五、电源测量技巧：从 mA 到 μA 的追踪

### 5.1 串联电阻法

当电流降到 μA 级别时，用万用表串联测量已经很困难（万用表的分流电阻压降会干扰电路）。一个实用的方法是用**小电阻 + 示波器**：

```c
/* 测试电路 */
/* VDD ──── 10Ω 电阻 ──── VDD_MCU ──── GND */

/* 示波器探头：差分测量电阻两端电压 */
/* I = V / R = 电压差(mV) / 10(Ω) = 电流(mA) */
```

**操作步骤：**
1. 在 VDD 供电回路串联一个 **10 Ω 的精密电阻**
2. 示波器两个通道分别测电阻两端
3. 用数学通道 `CH1 - CH2` 计算压降
4. 将压降 (mV) ÷ 10 (Ω) 得到电流 (mA)

当电流降到 μA 级别（10 μA），10Ω 上的压降只有 100 μV——普通示波器已经很难分辨。可以换成 100Ω 或 1kΩ：

```
10 μA × 1 kΩ = 10 mV ← 示波器可清晰分辨
```

### 5.2 跳变电流的捕捉

低功耗设备在唤醒瞬间会产生一个电流脉冲（几个 mA 但持续几十 μs）：

```
电流波形：
80 mA ┤ ██
      │ ██
      │ ██
 1 μA ┤██████████████████████████████████████
      └────────────────────────────────────────时间
       ↑ 唤醒脉冲 (~200 μs)          ↑ 睡眠
```

普通万用表测不出来这个脉冲——示波器配合电流探头或用小电阻法才能抓到。

### 5.3 测量时的常见陷阱

1. **去耦电容的影响：** MCU 旁边的 100 μF 电容会存储电荷，睡眠时电容放电给 MCU 供电，导致测量的"平均电流"偏低。建议在电容前串联电阻测量。
2. **GPIO 漏电：** 未配置的 GPIO 处于浮空态，会有微小漏电。所有未使用的 GPIO 要配置为 `ANALOG` 模式或 `OUTPUT PUSH-PULL LOW`。
3. **电压转换器：** LDO 自身有静态电流（quiescent current），低功耗设计必须选用 IQ 在 1 μA 以下的 LDO（如 TPS7A02）。
4. **SWD 调试器：** SWD 接口在调试时保持供电，会阻止 MCU 进入深度睡眠——测量时必须断开调试器。

---

## 总结

低功耗设计的本质是**时间的比例**：省电模式下的功耗越低越好，但唤醒后尽快做完事继续睡同样重要。

选型口诀：

> **毫安级工作，微秒完成；**
> **微安级待机，按需唤醒。**
> **Stop 适用定时采，**
> **Standby 适合万年待。**
> **ESP 深睡存 RTC，**
> **唤醒先配时钟快。**

一个设计良好的电源管理策略，能让电池设备的续航从"几天"变成"几个月"。下一篇文章，我们将深入嵌入式实时系统中最容易被忽视的"看门狗"——它既是守护者，也可能是绊脚石。

> 🏷️ 低功耗 STOP STANDBY Sleep 模式 唤醒源 EXTI RTC 闹钟 USART 唤醒 Wakeup Pin ESP32 Deep-sleep Light-sleep 功耗测量 串联电阻 电源管理 嵌入式
