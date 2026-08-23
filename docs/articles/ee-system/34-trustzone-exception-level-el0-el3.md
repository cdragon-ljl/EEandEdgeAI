---
title: "嵌入式知识体系 · #34 · TrustZone 与异常等级 EL0-EL3"
description: "TrustZone 是 ARM 在 Cortex-A 系列中引入的硬件安全扩展——它的核心理念是把一个物理 CPU 虚拟成两个逻辑 CPU：一个运行在\"安全世界\"，另一个运行在\"非安全世界\"（也叫普通世界）。"
pubDate: "2026-08-23"
series: "ee-system"
order: 34
tags: ["嵌入式", "嵌入式知识体系"]
draft: false
---
TrustZone 是 ARM 在 Cortex-A 系列中引入的硬件安全扩展——它的核心理念是**把一个物理 CPU 虚拟成两个逻辑 CPU**：一个运行在"安全世界"，另一个运行在"非安全世界"（也叫普通世界）。

安全世界可以访问非安全世界的内存，但反过来不行。这种单向隔离让安全世界成为系统安全的基石——密钥管理、支付处理、DRM 版权保护都在这里运行。

但要理解 TrustZone，必须先搞懂 **ARMv8-A 的异常等级（Exception Level）体系**。没有 EL 的概念，TrustZone 的"两世界"模型就讲不清楚。

---

## 一、异常等级 EL0-EL3：ARMv8-A 的四级特权

ARMv8-A 引入了 4 个异常等级（Exception Level，简称 **EL**），数字越大特权越高：

| 等级 | 典型角色 | 说明 |
|:---:|:--------|:-----|
| **EL0** | 用户态应用 | 权限最低，无法访问系统寄存器 |
| **EL1** | 操作系统内核 | Linux kernel、RTOS 运行于此 |
| **EL2** | Hypervisor（虚拟机监控器） | 管理多个 OS 的虚拟化层 |
| **EL3** | Secure Monitor（安全监控器） | 最高权限，管理世界切换 |

### 等级间的层次关系

```
EL0  User App    User App          ← 非安全世界    |  安全世界
     ↓ syscall   ↓ syscall                        |
EL1  Linux Kernel                    TEE (OP-TEE)  ← OS 层
     ↓            ↓                               |
EL2  Hypervisor (KVM / Xen)           (不使用)      ← 虚拟化层
     ↓                                               |
EL3  Secure Monitor (ATF / ARM Trusted Firmware)    ← 硬件最高权限
```

### 异常等级如何提升和降低

- **提升**：触发异常（中断、缺页、SMC 等），硬件自动跳到更高的 EL
- **降低**：`ERET`（Exception Return）指令，从高 EL 回到低 EL

```assembly
@ 从 EL1 跳转到 EL3 的 SMC 调用（简化的示例）
@ smc #0 指令会让 CPU 陷入 EL3（如果 SCR.NS==0 表示从安全世界发起）
smc #0
@ CPU 切换到 EL3，跳转到 monitor vector

@ 从 EL3 返回 EL1
eret
@ 恢复 EL1 的上下文，降级到 EL1
```

当 CPU 从非安全世界发起 `smc #0` 时，它陷入 EL3 的安全监控器，进入安全世界——这就是世界切换（World Switch）的入口。

---

## 二、安全世界与非安全世界的隔离

### 两世界的物理分离

TrustZone 在两世界之间通过**硬件总线信号**实现隔离：

```
非安全 CPU 核  →  AXI 总线  →  非安全内存  ← 非安全世界不能访问安全内存
安全 CPU 核    →  AXI 总线  →  安全内存     ← 安全世界可以访问所有内存
                              ↑
                    NS (Non-Secure) 信号位
```

AXI 总线上每个传输都带了一个额外的 **NS 信号位**（AxPROT[1]）：
- NS=1：非安全传输
- NS=0：安全传输

**安全内存控制器**（如 TZC-380）检查每个 AXI 访问的 NS 位——如果非安全传输试图访问安全区域，直接返回错误。

### SCR 寄存器：世界切换的开关

EL3 中的 **SCR（Secure Configuration Register）** 控制着世界切换的行为：

```c
// SCR 寄存器关键位（ARMv8-A）
SCR_NS       = (1 << 0)  // 当前世界：0=安全，1=非安全
SCR_IRQ      = (1 << 1)  // IRQ 路由到 EL3
SCR_FIQ      = (1 << 2)  // FIQ 路由到 EL3（TrustZone 利用 FIQ 做安全中断）
SCR_EA       = (1 << 3)  // 外部中止路由到 EL3
SCR_SMD      = (1 << 7)  // 禁止 SMC 指令（安全防护）
```

### 世界切换的完整流程

```
非安全世界 (Linux)            EL3 (Secure Monitor)          安全世界 (TEE)
      │                              │                          │
      │  1. SMC #0 调用               │                          │
      │ ─────────────────────────→   │                          │
      │                              │  2. 保存非安全上下文      │
      │                              │  3. 切换 SCR.NS=0        │
      │                              │  4. 恢复安全上下文        │
      │                              │ ──────────────────────→  │
      │                              │                          │
      │                              │  5. 安全世界处理请求      │
      │                              │                          │
      │                              │  6. SMC 返回             │
      │                              │ ←──────────────────────  │
      │                              │  7. 保存安全上下文        │
      │                              │  8. 切换 SCR.NS=1        │
      │                              │  9. 恢复非安全上下文      │
      │  ←────────────────────────── │                          │
      │  10. Linux 继续执行          │                          │
```

整个切换过程由 EL3 的 Secure Monitor（通常由 ARM Trusted Firmware 实现）管理，每次切换大约需要几百到上千个时钟周期——这就是 TrustZone 的性能开销。

---

## 三、SMC：跨世界通信的通道

SMC（Secure Monitor Call）是连接安全世界和非安全世界的**唯一软件通道**。

### SMC 调用约定

SMC 的调用约定定义了函数 ID（Function ID）来区分不同服务：

```c
// SMC Function ID 编码
// Bit[31]    : 0 = ARM 标准服务, 1 = OEM 自定义服务
// Bit[30]    : 0 = 从非安全世界调用, 1 = 从安全世界调用
// Bit[29:24] : 服务类型 (0=ARM 架构, 1=CPU 服务, 2=SiP...)
// Bit[23:0]  : 具体功能编号

#define SMC_ARM_UID         0xBF00FF01  // 查询 SMCCC 版本
#define SMC_ARM_GET_ID      0xBF00FF02  // 获取函数 ID 列表
#define SMC_FC_CALL          0xC2000001  // 自定义服务（OEM）
```

### Linux 中的 SMC 调用

在 Linux 内核中，通过 `smc_call()` 或 `arm_smccc_smc()` 发起 SMC：

```c
#include <linux/arm-smccc.h>

struct arm_smccc_res res;

/* 发起 SMC 调用，切换到安全世界 */
arm_smccc_smc(SMC_FC_CALL,      /* Function ID */
              0x01,              /* a1: 参数 1 */
              0x00,              /* a2: 参数 2 */
              0x00,              /* a3: 参数 3 */
              0x00,              /* a4: 参数 4 */
              0x00,              /* a5: 参数 5 */
              0x00,              /* a6: 参数 6 */
              0x00,              /* a7: 参数 7 */
              &res);

printk("SMC returned: a0=0x%lx, a1=0x%lx\n", res.a0, res.a1);
```

在用户空间，通过 `/dev/tee0` 字符设备与 TEE 交互，内核负责封装 SMC：

```c
int fd = open("/dev/tee0", O_RDWR);
struct tee_ioctl_invoke_arg arg;
// ... 填充 invoke 参数 ...
ioctl(fd, TEE_IOC_INVOKE, &arg);
```

用户级应用不需要直接接触 SMC 指令——那是由 TEE 驱动（`optee_linuxdriver`）代劳的。

---

## 四、OP-TEE：开源安全执行环境

OP-TEE（Open Portable Trusted Execution Environment）是目前最流行的开源 TEE 实现，遵循 GlobalPlatform TEE 标准。

### 架构总览

```
非安全世界                         安全世界
┌──────────────────┐            ┌──────────────────┐
│  Linux Kernel    │            │  OP-TEE OS       │
│  optee.ko        │   SMC     │  core/           │
│  (TEE 驱动)      │ ←──────→ │  tee_svc.c       │
│                   │            │  libutee/        │
│  User App        │  ioctl    │  (TA 库)          │
│  (CA - Client App)│ ←──────→ │  TA (Trusted App) │
└──────────────────┘            └──────────────────┘
```

**CA（Client Application）**：运行在非安全世界的用户态应用
**TA（Trusted Application）**：运行在安全世界的可信应用

### 一个完整的 OP-TEE 调用示例

**CA 端（非安全世界）：**

```c
#include <tee_client_api.h>

TEEC_Context ctx;
TEEC_Session sess;
TEEC_Operation op;
TEEC_UUID uuid = { 0x12345678, 0xabcd, 0xef01,
                   { 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0 } };

/* 1. 初始化 TEE 上下文 */
TEEC_InitializeContext(NULL, &ctx);

/* 2. 打开与 TA 的会话 */
TEEC_OpenSession(&ctx, &sess, &uuid,
                 TEEC_LOGIN_PUBLIC, NULL, NULL, NULL);

/* 3. 调用 TA 命令 */
op.paramTypes = TEEC_PARAM_TYPES(TEEC_MEMREF_TEMP_INPUT,
                                 TEEC_MEMREF_TEMP_OUTPUT,
                                 TEEC_NONE, TEEC_NONE);
op.params[0].tmpref.buffer = plaintext;
op.params[0].tmpref.size   = sizeof(plaintext);
op.params[1].tmpref.buffer = ciphertext;
op.params[1].tmpref.size   = sizeof(ciphertext);

TEEC_InvokeCommand(&sess, TA_CMD_ENCRYPT, &op, NULL);

/* 4. 关闭会话 */
TEEC_CloseSession(&sess);
TEEC_FinalizeContext(&ctx);
```

**TA 端（安全世界）：**

```c
#include <tee_internal_api.h>

TEE_Result TA_InvokeCommandEntryPoint(void *sessionContext,
                                      uint32_t cmdID,
                                      uint32_t paramTypes,
                                      TEE_Param params[4])
{
    switch (cmdID) {
    case TA_CMD_ENCRYPT: {
        /* 在安全世界执行加密——明文/密钥不会泄漏到非安全世界 */
        TEE_OperationHandle op;
        TEE_AllocateOperation(&op, TEE_ALG_AES_CBC_PKCS7,
                              TEE_MODE_ENCRYPT, 256);

        TEE_SetOperationKey(op, secure_key);  /* 密钥在安全世界内存中 */
        TEE_CipherInit(op, iv, sizeof(iv));
        TEE_CipherUpdate(op, params[0].memref.buffer,
                         params[0].memref.size,
                         params[1].memref.buffer,
                         &out_len);
        TEE_CipherDoFinal(op, NULL, 0,
                          params[1].memref.buffer + out_len,
                          &final_len);
        TEE_FreeOperation(op);
        return TEE_SUCCESS;
    }
    default:
        return TEE_ERROR_NOT_SUPPORTED;
    }
}
```

关键安全保证：**CA 只知道明文和密文，不知道密钥；TA 知道密钥但只在安全世界内部使用。** 即使 Linux 内核被攻破，密钥也不会泄漏，因为 Linux 根本没有访问安全内存的权限。

---

## 五、TrustZone 的实际应用场景

### 1. 移动支付保护

Android 的 TEE（如 Qualcomm 的 QTEE、华为的 iTrustee）在安全世界中管理指纹数据和支付密钥。指纹比对在安全世界完成，非安全世界的 App 只收到"验证通过/失败"的布尔结果。

### 2. 数字版权管理（DRM）

Widevine L1 等级的视频解密在安全世界中执行。非安全世界拿到的是解密后的视频帧，但没有解密密钥——即使设备 root，也提取不出密钥。

### 3. IoT 安全启动

安全世界负责验证非安全世界启动镜像的签名。从 BootROM 开始，每一级都经过签名验证：

```
BootROM (固化) → BL1 (安全) → BL2 (可信固件) → BL33 (U-Boot/Linux)
```

任何一级签名验证失败，系统停止启动。这是防止固件篡改的关键防线。

### 4. 嵌入式 Secure Element 替代

对于不需要独立安全芯片（SE）的场景，TrustZone 提供了"软件 SE"方案——在安全世界中实现密钥存储、签名验证和加密服务，避免外挂安全芯片的 BOM 成本。

---

## 六、调试技巧

### 判断当前处于哪个 EL

```asm
@ ARMv8-A
mrs x0, CurrentEL
and x0, x0, #0x0C   @ CurrentEL[3:2] 编码了 EL
lsr x0, x0, #2
@ x0 = 0 (EL0), 1 (EL1), 2 (EL2), 3 (EL3)
```

### 判断当前世界（安全/非安全）

```asm
@ 读取 Secure Configuration Register (EL3 下可读)
mrs x0, scr_el3
and x0, x0, #1  @ SCR.NS 位
@ x0 = 0 (安全世界), 1 (非安全世界)
```

### 当 TrustZone 导致诡异 bug 时

最常见的现象**不是 crash**，而是**某些外设寄存器无法访问**——因为外设的 TrustZone 安全配置（如 TZC 过滤器）设为了仅安全世界可访问，非安全世界（Linux）尝试访问时收到总线错误。

排查方法：检查设备的设备树中有没有 `secure-status = "disabled"` 或 `status = "okay"` + `access = "secure"` 等标记。

---

## 小结

TrustZone 不是某种"额外安全模块"，而是 ARM 架构**内建于 CPU 管理体系**中的安全机制。它的两个核心理念：

1. **EL0-EL3 四级特权**——EL3 作为 Secure Monitor 管理世界切换，EL1 运行 OS/TEE，EL0 运行应用
2. **物理级隔离**——AXI 总线的 NS 信号位从硬件层区分安全/非安全访问

OP-TEE 的开源实现降低了 TEE 的开发门槛，让嵌入式开发者可以在 SoC 级实现硬件安全——而不是只能靠软件混淆或者外挂安全芯片。

> 🏷️ TrustZone EL0 EL1 EL2 EL3 ARMv8-A SMC OP-TEE TEE 安全世界 非安全世界
