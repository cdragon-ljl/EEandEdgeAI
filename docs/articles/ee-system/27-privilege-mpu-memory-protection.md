---
title: "嵌入式知识体系 · #27 · 特权级与 MPU：给你的嵌入式系统加一道防火墙"
description: "嵌入式系统从裸机走向 RTOS 后，所有代码都运行在同一个地址空间中——一个任务中的野指针可能毁掉另一个任务的关键数据。如何在一个没有 MMU 的 MCU 上实现任务间的隔离？答案就是 Cortex-M 的双特权级模型加上 MPU（Memory Protection Unit）。这套机制虽不如 Linux 的 MMU 强大，但在资源受限的 MCU 上，足以构筑一道实用的安全防火墙。"
pubDate: "2026-08-23"
series: "ee-system"
order: 27
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
嵌入式系统从裸机走向 RTOS 后，所有代码都运行在同一个地址空间中——一个任务中的野指针可能毁掉另一个任务的关键数据。如何在一个没有 MMU 的 MCU 上实现任务间的隔离？答案就是 Cortex-M 的**双特权级模型**加上 **MPU（Memory Protection Unit）**。这套机制虽不如 Linux 的 MMU 强大，但在资源受限的 MCU 上，足以构筑一道实用的安全防火墙。

## 一、Cortex-M 的双特权级模型

Cortex-M3/M4/M7（ARMv7-M）以及 M23/M33（ARMv8-M）都支持两种处理器模式：

| 模式 | 说明 | 触发方式 |
|------|------|---------|
| **Handler Mode** | 异常/中断处理，始终特权级 | 任何异常或中断 |
| **Thread Mode** | 普通代码执行，可配置特权/非特权 | 复位后默认进入 |

两种模式通过 **CONTROL 寄存器** 控制：

```
CONTROL 寄存器（0xE000ED14）
位段：
[2]     FPCA — 浮点上下文活跃标志（M4F/M7）
[1]     SPSEL — 堆栈指针选择：0=MSP 1=PSP
[0]     nPRIV — 0=特权级 Thread 1=非特权 Thread
```

```c
// 切换为非特权级 Thread 模式
void switch_to_unprivileged(void)
{
    uint32_t control = __get_CONTROL();
    control |= 0x01;         // 设置 nPRIV = 1
    __set_CONTROL(control);
    __ISB();                 // 刷新流水线
    
    // 从此之后，当前代码运行在非特权级下
}

// 查询当前特权级
bool is_privileged(void)
{
    return (__get_CONTROL() & 0x01) == 0;
}
```

**一旦进入非特权级，无法通过写 CONTROL 回到特权级。** 这是硬件强制约束。非特权代码想要执行特权操作，只能通过 **SVC（Supervisor Call）** 异常请求，由 SVC_Handler（在特权级运行）代理执行。

```c
// 非特权代码：请求系统服务
void system_call(uint32_t service_id, void *args)
{
    // SVC #n 指令触发 SVC 异常
    // 参数通过寄存器传递
    __ASM volatile (
        "MOV R0, %0\n"       // R0 = service_id
        "MOV R1, %1\n"       // R1 = args pointer
        "SVC #0\n"           // 触发 SVC
        : : "r"(service_id), "r"(args) : "r0", "r1"
    );
}

// 特权级代码：处理系统服务请求
__attribute__((naked))
void SVC_Handler(void)
{
    __ASM volatile (
        "TST LR, #4\n"       // 检查使用的是 MSP 还是 PSP
        "ITE EQ\n"
        "MRSEQ R0, MSP\n"    // Handler 模式：入栈在 MSP
        "MRSNE R0, PSP\n"    // Thread 模式：入栈在 PSP
        "LDR R1, [R0, #0]\n" // 取 PC（入栈帧中的 PC）
        "LDRB R0, [R1, #-2]\n" // SVC 指令的立即数（SVC #n 的 n）
        // R0 = SVC number
        "BL svc_dispatcher\n"
        "BX LR\n"
    );
}

void svc_dispatcher(uint32_t svc_number)
{
    switch (svc_number) {
        case 0:  do_privileged_operation(); break;
        case 1:  write_protected_register(); break;
        default: break;
    }
}
```

## 二、MPU 基础架构

MPU 将物理内存划分为若干 **Region**，每个 Region 可以独立配置访问权限和执行属性。

### ARMv7-M MPU（Cortex-M3/M4/M7）

最多支持 **8 个 Region**（标准实现），每个 Region 通过三个寄存器描述：

```c
// MPU 寄存器组
MPU->RNR   // Region Number Register — 选择当前配置的 Region (0~7)
MPU->RBAR  // Region Base Address Register — 基地址 + 有效性
MPU->RASR  // Region Attribute and Size Register — 大小 + 属性 + 权限
```

**Region 尺寸和子区域：**

MPU Region 的大小必须是 2 的幂次，最小 32 字节，最大 4GB。每个 Region 可划分为 **8 个等分的子区域（Subregion）**，每个子区域可以独立使能或禁用——这意味着一个 Region 覆盖的区域中可以有"空洞"。

```c
// MPU Region 配置函数
void mpu_configure_region(uint8_t region_num,
                          uint32_t base_addr,
                          uint32_t size,
                          uint8_t access_perms,
                          uint8_t executable)
{
    // 检查对齐要求：基地址必须是 size 的整数倍
    // 例如 64KB Region 要求基地址 64KB 对齐
    uint32_t align_mask = size - 1;
    if (base_addr & align_mask) {
        return;  // 非法配置
    }
    
    MPU->RNR = region_num;
    MPU->RBAR = (base_addr & 0xFFFFFFE0) | 0x10;  // VALID=1, REGION=region_num
    
    // RASR 计算
    uint32_t rasr = 0;
    
    // 编码 size 值（2^(SIZE+1) 字节）
    // size = 0x1F 表示 4GB，需要查 ARM 手册的编码表
    uint32_t size_code = 0;
    uint32_t sz = size;
    while (sz >>= 1) size_code++;
    size_code = (size_code - 1) << 1;  // 实际计算复杂，需参考手册
    
    rasr |= (0x01 << 0);         // ENABLE
    rasr |= (access_perms << 16);// AP 位
    rasr |= (executable ? 0 : (0x01 << 28)); // XN (Execute Never)
    rasr |= (size_code << 1);    // SIZE
    
    MPU->RASR = rasr;
    
    __DSB();
    __ISB();
}
```

**访问权限编码：**

| AP 编码 | 特权级 | 非特权级 |
|---------|--------|---------|
| 000 | 不可访问 | 不可访问 |
| 001 | 可读写 | 不可访问 |
| 010 | 可读写 | 只读 |
| 011 | 可读写 | 可读写 |
| 100 | 只读 | 不可访问 |
| 101 | 只读 | 只读 |
| 110 | 只读 | 不可访问 |
| 111 | 只读 | 只读 |

### ARMv8-M MPU（Cortex-M23/M33）

ARMv8-M 引入了 TrustZone 安全扩展，MPU 也相应地分为 **安全 MPU（SMPU）** 和 **非安全 MPU（NSMPU）**。此外，M33 支持最多 **16 个 Region**，使用更灵活的 Region 属性编码。

```c
// ARMv8-M 的 MPU 寄存器访问（非安全侧）
MPU_NS->RNR  = region;
MPU_NS->RBAR = (base & 0xFFFFFFE0) | valid;
MPU_NS->RLAR = (limit & 0xFFFFFFE0) | (attrs << 1) | enable;
// RLAR 包含区域上限地址和属性，与 ARMv7-M 的 RASR 不同
```

## 三、实战：FreeRTOS 非特权任务隔离

FreeRTOS 从 V9 开始支持 MPU 版本（FreeRTOS-MPU），核心思想：**内核和所有特权代码运行在特权级，每个用户任务运行在非特权级，且每个任务有自己独立的 MPU region 配置。**

```c
// 简化的 FreeRTOS-MPU 任务创建
// FreeRTOSConfig.h 中需定义
#define configUSE_MPU                 1
#define configENABLE_MPU              1
#define configNUM_USER_THREAD_REGIONS 3  // 每个任务最多 3 个数据 region

// 每个任务除了代码 region 外，还有栈 region 和用户数据 region
void vTask1(void *pvParameters)
{
    // 此任务运行在非特权级！
    // 无法直接访问内核数据结构
    // 无法执行 WFI/WFE 等特权指令
    
    // 访问外设需要显式声明
    taskENTER_CRITICAL();  // ❌ 编译错误！非特权级不能操作 BASEPRI
    
    // 正确做法：通过 SVC 请求系统服务
    xMPU_SendMessage(...);
}
```

### 手动实现 MPU 隔离

```c
#define FLASH_BASE     0x08000000
#define SRAM_BASE      0x20000000
#define PERIPH_BASE    0x40000000

void mpu_init_for_rtos(void)
{
    // 先禁用 MPU 进行配置
    MPU->CTRL = 0;
    
    // Region 0: 整个 Flash（可执行，特权+非特权只读）
    mpu_configure_region(0,
        FLASH_BASE,
        0x100000,          // 1MB Flash
        0x06,              // AP: 特权读写+非特权只读
        1);                // XN=0: 可执行
    
    // Region 1: 整个 SRAM（可读写，不可执行）
    mpu_configure_region(1,
        SRAM_BASE,
        0x40000,           // 256KB SRAM
        0x03,              // AP: 特权+非特权均可读写
        0);                // XN=1: 不可执行
    
    // Region 2: 外设空间（仅特权可读写，不可执行）
    mpu_configure_region(2,
        PERIPH_BASE,
        0x200000,          // 2MB 外设空间
        0x01,              // AP: 仅特权可读写
        0);                // XN=1: 不可执行
    
    // 使能 MPU
    // PRIVDEFENA: 使能后任何未匹配 Region 的地址空间，特权级可以访问
    //             （否则未匹配区域任何模式都不可访问）
    MPU->CTRL = MPU_CTRL_ENABLE_Msk | MPU_CTRL_PRIVDEFENA_Msk;
    
    __DSB();
    __ISB();
}
```

## 四、非特权模式下的陷阱

非特权代码试图访问系统控制寄存器（SCB、NVIC 等），会立即触发 **HardFault** 或 **MemManage Fault**。

```c
// 非特权任务中的非法操作
void task_unprivileged(void *pv)
{
    // ❌ 1: 试图直接操作 NVIC
    NVIC_EnableIRQ(TIM2_IRQn);      // → MemManage Fault!
    
    // ❌ 2: 试图切换特权级
    __set_CONTROL(0x00);            // → 硬件忽略 nPRIV 写入
    
    // ❌ 3: 试图修改 SysTick
    SysTick->LOAD = 1000;           // → MemManage Fault!
    
    // ✅ 正确做法：通过 SVC 调用
    __ASM("SVC #1");                // 请求系统服务
}
```

**调试技巧：** 在 HardFault_Handler 中检查 LR 中的 EXC_RETURN 值，判断异常来自特权还是非特权代码。

```c
void HardFault_Handler(void)
{
    uint32_t lr_value = __get_LR();
    
    if (lr_value == 0xFFFFFFFD) {
        debug_puts("异常发生在 Thread Mode + PSP（非特权任务栈）");
    } else if (lr_value == 0xFFFFFFF9) {
        debug_puts("异常发生在 Thread Mode + MSP（特权任务栈）");
    }
    
    while(1);
}
```

## 五、MPU 使用中的边界问题

### Region 重叠优先级

当多个 Region 覆盖同一地址时，**编号越大的 Region 优先级越高**（Region 7 优先级最高）。这一点在配置时需要特别注意。

```c
// Region 0: 禁止访问 0x20000000（防止空指针解引用）
mpu_configure_region(0, 0x20000000, 32, 0x00, 0);  // AP=0: 不可访问

// Region 1: 允许访问 0x20000000~0x2000FFFF
mpu_configure_region(1, 0x20000000, 0x10000, 0x03, 0);

// 结果：0x20000000~0x2000001F 被 Region 1 覆盖（优先级高），可以访问！
// 这跟直觉相反，因为 Region 1 编号更大，优先级更高
```

### 任务上下文切换中的 MPU 保存恢复

FreeRTOS-MPU 在每次上下文切换时需要保存和恢复当前任务的 MPU 配置：

```c
// PendSV_Handler 中的 MPU 切换（简化）
void PendSV_Handler(void)
{
    // 保存当前任务的 MPU 配置...
    
    // 加载新任务的 MPU 配置
    MPU->RNR = 0;
    MPU->RBAR = new_task->region0_base;
    MPU->RASR = new_task->region0_attr;
    
    MPU->RNR = 1;
    MPU->RBAR = new_task->region1_base;
    MPU->RASR = new_task->region1_attr;
    
    // 全部更新后一次性使能
    MPU->CTRL |= MPU_CTRL_ENABLE_Msk;
    __DSB();
    __ISB();
}
```

## 总结

特权级 + MPU 的组合，为 MCU 上的关键系统提供了最基本的**故障隔离**能力。虽然不如 MMU 强大（没有虚拟地址映射、没有页式管理），但在工业控制、汽车电子、医疗设备等对可靠性要求高的场景中，MPU 是性价比极高的安全防线。核心要点：**非特权代码通过 SVC 请求服务、MPU Region 注意重叠优先级、FreeRTOS-MPU 自动管理任务隔离。**

> 🏷️ Cortex-M MPU 特权级 FreeRTOS 内存保护 安全隔离 嵌入式系统
