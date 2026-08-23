---
title: "嵌入式知识体系 · #31 · Cortex-M 异常入栈/出栈完整流程"
description: "Cortex-M 系列的一个核心设计理念是中断响应由硬件全自动完成——这意味着程序员不需要在中断入口写 PUSH {LR} 再 BL 跳转，处理器自己就把现场保护好了。"
pubDate: "2026-08-23"
series: "ee-system"
order: 31
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
Cortex-M 系列的一个核心设计理念是**中断响应由硬件全自动完成**——这意味着程序员不需要在中断入口写 `PUSH {LR}` 再 `BL` 跳转，处理器自己就把现场保护好了。

但这种"自动化"也让很多人产生了错觉：反正硬件会处理，我不用管。直到遇到中断嵌套死机、栈溢出 HardFault、RTOS 切换时 PSP 混乱——才意识到，不理解入栈/出栈的细节，早晚要掉坑。

这一篇把异常入栈到出栈的全路径拆开揉碎。

---

## 一、硬件自动入栈的 8 个寄存器

当 Cortex-M 检测到异常（中断或故障）并决定响应时，CPU 会自动将以下 8 个寄存器压入当前使用的栈（MSP 或 PSP）：

| 顺序 | 寄存器 | 说明 |
|:---:|:------:|:----|
| 1 | xPSR | 程序状态寄存器（标志位 + 异常号 + IPSR） |
| 2 | PC | 断点地址（异常发生时正在执行的指令地址） |
| 3 | LR | 返回地址（`EXC_RETURN` 特殊值，而非普通 LR） |
| 4 | R12 | 临时寄存器（intra-procedure-call scratch） |
| 5 | R3 | 参数/临时寄存器 |
| 6 | R2 | 参数/临时寄存器 |
| 7 | R1 | 参数/临时寄存器 |
| 8 | R0 | 参数/临时寄存器 |

入栈顺序是**从高地址向低地址**压入：先压 xPSR，再压 PC、LR……最后压 R0。栈指针 SP 最终指向 R0 的存放地址。

### 为什么只保存 R0-R3 和 R12？

AAPCS 调用约定中，R0-R3 和 R12 是**调用者保存**的寄存器。也就是说，普通函数调用前，如果调用者需要这些寄存器里的值，它会自己保存。

异常和函数调用类似——异常被打断时，被打断代码中的 R0-R3 和 R12 可能存着有用数据，所以硬件自动保存。而 **R4-R11 是被调用者保存的寄存器**，异常服务函数（ISR）如果用到它们，必须自己在入口处压栈保存——这和普通函数一致。

### 入栈后的栈布局

```
入栈前 (SP_old)   →   [其他数据]
                      [其他数据]
入栈后 (SP_new)   →   R0 (最低地址)
                      R1
                      R2
                      R3
                      R12
                      LR (EXC_RETURN)
                      PC (断点地址)
                      xPSR (最高地址)
```

注意：这是**向下生长的栈**（地址递减），所以 R0 在最低地址，xPSR 在最高地址。8 个寄存器共 32 字节。

### 确认栈帧的代码

在 ISR 中主动读取栈帧：

```c
void HardFault_Handler(void) {
    /* 从当前 SP (MSP) 获取栈帧基址 */
    uint32_t *stack_frame = (uint32_t *)__get_MSP();

    uint32_t r0  = stack_frame[0];
    uint32_t r1  = stack_frame[1];
    uint32_t r2  = stack_frame[2];
    uint32_t r3  = stack_frame[3];
    uint32_t r12 = stack_frame[4];
    uint32_t lr  = stack_frame[5];  /* 注意：这是 EXC_RETURN */
    uint32_t pc  = stack_frame[6];  /* 触发异常的指令地址 */
    uint32_t xpsr= stack_frame[7];

    printf("Fault at PC=0x%08X, LR(EXC_RETURN)=0x%08X\n", pc, lr);
}
```

这是 HardFault 定位的核心手段：**沿着 SP 向上找第 6 个 32 位字，就是导致异常的 PC**。

---

## 二、EXC_RETURN 与返回模式

异常入栈时硬件压入 LR 的不是实际函数返回地址，而是一个特殊的 **EXC_RETURN** 值。这个值的[31:4]位固定为 `0xFFFFFFF`，[3:0]位编码了返回模式：

| EXC_RETURN 值 | 含义 |
|:-------------:|:-----|
| `0xFFFFFFF1` | 返回 Handler 模式（使用 MSP） |
| `0xFFFFFFF9` | 返回 Thread 模式（使用 MSP） |
| `0xFFFFFFFD` | 返回 Thread 模式（使用 PSP） |

### 中断返回的判断机制

当 ISR 执行到最后，执行 `BX LR` 指令时，CPU 检测到 LR 中的值符合 `0xFFFFFFFx` 模式，就知道这是一次**异常返回**——而不是普通函数返回。

异常返回的完整动作：

1. **从栈上弹出** 8 个寄存器（xPSR, PC, LR, R12, R3-R0）
2. **根据 EXC_RETURN 恢复**对应栈指针（MSP 或 PSP）
3. **恢复中断状态**（如果之前被屏蔽）

```assembly
@ RTOS PendSV 处理的典型返回
PendSV_Handler:
    CPSID   I               @ 关中断
    MRS     R0, PSP
    STMDB   R0!, {R4-R11}   @ 保存 R4-R11 到任务栈
    LDR     R1, =current_tcb
    STR     R0, [R1]        @ TCB->sp = R0

    @ ... 任务切换逻辑 ...

    LDR     R1, =next_tcb
    LDR     R0, [R1]
    LDMIA   R0!, {R4-R11}   @ 恢复新任务的 R4-R11
    MSR     PSP, R0

    CPSIE   I               @ 开中断
    BX      LR              @ EXC_RETURN → 硬件出栈
```

最后一条 `BX LR` 触发硬件自动出栈，恢复新任务的 R0-R3、R12、PC、xPSR，然后跳转到新任务的断点处继续执行——这就是 RTOS 上下文切换的完整机制。

### 一个关键陷阱

ISR 内如果调用了其他函数，编译器可能会在 ISR 入口做 `PUSH {LR}`，导致 LR 被覆盖：

```c
void UART_IRQHandler(void) {
    /* 编译器可能在入口处 PUSH {LR} */
    /* 然后 LR 被赋值为 EXC_RETURN */
    helper_func();   /* 调用 BL helper_func 会覆盖 LR！ */
    /* 返回前 POP {PC} 才正确 */
}
```

所以 RTOS 的 PendSV_Handler 必须写成纯汇编或用 `__attribute__((naked))` 修饰——不能依赖编译器生成标准序言/尾声，否则 `BX LR` 的行为会被改变。

---

## 三、异常嵌套时的栈帧链

Cortex-M 支持中断嵌套：高优先级中断可以打断低优先级中断的处理。

### 嵌套场景的栈布局

```
优先级 5 的中断正在执行，优先级 3 的中断到达：

初始栈:
  [主程序数据]

IRQ5 入栈后:
  [主程序数据]
  [IRQ5 的栈帧 #1]    ← MSP 指向这里

IRQ3 打断 IRQ5，入栈后:
  [主程序数据]
  [IRQ5 的栈帧 #1]
  [IRQ3 的栈帧 #2]    ← MSP 指向这里
```

两个栈帧在栈上连续排列。**每个栈帧包含被该异常打断的代码的现场**。IRQ3 退出时弹出栈帧 #2，恢复 IRQ5 的执行；IRQ5 退出时弹出栈帧 #1，恢复主程序。

### Tail-chaining（尾链优化）

如果高优先级 ISR 退出时，另一个低优先级中断正在 pending，Cortex-M 不会做两次完整入栈/出栈，而是直接**跳过中间出栈再入栈的开销**：

```
IRQ5 ISR → 退出时发现 IRQ7 pending
         → 不弹出栈帧 #1
         → 直接跳转到 IRQ7 的入口
         → IRQ7 ISR 使用相同的栈帧上下文
```

Tail-chaining 可以节省 12 个时钟周期（省去出栈再入栈的 8 次内存访问）。这是 Cortex-M 实时性优于传统 ARM7 的关键设计之一。

### Late-arriving（迟到中断）

如果在 IRQ5 入栈过程中（8 个寄存器还没压完），一个优先级更高的 IRQ3 到达——Cortex-M 会将 IRQ3 的异常号写入 xPSR 的 ISR_NUMBER 字段，**复用同一个栈帧**，等入栈完成后直接跳到 IRQ3 的入口。这就叫 Late-arriving，进一步缩短了高优先级中断的延迟。

---

## 四、双堆栈指针 MSP 与 PSP

Cortex-M 有两个独立的栈指针：

- **MSP（Main Stack Pointer）**：复位后默认使用。Handler 模式（异常服务）始终使用 MSP。
- **PSP（Process Stack Pointer）**：Thread 模式可选的栈指针，RTOS 中的任务栈。

### 什么时候用哪个？

```
Handler 模式 (异常)：始终使用 MSP
Thread 模式 (普通代码)：
  - CONTROLPROTECT == 0：使用 MSP（裸机默认）
  - CONTROLPROTECT == 1：使用 PSP（RTOS 启用）
```

### RTOS 中的双栈切换

FreeRTOS 启动调度器后，内核代码（SVC、PendSV、SysTick 等异常处理）使用 MSP，各个任务使用各自的 PSP：

```
MSP → [内核栈]           ← 所有异常共用内核的 MSP 栈
PSP(任务A) → [任务A栈]   ← 任务A的私有栈
PSP(任务B) → [任务B栈]   ← 任务B的私有栈
```

任务切换时，PendSV_Handler 在 MSP 上执行，保存/恢复的是任务的 PSP。这意味着**任务的栈空间（PSP 指向的区域）只需要存任务本身的局部变量和现场**，不包含内核异常处理的栈——可以有效减少每个任务的栈需求。

### 确定当前使用哪个栈

```c
uint32_t lr_value;

__ASM volatile("MOV %0, LR" : "=r"(lr_value));

if ((lr_value & 0x4) == 0) {
    /* LR bit[2]=0 → 之前使用 MSP */
    sp = __get_MSP();
} else {
    /* LR bit[2]=1 → 之前使用 PSP */
    sp = __get_PSP();
}
```

这是 HardFault 定位时最先要做的判断——搞错栈指针就去不到正确的栈帧位置。

---

## 五、实战：手动模拟异常入栈/出栈

理解硬件自动行为的最好方法是**手动模拟一遍**。假设一个场景：主程序中执行 `*(int *)0 = 0;` 触发了 MemManage Fault。

### 步骤 1：异常识别

CPU 检测到对地址 0x00000000 的写入权限异常，读取向量表中 MemManage_Handler 的地址（偏移 28，即 `*(uint32_t*)(0x0000001C)`）。

### 步骤 2：入栈（硬件完成）

```
当前 MSP = 0x20001FC0

入栈后 MSP = 0x20001FA0 （向下增长 32 字节）

0x20001FA0: R0  = 0          @ 写入的值
0x20001FA4: R1  = 0x00000000 @ 目标地址
0x20001FA8: R2  = ???        @ 其他临时数据
0x20001FAC: R3  = ???
0x20001FB0: R12 = ???
0x20001FB4: LR  = 0xFFFFFFF9 @ EXC_RETURN（Thread + MSP）
0x20001FB8: PC  = 0x08001234 @ 触发错误的指令
0x20001FBC: xPSR = 0x21000000 @ 含异常号 0（随后更新为 14=MemeManage）
```

### 步骤 3：取向量

`PC = *(uint32_t*)(VTOR_BASE + 14 * 4)`，即跳转到 MemManage_Handler。

### 步骤 4：出栈（硬件完成，`BX LR` 时）

恢复 PC 到 0x08001234，恢复 xPSR、LR 等——**但如果 MemManage 错误的原因没有修复，再次执行该指令又会触发 MemManage，导致 HardFault**（表现为死循环在 HardFault_Handler）。这就是为什么 HardFault 分析要读 saved_pc。

---

## 小结

Cortex-M 的异常处理机制是嵌入式内核开发的必修课。硬件自动入栈 8 个寄存器看似省事，但理解每个细节——EXC_RETURN 编码、双栈指针切换、Tail-chaining 优化——才能在 RTOS 移植、HardFault 调试、中断嵌套分析时游刃有余。

**记住三件事：**
1. SP 指向 R0 → 偏移 6 个 32 位字 = saved_pc
2. EXC_RETURN = 0xFFFFFFF9/0xFFFFFFFD 决定返回哪根栈
3. R4-R11 不在硬件入栈范围内，ISR 用到时必须自行保存

> 🏷️ Cortex-M 异常入栈 出栈 EXC_RETURN MSP PSP RTOS 栈帧 HardFault
