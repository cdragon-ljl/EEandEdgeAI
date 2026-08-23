---
title: "嵌入式知识体系 · #28 · SysTick 的妙用：不止是 RTOS 的心跳"
description: "SysTick 是 Cortex-M 内核中一个仅有 24 位计数器的简单定时器，几乎被所有 RTOS 用作调度心跳。但它的潜力远不止于此——从精准微秒延时到代码性能分析，从软件定时器链到任务超时监控，SysTick 是 Cortex-M 上最被低估的万能工具之一。"
pubDate: "2026-08-23"
series: "ee-system"
order: 28
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
SysTick 是 Cortex-M 内核中一个仅有 24 位计数器的简单定时器，几乎被所有 RTOS 用作调度心跳。但它的潜力远不止于此——从精准微秒延时到代码性能分析，从软件定时器链到任务超时监控，SysTick 是 Cortex-M 上最被低估的万能工具之一。

## 一、SysTick 寄存器全解

SysTick 属于系统控制块（SCB），共 4 个寄存器：

```c
// SysTick 寄存器地址（CMSIS 标准定义）
SysTick->CTRL   // 0xE000E010 — 控制和状态
SysTick->LOAD   // 0xE000E014 — 重装载值（24位，最大值 0xFFFFFF）
SysTick->VAL    // 0xE000E018 — 当前值（读返回计数器值，写清零）
SysTick->CALIB  // 0xE000E01C — 校准值（厂家预置）
```

**CTRL 寄存器明细：**

```
CTRL (0xE000E010)
位段：
[16]    COUNTFLAG — 计数器从 1→0 跳变时置 1，读取后清零
[2]     CLKSOURCE — 时钟源：0=外部参考时钟/1=内核时钟
[1]     TICKINT   — 中断使能：1 时递减到 0 触发异常
[0]     ENABLE    — 定时器使能
```

```c
// SysTick 的 CMSIS 封装函数
void SysTick_Config(uint32_t ticks)
{
    if (ticks > 0xFFFFFFUL) return;  // 24 位计数器限制
    
    // 设置重装载值
    SysTick->LOAD = ticks - 1;       // 从 ticks 减到 0
    
    // 使能 SysTick 中断，使用内核时钟
    NVIC_SetPriority(SysTick_IRQn, 0xFF);  // 最低优先级
    SysTick->VAL  = 0;                     // 清零计数器
    SysTick->CTRL = 0x07;                  // ENABLE | TICKINT | CLKSOURCE
}
```

### 时钟源选择的关键差异

| CLKSOURCE | 时钟源 | 典型频率 | 影响 |
|-----------|--------|---------|------|
| 1（内核时钟） | 处理器时钟 HCLK | 168MHz (STM32F4) | 最高精度，最快计数 |
| 0（外部参考） | AHB 分频后 | HCLK/8 = 21MHz (STM32F4) | 低频省电，兼容 HALT 模式 |

```c
// 获取 SysTick 时钟频率
uint32_t get_systick_freq(void)
{
    if (SysTick->CTRL & (1 << 2)) {
        return SystemCoreClock;           // CLKSOURCE = 内核时钟
    } else {
        return SystemCoreClock / 8;       // CLKSOURCE = 外部参考
    }
}
```

## 二、精准延时：比 HAL_Delay 更好的选择

HAL_Delay 依赖 SysTick 中断，最小精度是 1ms，且在中断中调用会产生递归锁死。

```c
// 基于 SysTick VAL 的微秒级延时（阻塞式，~1μs 精度）
// ⚠️ 前提：SysTick 已被初始化为 1ms 中断模式

void delay_us(uint32_t us)
{
    uint32_t ticks_per_us = get_systick_freq() / 1000000;
    uint32_t target = ticks_per_us * us;
    
    uint32_t start = SysTick->VAL;       // 读取当前递减值
    uint32_t elapsed = 0;
    
    while (elapsed < target) {
        uint32_t current = SysTick->VAL;
        
        if (current <= start) {
            elapsed += start - current;  // 正常递减
        } else {
            // 计数器绕回：已溢出（走过一次 LOAD→0）
            elapsed += start;            // 第一次递减到 0
            elapsed += (SysTick->LOAD - current); // 第二次递减
            start = SysTick->LOAD;       // 重置参考点
        }
        
        if (elapsed >= target) break;
    }
}
```

**为什么不用 for(i=0;i<n;i++) 空循环？** — 编译器优化会改变循环行为，且循环节拍随 CPU 频率变化，移植性极差。

### 利用 CALIB 校准值做跨芯片适配

```c
// CALIB 寄存器包含厂家预置的 10ms 校准值
uint32_t ten_ms_ticks = SysTick->CALIB & 0x00FFFFFF;

if (ten_ms_ticks != 0) {
    // 厂家提供了校准值 → 用于自适应延时
    uint32_t ticks_per_us = ten_ms_ticks / 10000;
} else {
    // 无校准值 → 回退到计算
    uint32_t ticks_per_us = SystemCoreClock / 1000000;
}
```

## 三、代码性能分析：测量函数执行时间

SysTick 的 VAL 寄存器保存当前计数器值（递减），通过读取差值可以精确测量一段代码的执行时长——比示波器打 GPIO 更方便。

```c
// 使用 SysTick 测量代码执行时间
// ⚠️ 确保测量期间无 SysTick 中断发生

static uint32_t perf_start_val;
static uint32_t perf_start_ticks;

void perf_start(void)
{
    // 记录当前 SysTick 状态
    perf_start_val = SysTick->VAL;
    perf_start_ticks = SysTick->LOAD - SysTick->VAL;  // 已流逝的 ticks
}

uint32_t perf_stop(void)
{
    uint32_t end_val = SysTick->VAL;
    uint32_t load = SysTick->LOAD;
    uint32_t elapsed;
    
    if (end_val <= perf_start_val) {
        elapsed = perf_start_val - end_val;
    } else {
        // 发生了重装载（测量跨越了 1ms 边界）
        // 简单场景：加上一次重装载的 ticks
        elapsed = (perf_start_val + 1) + (load - end_val);
    }
    
    return elapsed;  // 返回 ticks 数
}

// 使用示例
void measure_function(void)
{
    perf_start();
    critical_function();       // 被测量的函数
    uint32_t ticks = perf_stop();
    
    uint32_t ns = ticks * 1000000000 / get_systick_freq();
    printf("critical_function 耗时: %u ns (%u ticks)\n", ns, ticks);
}
```

**溢出处理是关键：** 当测量跨越了 SysTick 重装周期（比如超过 1ms），VAL 会从 0 跳回到 LOAD，必须处理绕回。

## 四、软件定时器链：单 SysTick 驱动多层定时器

SysTick 每 1ms 产生一次中断，但我们可以在这 1ms 基础上构建任意周期的软件定时器链。

```c
// 软件定时器数据结构
typedef struct {
    volatile uint32_t count;     // 递减计数器
    volatile uint32_t reload;    // 重装值
    void (*callback)(void *);    // 超时回调
    void *arg;                   // 回调参数
    uint8_t repeat;              // 0=单次 1=周期
    uint8_t active;              // 0=未激活 1=已激活
} soft_timer_t;

#define MAX_SOFT_TIMERS 8
static soft_timer_t timers[MAX_SOFT_TIMERS];

// SysTick 中断中调用
void soft_timer_tick(void)
{
    for (int i = 0; i < MAX_SOFT_TIMERS; i++) {
        if (!timers[i].active) continue;
        
        if (--timers[i].count == 0) {
            // 定时器到期
            if (timers[i].callback) {
                timers[i].callback(timers[i].arg);
            }
            
            if (timers[i].repeat) {
                timers[i].count = timers[i].reload;  // 周期模式
            } else {
                timers[i].active = 0;                 // 单次模式
            }
        }
    }
}

// 启动一个软件定时器
int soft_timer_start(uint32_t ms, int repeat,
                     void (*cb)(void *), void *arg)
{
    int slot = -1;
    for (int i = 0; i < MAX_SOFT_TIMERS; i++) {
        if (!timers[i].active) {
            slot = i;
            break;
        }
    }
    if (slot < 0) return -1;  // 无可用槽位
    
    timers[slot].count    = ms;
    timers[slot].reload   = ms;
    timers[slot].callback = cb;
    timers[slot].arg      = arg;
    timers[slot].repeat   = repeat;
    timers[slot].active   = 1;
    
    return slot;
}

void soft_timer_stop(int id)
{
    timers[id].active = 0;
}
```

**应用示例：** LED 闪烁（500ms）、按键消抖（50ms）、看门狗喂狗（1000ms）、温度采样周期（2000ms）——一个 SysTick 就足够。

## 五、任务超时监视

在 RTOS 中，可以用 SysTick 检测某个任务是否在规定时间内响应——在工业控制中，这比硬件看门狗更精细。

```c
typedef struct {
    uint32_t task_id;
    volatile uint32_t last_heartbeat;  // 任务最后一次"报平安"的时间戳
    uint32_t timeout_ms;               // 超时阈值
    void (*timeout_cb)(uint32_t task_id);  // 超时回调
} task_watchdog_t;

task_watchdog_t watchdog_table[4];     // 监控 4 个关键任务

// 任务调用来报告自己还活着
void task_watchdog_feed(uint32_t task_id)
{
    watchdog_table[task_id].last_heartbeat = get_systick_ms();
}

// 每秒调用一次（由软件定时器或主循环触发）
void task_watchdog_check(void)
{
    uint32_t now = get_systick_ms();
    
    for (int i = 0; i < 4; i++) {
        uint32_t elapsed = now - watchdog_table[i].last_heartbeat;
        
        if (elapsed > watchdog_table[i].timeout_ms) {
            // 任务超时！
            watchdog_table[i].timeout_cb(i);
        }
    }
}

uint32_t get_systick_ms(void)
{
    // 全局 SysTick 计数器（在 SysTick_Handler 中递增）
    return systick_ms_counter;
}
```

相比硬件独立看门狗（IWDG），这种软件方式的不同在于：**可以区分哪个任务出问题**，而硬件看门狗只知道整个系统挂了。

## 六、FreeRTOS 占用 SysTick 后的注意事项

这是最常见的问题：用户在 FreeRTOS 项目里想用 SysTick 做延时或测量，发现不工作了。

```c
// FreeRTOSConfig.h 中的配置
#define configTICK_RATE_HZ        ((TickType_t)1000)  // SysTick 1ms 中断

// FreeRTOS 初始化时调用
// vTaskStartScheduler() 内部会配置 SysTick
// 此后 SysTick 归 RTOS 内核管理！
```

**FreeRTOS 占用了 SysTick 后，用户不能做的事：**

1. ❌ 调用 `SysTick_Config()` 重新配置——会打乱 RTOS 的 tick 计数
2. ❌ 修改 `SysTick->LOAD`——导致 `xTaskGetTickCount()` 异常
3. ❌ 在 SysTick_Handler 中插入用户代码——FreeRTOS 已使用该入口

**正确的替代方案：**

```c
// ✅ 方案 1：使用 vTaskDelay() 替代自旋延时
vTaskDelay(pdMS_TO_TICKS(100));  // 延时 100ms

// ✅ 方案 2：使用 xTaskGetTickCount() 获取时间戳
TickType_t start = xTaskGetTickCount();
// ... 做点事 ...
TickType_t elapsed = xTaskGetTickCount() - start;
if (elapsed > pdMS_TO_TICKS(500)) {
    // 超时处理
}

// ✅ 方案 3：如果需要更高精度定时器，用硬件定时器（TIM）
// 而不是跟 SysTick 抢资源
HAL_TIM_Base_Start_IT(&htim2);  // 使用 TIM2

// ✅ 方案 4：使用 DWT 周期计数器（Cortex-M3+）
// DWT->CYCCNT 是 32 位 CPU 周期计数器，不受 SysTick 影响
uint32_t cycles = DWT->CYCCNT;
```

### DWT 周期计数器的使用

Cortex-M3/M4/M7 的 DWT（Data Watchpoint and Trace）模块提供了一个 **32 位的 CPU 周期计数器**，比 SysTick 更高精度且不互斥：

```c
void dwt_init(void)
{
    // 使能 DWT 模块
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    
    // 使能周期计数器
    DWT->CYCCNT = 0;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}

uint32_t dwt_get_cycles(void)
{
    return DWT->CYCCNT;
}

uint32_t dwt_measure(void (*func)(void))
{
    uint32_t start = DWT->CYCCNT;
    func();
    uint32_t end = DWT->CYCCNT;
    
    return end - start;  // 执行周期数
}
```

## 七、SysTick 的 HALT 模式行为

调试时暂停 CPU（断点命中），SysTick 是否继续？

```c
// SysTick->CTRL 的第 0 位控制
// 在大多数实现中，SysTick 在 CPU HALT 时也会暂停
// 但需要具体验证——有些 Debugger 配置可能让 SysTick 继续运行
```

这意味着：**用 SysTick 做延时，断点后恢复执行，延时时间可能不准**。对于需要长时间精确延时的场景（如 Bootloader 中的等待超时），使用独立硬件定时器更可靠。

## 总结

SysTick 远不止是 RTOS 的心跳。理解了它的四个寄存器、掌握 VAL 差值测量法和软件定时器链构建，你就能在几乎不增加硬件成本的情况下，实现精准延时（~1μs）、代码性能分析、多层软件定时器和任务超时监控。但也要记住它的边界：FreeRTOS 下别跟它抢，高精度场景用 DWT 或硬件定时器，调试暂停时注意行为。

> 🏷️ SysTick Cortex-M 系统定时器 延时 性能分析 软件定时器 DWT
