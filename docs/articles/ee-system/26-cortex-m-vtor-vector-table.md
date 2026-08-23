---
title: "嵌入式知识体系 · #26 · Cortex-M 中断向量表与 VTOR：灵活的中断管理"
description: "中断是嵌入式系统的灵魂，而中断向量表则是灵魂的索引目录。Cortex-M 系列处理器通过向量表机制，将异常和中断的入口地址集中管理，而 VTOR（Vector Table Offset Register） 则赋予了我们在运行时灵活重定位这张表的能力。理解向量表结构和 VTOR 的用法，是深入 Cortex-M 底层、编写可靠 bootloader 和 RTOS 的基础。"
pubDate: "2026-08-23"
series: "ee-system"
order: 26
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
中断是嵌入式系统的灵魂，而中断向量表则是灵魂的索引目录。Cortex-M 系列处理器通过向量表机制，将异常和中断的入口地址集中管理，而 **VTOR（Vector Table Offset Register）** 则赋予了我们在运行时灵活重定位这张表的能力。理解向量表结构和 VTOR 的用法，是深入 Cortex-M 底层、编写可靠 bootloader 和 RTOS 的基础。

## 一、中断向量表的结构

Cortex-M 的向量表固定在地址空间的起始位置（默认 0x00000000），每个表项占 4 字节，存储对应异常/中断的服务函数地址。表的前 16 项为系统异常，从第 16 项（偏移 0x40）开始为外设中断。

```c
// 向量表定义（典型 startup_stm32f407xx.s 中的结构）
__attribute__((section(".isr_vector")))
void (* const g_pfnVectors[])(void) = {
    // 系统异常（前 16 项）
    (void*)&_estack,            // 0x0000: 主堆栈指针（MSP）初始值
    Reset_Handler,              // 0x0004: 复位入口
    NMI_Handler,                // 0x0008: NMI 中断
    HardFault_Handler,          // 0x000C: HardFault
    MemManage_Handler,          // 0x0010: MemManage Fault (M3/M4/M7)
    BusFault_Handler,           // 0x0014: Bus Fault
    UsageFault_Handler,         // 0x0018: Usage Fault
    // ... 省略第7~15项（SVCall、DebugMon、PendSV、SysTick等）
    
    // 外设中断（从第16项开始）
    WWDG_IRQHandler,            // 0x0040: 窗口看门狗
    PVD_IRQHandler,             // 0x0044: 电源电压检测
    TAMP_STAMP_IRQHandler,      // 0x0048: 入侵/时间戳
    // ... 后续按芯片外设排列
};
```

**关键点：** 向量表的第 0 项不是函数指针，而是**初始堆栈指针（MSP）**。复位后 CPU 直接从 0x0000 加载 MSP，从 0x0004 加载 PC。这个设计使得 Cortex-M 无需额外的汇编代码就能建立 C 运行环境。

## 二、VTOR 寄存器：让向量表动起来

VTOR 位于系统控制块（SCB）中，地址 **0xE000ED08**，宽度 32 位。

```
VTOR (0xE000ED08)
位段：
[31:7]   TBLOFF — 向量表基地址（对齐到 128 字节，M0/M0+ 特殊）
[6:0]    保留
```

```c
// 标准 CMSIS 定义
#define SCB_VTOR_ADDR        0xE000ED08UL
#define SCB_VTOR             ((volatile uint32_t *)SCB_VTOR_ADDR)

// 读取当前向量表地址
uint32_t vtor_value = SCB->VTOR;
printf("当前向量表地址: 0x%08X\n", vtor_value);
```

### 对齐要求（⚠️ 最容易踩的坑）

不同 Cortex-M 系列的对齐要求不同：

| 架构 | 最小对齐 | 说明 |
|------|---------|------|
| Cortex-M3/M4/M7 | **512 字节**（0x200 对齐） | 表项数 ≤ 128，每项 4 字节 |
| Cortex-M0/M0+ | **256 字节**（0x100 对齐），但必须位于 ROM | 不支持运行时 VTOR 写入 |
| Cortex-M23/M33 | **128 字节**（0x80 对齐） | ARMv8-M 架构更灵活 |

M3/M4 的向量表最多 128 项 × 4 字节 = 512 字节，所以要求 512 对齐。如果你把 APP 的向量表放在 0x08040000，这个地址必须能被 512 整除。

```c
// 检查地址是否对齐
#define IS_VTOR_ALIGNED(addr)  (((uint32_t)(addr) & 0x1FF) == 0)  // M3/M4/M7

uint32_t app_vector_table = 0x08010000;
if (!IS_VTOR_ALIGNED(app_vector_table)) {
    // 触发 HardFault！
    while(1);
}
```

## 三、Bootloader + APP 双区实战

标准量产场景：芯片上电先执行 bootloader（0x08000000），验证固件后跳转到 APP（0x08010000）。

```c
// bootloader 跳转到 APP 的核心代码
#define APP_BASE_ADDRESS     0x08010000UL
#define APP_VTOR_OFFSET      ((uint32_t)APP_BASE_ADDRESS)

typedef void (*app_entry_t)(void);

void jump_to_app(void)
{
    uint32_t msp_value;
    app_entry_t reset_handler;
    
    // 步骤 1：验证 APP 固件完整性（CRC/SHA 校验）
    if (!verify_app_firmware(APP_BASE_ADDRESS)) {
        return;  // 校验失败，留在 bootloader
    }
    
    // 步骤 2：设置 VTOR 指向 APP 的向量表
    // ⚠️ 必须在使能任何中断之前设置！
    SCB->VTOR = APP_VTOR_OFFSET;
    __DSB();  // 确保写入完成
    __ISB();  // 刷新指令流水线
    
    // 步骤 3：从 APP 向量表加载 MSP 和 PC
    msp_value = *(volatile uint32_t*)APP_BASE_ADDRESS;
    reset_handler = (app_entry_t)(*(volatile uint32_t*)(APP_BASE_ADDRESS + 4));
    
    // 步骤 4：切换到 APP 的堆栈并跳转
    __set_MSP(msp_value);
    reset_handler();
    
    // 不会返回
}
```

**关键注意事项：**

1. **必须先设 VTOR，再加载 MSP 和跳转**。如果跳转后才设 VTOR，跳转过程中发生的中断仍然使用 bootloader 的向量表。
2. **跳转前关闭所有 bootloader 中使能的中断**。否则 APP 未初始化外设时触发中断 → 找不到 ISR → HardFault。
3. **APP 的链接脚本必须指定正确的 VECT_TAB_OFFSET**。

```c
// 跳转前关闭中断的标准操作
void deinit_bootloader_peripherals(void)
{
    // 关闭全局中断
    __disable_irq();
    
    // 关闭 SysTick（bootloader 可能用了它延时）
    SysTick->CTRL = 0;
    
    // 复位所有外设时钟（可选）
    RCC->AHB1RSTR = 0xFFFFFFFF;
    RCC->AHB1RSTR = 0x00000000;
    
    // 清理所有待处理的中断
    NVIC->ICPR[0] = 0xFFFFFFFF;
    NVIC->ICPR[1] = 0xFFFFFFFF;
    // ... 按芯片 NVIC 行数扩展
    
    __DSB();
    __ISB();
}
```

## 四、中断使能前必须设 VTOR：血的教训

这是一个极其常见的 Bug：用户在 bootloader 中开启了某个外设中断（比如定时器、UART），然后跳转到 APP。APP 的 VTOR 写晚了，结果中断一来，CPU 直接从 bootloader 的向量表里找 ISR——但 bootloader 的 ISR 已经不复用了，实际执行的是个空循环或者异常行为。

```c
// ❌ 错误做法：中断使能后才设 VTOR
void jump_to_app_bad(void)
{
    // ... UART 中断已经在 bootloader 中使能了
    
    uint32_t msp = *(volatile uint32_t*)APP_BASE_ADDRESS;
    app_entry_t entry = (app_entry_t)(*(volatile uint32_t*)(APP_BASE_ADDRESS + 4));
    
    // UART 中断触发 → 走的还是 bootloader 向量表！
    __set_MSP(msp);
    entry();
    
    // ❌ VTOR 在跳转之后才设置——永远走不到这行
    SCB->VTOR = APP_VTOR_OFFSET;  
}
```

**正确顺序：** 禁止全局中断 → 关闭所有外设中断 → 设置 VTOR → 设置 MSP → 跳转 → APP 的入口代码自行重新使能需要的中断。

## 五、异常向量表搬移：RamFunc 模式

某些场景下，我们需要在运行时修改中断处理函数，比如动态注册 ISR。但向量表通常放在 Flash 中（只读），这时需要将向量表**搬移到 RAM**，然后让 VTOR 指向 RAM 地址。

```c
// 在 RAM 中建立可写的向量表
#define VECTOR_TABLE_COUNT   128  // 具体数目由芯片决定
__attribute__((section(".ram_vector")))
uint32_t ram_vector_table[VECTOR_TABLE_COUNT];

void vtor_init_with_ram(void)
{
    // 步骤 1：复制 Flash 中的向量表到 RAM
    uint32_t flash_vtor = SCB->VTOR;
    uint32_t *src = (uint32_t *)flash_vtor;
    
    for (int i = 0; i < VECTOR_TABLE_COUNT; i++) {
        ram_vector_table[i] = src[i];
    }
    
    __DMB();  // 确保 RAM 写完成
    
    // 步骤 2：VTOR 指向 RAM 区域
    // ⚠️ RAM 地址也需满足对齐要求
    SCB->VTOR = (uint32_t)ram_vector_table;
    __DSB();
    __ISB();
}

// 运行时注册 ISR（仅对 RAM 向量表生效）
void vector_table_set_isr(int irqn, void (*handler)(void))
{
    int index = irqn + 16;  // IRQn 转向量表偏移
    ram_vector_table[index] = (uint32_t)handler;
    __DMB();  // 确保写完成
}
```

**注意：** 搬移到 RAM 后，芯片从 Flash 执行代码，但中断来时从 RAM 找 ISR 地址。RAM 的访问速度快于 Flash（特别是带缓存的情况），但需考虑 RAM 空间开销（128 × 4 = 512 字节）。

## 六、MPU + VTOR 实现应用隔离

在安全关键系统中，可以结合 MPU 和 VTOR 实现应用间的故障隔离。

```c
void setup_mpu_with_vtor_isolation(void)
{
    // Region 0：APP 代码 + 向量表（可执行）
    MPU->RNR = 0;
    MPU->RBAR = (APP_BASE_ADDRESS & 0xFFFFFFE0) | 0x10;  // valid + region 0
    MPU->RASR = (0xFFFFFFF3) |                     // size: 4KB (APP 区域)
                (0x01 << 24) |                    // enable
                (0x03 << 16) |                    // full access (privileged)
                (0x01 << 28);                     // XN=0 (可执行)
    
    // Region 1：RAM（可读写、不可执行）
    MPU->RNR = 1;
    MPU->RBAR = (SRAM_BASE & 0xFFFFFFE0) | 0x11;  // valid + region 1
    MPU->RASR = (size_bits) |
                (0x03 << 16) |
                (0x01 << 28) | 0x01;               // XN=1 (不可执行)
    
    // Region 2：外设（可读写、不可执行、禁止非特权访问）
    MPU->RNR = 2;
    MPU->RBAR = (PERIPH_BASE & 0xFFFFFFE0) | 0x12;
    MPU->RASR = (periph_size) |
                (0x01 << 16) |                    // 仅特权访问
                (0x01 << 28) | 0x01;               // XN=1
    
    // 使能 MPU
    MPU->CTRL = MPU_CTRL_ENABLE_Msk | MPU_CTRL_PRIVDEFENA_Msk;
    __DSB();
    __ISB();
}
```

这样即使 APP 中发生错误，非特权代码也无法篡改向量表（RAM 中的向量表区域被 MPU 保护起来）。

## 七、QEMU 模拟器上的 VTOR 对齐问题

在 QEMU 上调试时，VTOR 地址不对齐是 HardFault 的常见诱因。

```c
// QEMU 中常见的 HardFault 场景
// 假设 APP 链接地址为 0x08010080（未对齐到 512 字节！）
// ... 跳转前执行这行
SCB->VTOR = 0x08010080;  // ❌ 0x08010080 & 0x1FF != 0

// QEMU 立即触发 HardFault_Handler
// 真芯片上行为取决于具体实现，但标准 M3/M4 会忽略低 9 位
```

**调试方法：** 在 HardFault_Handler 中检查 VTOR 值，确认对齐。

```c
void HardFault_Handler(void)
{
    uint32_t vtor = SCB->VTOR;
    uint32_t align_mask = 0x1FF;
    
    if (vtor & align_mask) {
        // VTOR 未对齐！
        debug_printf("FATAL: VTOR not aligned! VTOR=0x%08X\n", vtor);
    }
    
    while(1);
}
```

## 总结

VTOR 是 Cortex-M 中断管理的核心寄存器，理解其结构、对齐要求和重定位原理，是编写 bootloader、实现固件升级、构建安全隔离系统的必备技能。记住三件事：**对齐要检查、设 VTOR 要趁早、跳转前清中断**，就能绕开绝大多数 VTOR 相关的坑。

> 🏷️ Cortex-M VTOR 中断向量表 bootloader 异常处理 嵌入式底层
