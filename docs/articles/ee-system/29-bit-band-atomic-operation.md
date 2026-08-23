---
title: "嵌入式知识体系 · #29 · bit-band 操作：Cortex-M 的原子位操作黑科技"
description: "在嵌入式开发中，最频繁的操作之一是读-改-写（RMW）某个寄存器的某一位。传统方式需要三条指令（读→改→写），不仅代码量大，还存在非原子性的隐患——如果这两条指令之间发生了中断，操作就不可靠了。Cortex-M3/M4/M0+ 引入了 bit-band（位带） 机制，将每一个比特位映射到一个完整的 32 位地址空间，修改位变成了写一个 32 位字——在硬件层面保证了操作的原子性。"
pubDate: "2026-08-23"
series: "ee-system"
order: 29
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
在嵌入式开发中，最频繁的操作之一是**读-改-写（RMW）**某个寄存器的某一位。传统方式需要三条指令（读→改→写），不仅代码量大，还存在**非原子性**的隐患——如果这两条指令之间发生了中断，操作就不可靠了。Cortex-M3/M4/M0+ 引入了 **bit-band（位带）** 机制，将每一个比特位映射到一个完整的 32 位地址空间，修改位变成了写一个 32 位字——在硬件层面保证了操作的原子性。

## 一、bit-band 原理

bit-band 将两个 1MB 的**位带区**（bit-band region）映射到两个 32MB 的**别名区**（bit-band alias region），比例为 **1 bit → 1 word（32 位）**。

```c
// 位带区与别名区
// SRAM 位带区：     0x20000000 ~ 0x200FFFFF  (1MB)
// SRAM 别名区：     0x22000000 ~ 0x23FFFFFF  (32MB)
//
// 外设位带区：     0x40000000 ~ 0x400FFFFF  (1MB)
// 外设别名区：     0x42000000 ~ 0x43FFFFFF  (32MB)
```

**地址映射公式：**

```
别名区地址 = 位带区基址 + (字节偏移 × 32) + (位号 × 4)

或者更准确：
别名区地址 = 别名区基址 + ((addr - 位带区基址) × 32 + bit_num × 4)
```

以 SRAM 为例：
```
alias_addr = 0x22000000 + (target_addr - 0x20000000) * 32 + bit_number * 4
```

### 映射示例

假设我们要操作 SRAM 地址 `0x20000004` 的 bit 7：

```
alias_addr = 0x22000000 + (0x20000004 - 0x20000000) * 32 + 7 * 4
           = 0x22000000 + 0x04 * 32 + 28
           = 0x22000000 + 0x80 + 0x1C
           = 0x2200009C
```

向 `0x2200009C` 写入任何**奇数**值（最低位为 1），硬件自动将 `0x20000004` 的 bit 7 置 1；写偶数则清零。

## 二、宏定义：让 bit-band 操作更优雅

```c
// bit-band 宏定义
#define BITBAND_SRAM_ADDR(addr, bit) \
    ((uint32_t)(0x22000000 + (((uint32_t)(addr) - 0x20000000) * 32) + ((uint32_t)(bit) * 4)))

#define BITBAND_PERIPH_ADDR(addr, bit) \
    ((uint32_t)(0x42000000 + (((uint32_t)(addr) - 0x40000000) * 32) + ((uint32_t)(bit) * 4)))

// 写入宏
#define BITBAND_SRAM(addr, bit, val) \
    (*(volatile uint32_t *)BITBAND_SRAM_ADDR(addr, bit) = (val))

#define BITBAND_PERIPH(addr, bit, val) \
    (*(volatile uint32_t *)BITBAND_PERIPH_ADDR(addr, bit) = (val))

// 读取宏
#define BITBAND_SRAM_READ(addr, bit) \
    (*(volatile uint32_t *)BITBAND_SRAM_ADDR(addr, bit))

#define BITBAND_PERIPH_READ(addr, bit) \
    (*(volatile uint32_t *)BITBAND_PERIPH_ADDR(addr, bit))
```

### GPIO 位带封装：像 51 单片机一样操作 IO

经典的 51 单片机可以用 `P1_0 = 1` 操作单个 IO 口。在 Cortex-M 上，借助 bit-band 也能实现类似的效果。

```c
// STM32 GPIOA ODR 寄存器地址
#define GPIOA_ODR_ADDR         (GPIOA_BASE + 0x14)

// 用 bit-band 定义单个引脚
#define PAout(n)               BITBAND_PERIPH_ADDR(GPIOA_ODR_ADDR, n)

// 使用
void gpio_bitband_demo(void)
{
    // 像 51 一样操作——但这是原子操作
    *(volatile uint32_t *)PAout(5) = 1;  // PA5 输出高（原子！）
    *(volatile uint32_t *)PAout(5) = 0;  // PA5 输出低（原子！）
    
    // 批量操作
    for (int i = 0; i < 8; i++) {
        *(volatile uint32_t *)PAout(i) = (data >> i) & 1;
    }
}
```

## 三、bit-band vs 传统 RMW 的性能对比

传统 GPIO 操作（非 bit-band）：

```c
// 传统方式：读-改-写
// GPIOA->ODR |= (1 << 5);   // PA5 置高
// 汇编展开：
// LDR  R0, [GPIOA_ODR]      // 读取
// ORR  R0, R0, #0x20        // 修改
// STR  R0, [GPIOA_ODR]      // 写入
```

问题：如果在 `LDR` 和 `STR` 之间发生了中断，中断里也改了 GPIOA->ODR，中断返回后 `STR` 会把旧值写回去——**覆盖了中断的修改**。

bit-band 方式：

```c
// bit-band 方式：单指令原子操作
// *(volatile uint32_t *)PAout(5) = 1;
// 汇编展开（近似）：
// MOV  R0, #0x22000000+...  // 别名地址
// MOV  R1, #1               // 值
// STR  R1, [R0]             // 单次写入
// 不存在 RMW 窗口
```

**性能对比（STM32F4 @168MHz）：**

| 操作 | 传统 RMW | bit-band |
|------|---------|---------|
| 置位 GPIO | 3 条指令（~45ns） | 3 条指令（~45ns） |
| 执行原子性 | ❌ 可能被中断打断 | ✅ 硬件原子 |
| 中断安全 | 需关中断 | 无需关中断 |
| 代码大小 | 较小 | 较大（地址计算） |
| 可读性 | 标准 | 略差 |

**结论：** 性能几乎一样，但 bit-band 提供了**原子性保证**。

## 四、实战：无锁循环缓冲区 flag 更新

在没有 RTOS 的裸机系统中，中断 + 主循环的典型场景中，位带可以实现某些标志位的**无锁操作**。

```c
// 循环缓冲区状态结构体
typedef struct {
    uint8_t buffer[256];
    volatile uint32_t flags;    // 使用 bit-band 的标志位
                                // bit 0: 数据就绪
                                // bit 1: 溢出
                                // bit 2: 缓冲区满
                                // bit 3: 空闲
} ring_buffer_t;

ring_buffer_t rx_buf __attribute__((section(".sram_bitband")));

// 中断服务程序：设置"数据就绪"标志
void UART_IRQHandler(void)
{
    if (USART1->SR & USART_SR_RXNE) {
        rx_buf.buffer[write_ptr++] = USART1->DR;
        
        // 原子置位 bit 0（数据就绪）
        BITBAND_SRAM(&rx_buf.flags, 0, 1);
        
        // 传统方式需要关中断：
        // __disable_irq();
        // rx_buf.flags |= (1 << 0);
        // __enable_irq();
        // 关中断会延迟更重要的事件！
    }
}

// 主循环：读取标志并处理
void main_loop(void)
{
    while (1) {
        // 原子读取并清零（bit-band 读后写）
        if (BITBAND_SRAM_READ(&rx_buf.flags, 0)) {
            BITBAND_SRAM(&rx_buf.flags, 0, 0);
            process_buffer_data();
        }
    }
}
```

**优势：** 中断中设置标志位不需要关中断，不会影响其他高优先级中断的响应延迟。

## 五、DMA 完成标志位的原子操作

```c
// 使用位带管理多个 DMA 通道的完成标志
#define DMA1_FLAG_ADDR  ((uint32_t)&dma_complete_flags)

// DMA 传输完成中断
void DMA2_Stream7_IRQHandler(void)
{
    if (DMA2->LISR & DMA_LISR_TCIF7) {
        // 清除中断标志
        DMA2->LIFCR = DMA_LIFCR_CTCIF7;
        
        // 原子标记通道 7 完成
        BITBAND_SRAM(&dma_complete_flags, 7, 1);
        
        // 启动下一个传输（主循环检查完成后触发）
    }
}

// 主循环
void process_dma_completions(void)
{
    for (int ch = 0; ch < 8; ch++) {
        if (BITBAND_SRAM_READ(&dma_complete_flags, ch)) {
            BITBAND_SRAM(&dma_complete_flags, ch, 0);
            
            switch (ch) {
                case 0: process_adc_data();   break;
                case 1: process_uart_tx();    break;
                case 2: process_spi_rx();     break;
                // ...
            }
        }
    }
}
```

## 六、中断标志位的原子清除

有时候中断处理函数需要**检查某个特定标志位并清零**，又不影响其他标志位。传统方式只能读整个寄存器再写回，bit-band 让这事变简单。

```c
// 假设我们有一个 32 位的软件事件寄存器
volatile uint32_t event_flags;

// 中断中设置事件
void Timer_IRQHandler(void)
{
    // 原子设置事件 E_EVENT_TIMER_TICK
    BITBAND_SRAM(&event_flags, E_EVENT_TIMER_TICK, 1);
}

void Sensor_IRQHandler(void)
{
    // 原子设置事件 E_EVENT_SENSOR_READY
    BITBAND_SRAM(&event_flags, E_EVENT_SENSOR_READY, 1);
}

// 主循环检查所有事件
void event_dispatcher(void)
{
    while (1) {
        uint32_t flags = event_flags;  // 快照
        
        if (flags & BIT(E_EVENT_TIMER_TICK)) {
            BITBAND_SRAM(&event_flags, E_EVENT_TIMER_TICK, 0);
            handle_timer_tick();
        }
        
        if (flags & BIT(E_EVENT_SENSOR_READY)) {
            BITBAND_SRAM(&event_flags, E_EVENT_SENSOR_READY, 0);
            read_sensor_data();
        }
    }
}
```

## 七、bit-band 的局限与替代方案

### 支持的 Cortex-M 系列

| 架构 | 支持 bit-band？ | 说明 |
|------|:-------------:|------|
| Cortex-M3 | ✅ | 完整支持 |
| Cortex-M4 | ✅ | 完整支持 |
| Cortex-M7 | ✅ | 但需要 DSB 保证写顺序 |
| Cortex-M0+ | ✅ | 完整支持 |
| Cortex-M23/M33 | ❌ | 无 bit-band，用原子指令替代 |
| Cortex-M55 | ❌ | ARMv8.1-M，无 bit-band |

### M33 的原子操作替代

```c
// ARMv8-M 没有 bit-band，但提供了更好的替代：
// 1. LDREX/STREX 独占加载/存储
// 2. 内建原子指令（ARMv8.1-M）

// M33 上的原子位操作
void atomic_set_bit(volatile uint32_t *reg, uint32_t bit)
{
    uint32_t val;
    do {
        val = __LDREXW(reg);           // 独占读
        val |= (1UL << bit);
    } while (__STREXW(val, reg) != 0); // 独占写，失败重试
}

// 或者使用 C11 原子操作（如果编译器支持）
#include <stdatomic.h>
atomic_uint *atomic_reg = (atomic_uint *)reg;
atomic_fetch_or(atomic_reg, (1UL << bit));
```

### M7 的 DSB 要求

```c
// Cortex-M7 中 bit-band 写入不会自动保证对外设的可见性顺序
// 如果 bit-band 后需要立即观察到效果，必须插入 DSB

// ❌ 错误用法：
BITBAND_PERIPH(GPIOA_ODR_ADDR, 5, 1);
// 上一条 bit-band 写入还未到达外设总线！

// ✅ 正确用法：
BITBAND_PERIPH(GPIOA_ODR_ADDR, 5, 1);
__DSB();  // 确保 bit-band 写完成
```

### bit-band 的性能代价

虽然 bit-band 的 *写入* 是单个 STR 指令，但**别名地址的计算需要在编译时或运行时完成**。如果使用变量索引，编译器会生成额外的乘法、加法和偏移指令：

```c
// 运行时计算的 bit-band 地址（无优化）
uint32_t addr = BITBAND_PERIPH_ADDR(GPIOA_ODR_ADDR, pin_num);
*(volatile uint32_t *)addr = 1;

// 反汇编会看到：
// LSL  R1, R0, #5        // * 32
// ADD  R1, R1, #0x4200...
// ...
// 比编译时常量多 3~5 条指令
```

因此，**固定引脚的 bit-band 操作比变量引脚高效得多**。

## 八、裸机实战：用 bit-band 实现简易信号量

```c
// 用 bit-band 实现一个简单的二进制信号量
#define SEMAPHORE_ADDR      ((uint32_t)&app_semaphore)
#define SEMAPHORE_BIT       0

volatile uint32_t app_semaphore;

// 信号量获取（非阻塞）
int sem_take(void)
{
    // 原子读取并清零
    uint32_t val = BITBAND_SRAM_READ(SEMAPHORE_ADDR, SEMAPHORE_BIT);
    if (val) {
        BITBAND_SRAM(SEMAPHORE_ADDR, SEMAPHORE_BIT, 0);
        return 1;  // 成功获取
    }
    return 0;  // 不可用
}

// 信号量释放（原子）
void sem_give(void)
{
    BITBAND_SRAM(SEMAPHORE_ADDR, SEMAPHORE_BIT, 1);
}

// 中断和主循环之间安全共享
void UART_RX_IRQHandler(void)
{
    save_data();
    sem_give();          // 通知主循环 — 不关中断！
}

void main(void)
{
    while (1) {
        if (sem_take()) {
            process_data();
        }
        do_other_stuff();
    }
}
```

## 总结

bit-band 是 Cortex-M 家族中一个优雅的硬件特性：用**空间换原子性**，将 1MB 的位带区膨胀为 32MB 的别名区，换来的是对单个比特的原子操作能力。在中断频繁的裸机系统中，bit-band 能消除大量的关中断操作，降低中断延迟抖动。不过它并非万能——M33/M55 已不再支持，M7 下需要 DSB 配合。如果你的芯片支持 bit-band，**在 GPIO 操作、标志位管理、简单信号量中善用它**，能让你的代码更简洁、更可靠。

> 🏷️ bit-band 位带操作 Cortex-M 原子操作 中断安全 嵌入式优化
