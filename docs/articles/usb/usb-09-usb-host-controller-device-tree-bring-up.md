---
title: "嵌入式知识体系 · USB 驱动开发实战 #09 · USB Host 控制器与设备树 Bring-up"
description: "USB 外设驱动真正落到嵌入式板卡上，第一道门槛通常不是 `usb_driver`，而是 **Host 控制器能否正常工作**。如果控制器没有启动、PHY 没有上电、VBus 没有输出，后面的 `lsusb`、类驱动和 `probe()` 都不会出现。"
pubDate: "2026-08-18"
series: usb
order: 9
tags: ["USB", "Linux Driver"]
draft: false
---
USB 外设驱动真正落到嵌入式板卡上，第一道门槛通常不是 `usb_driver`，而是 **Host 控制器能否正常工作**。如果控制器没有启动、PHY 没有上电、VBus 没有输出，后面的 `lsusb`、类驱动和 `probe()` 都不会出现。

这一篇以 Linux USB Host bring-up 为主线，覆盖控制器、PHY、时钟、复位、供电、设备树和实际外设验证。示例以常见的 DWC2/DWC3 控制器为背景，具体节点名称必须以目标 SoC 的官方 DTS、内核版本和板级原理图为准。

## 一、先建立正确的问题分层

USB Host 的工作链路可以拆成五层：

```mermaid
flowchart LR
    A[5V VBus 与限流开关] --> B[USB 连接器与 ESD]
    B --> C[USB PHY]
    C --> D[Host 控制器 DWC2/DWC3]
    D --> E[USB core 与 hub]
    E --> F[类驱动或专用驱动]
```

每一层失败的表现不同：

| 层次 | 主要问题 | 常见现象 |
|---|---|---|
| VBus | 供电开关、过流、极性 | 插入设备完全无反应 |
| 连接器 | D+/D-、SuperSpeed 差分线、ESD | 反复重连或高速降级 |
| PHY | 电源、参考时钟、校准 | 控制器启动失败、信号错误 |
| 控制器 | 时钟、复位、模式 | 没有 `/sys/bus/usb/devices` 下的 root hub |
| USB core | 枚举、hub、类驱动 | 能看到 root hub，但设备不绑定 |
| 外设驱动 | 描述符、端点、协议 | 设备出现但功能不可用 |

排查时必须从下往上确认，不能一看到 `probe()` 没进就立即修改设备驱动。

## 二、硬件 bring-up 前必须确认的内容

### 1. 连接器类型与角色

先确认板上接口是：

- 固定 Host 口；
- 固定 Device 口；
- OTG/DRD 双角色口；
- USB Type-C，角色由 CC 状态和 Type-C 控制器决定。

Micro-B、USB-A 和 USB-C 只是连接器形态，不等于 Linux 中的角色。一个 USB-C 接口可能由 extcon、USB role switch、Type-C Port Manager 或外部 PD 芯片共同决定数据角色。

### 2. VBus 电源路径

Host 端必须向外设提供 VBus。检查原理图时重点确认：

- VBUS 是否经过受控负载开关；
- 负载开关的 `EN` 是否接到 GPIO；
- 过流输出是否接入 SoC GPIO 或中断；
- 默认上电状态是否安全；
- 5V 电源是否足以支持目标外设的启动电流；
- USB-C 的 5.1 kΩ Rd/Rp 与角色配置是否匹配。

不要只用万用表测空载 5V。插入 U 盘、摄像头或移动硬盘时，还要观察 VBus 是否瞬间跌落。

### 3. 高速信号路径

USB 2.0 重点关注 D+、D- 的差分布线、阻抗、长度匹配和 ESD 器件寄生电容。USB 3.x 还要检查 TX/RX 差分对、参考地、连接器翻转路径和高速 mux。

在 USB 2.0 设备上，SuperSpeed 线路问题不会影响 USB 2.0 枚举；因此“USB 能识别”不代表高速通道完整。

## 三、Linux 内核中的控制器层次

以 Host 模式为例，软件结构大致是：

```text
USB device driver / class driver
        |
      usbcore
        |
       hub
        |
   HCD: xHCI / EHCI / OHCI / DWC2
        |
       PHY
        |
    SoC USB pins and power
```

HCD 是 Host Controller Driver 的缩写。它负责把 USB core 的请求翻译成控制器硬件可以执行的队列、传输描述符和中断处理。

常见控制器包括：

- `xhci-hcd`：USB 3.x，通常同时管理 USB 2.0 root hub 和 SuperSpeed root hub；
- `dwc2`：常见于 USB 2.0，支持 Host、Device 或 OTG；
- `dwc3`：控制器 IP，本身常由 glue 层连接 SoC 时钟、复位和 PHY；
- `ehci`、`ohci`：较老的 USB 2.0 Host 控制器。

先确认控制器驱动是否存在，再看对应设备树节点是否被内核实例化。

### `usb_add_hcd()` 是进入 usbcore 的注册边界

Platform probe 取得 MMIO/IRQ，enable clock、deassert reset、初始化 PHY 后，通常用 `usb_create_hcd()` 创建通用对象，填充控制器私有状态，再调用 `usb_add_hcd()` 注册 root hub并允许中断。此后即使没有外设，`lsusb -t` 也应能看到 root hub。

失败回滚必须反向停止控制器、remove HCD、退出 PHY、assert reset 和 disable clock。Root hub 都没有出现时，问题仍在控制器/HCD，修改 USB interface driver没有作用。

OHCI、EHCI、xHCI、DWC2/DWC3 的调度结构不同，但都通过 HCD 边界交给 usbcore。设备树 compatible 应匹配真实 IP/glue；例如 `generic-ehci` 只适合符合通用 EHCI platform binding 的控制器，不能替代厂商 glue 对 clock/PHY/quirk 的处理。

## 四、设备树中需要表达什么

设备树不是把 USB 协议写进去，而是描述控制器依赖的硬件资源。一个简化的控制器节点可能类似下面这样：

```dts
usb_host: usb@12340000 {
    compatible = "vendor,soc-usb-host";
    reg = <0x0 0x12340000 0x0 0x10000>;
    interrupts = <GIC_SPI 42 IRQ_TYPE_LEVEL_HIGH>;

    clocks = <&cru USB_BUS_CLK>,
              <&cru USB_REF_CLK>;
    clock-names = "bus", "ref";

    resets = <&cru SRST_USB_HOST>;
    reset-names = "usb-host";

    phys = <&usb2phy 0 PHY_TYPE_USB2>;
    phy-names = "usb2-phy";

    vbus-supply = <&vcc5v0_usb>;
    dr_mode = "host";
    status = "okay";
};
```

这只是结构示意，不能直接复制到任意芯片。字段含义如下：

- `compatible`：选择匹配的控制器驱动；
- `reg`：控制器寄存器物理地址和长度；
- `interrupts`：控制器中断；
- `clocks`：总线、参考、睡眠等时钟；
- `resets`：控制器复位线；
- `phys`：USB PHY；
- `vbus-supply`：Host 侧 VBus 电源；
- `dr_mode`：`host`、`peripheral` 或 `otg`；
- `status`：必须确保最终加载的 DTB 中是 `okay`。

### 设备树修改的验证方法

不要只看源码。编译并启动后，应直接检查运行时设备树：

```bash
tr '\0' '\n' < /proc/device-tree/soc/usb@12340000/compatible
cat /proc/device-tree/soc/usb@12340000/status
readlink /sys/bus/platform/devices/12340000.usb/driver
```

实际路径取决于 SoC 和内核设备模型。`/proc/device-tree` 证明的是当前运行 DTB，源码中写了 `status = "okay"` 并不能证明板子真的使用了这份 DTB。

## 五、从启动日志判断控制器状态

建议先打开串口，执行：

```bash
dmesg -wH
```

然后重新加载或重启观察 USB 相关日志：

```bash
dmesg | grep -Ei 'usb|xhci|dwc2|dwc3|phy|vbus|regulator|over-current'
```

正常 Host 启动通常能看到控制器注册、root hub 建立，以及 `hub 1-0:1.0` 一类信息。典型判断：

- 只有 PHY 错误：先查 PHY 电源、时钟和复位；
- 控制器 probe 失败：查 `reg`、中断、clock、reset、phy phandle；
- root hub 已建立但插入无日志：查 VBus、连接器和插座检测；
- 有插入日志但枚举失败：查信号质量、供电和设备兼容性；
- 枚举成功但功能不工作：进入类驱动或专用驱动层。

## 六、真实硬件上的最小验证阶梯

不要一开始就用 USB 摄像头和移动硬盘。建议采用由简单到复杂的顺序：

1. USB 鼠标或键盘：低功耗、协议标准、日志直观；
2. U 盘：验证 bulk 传输、存储栈和持续供电；
3. USB 转串口：验证设备节点、热插拔和用户态收发；
4. USB 网卡：验证持续数据流和网络吞吐；
5. UVC 摄像头：验证 isochronous/bulk 视频流和高带宽；
6. 移动硬盘：验证启动电流、供电余量和长时间稳定性。

每接入一个设备，都记录以下信息：

```bash
lsusb
lsusb -t
usb-devices
cat /sys/kernel/debug/usb/devices 2>/dev/null
```

`lsusb -t` 可以帮助确认设备挂在哪个 root hub、运行在 USB 2.0 还是 SuperSpeed，以及当前绑定了哪个驱动。

## 七、Host 与 Device 角色切换

对于 OTG 或 USB-C 接口，`dr_mode = "otg"` 只是允许双角色，不等于系统会自动在所有板子上正确切换。还可能涉及：

- `usb-role-switch`；
- extcon；
- Type-C connector 节点；
- VBUS 检测；
- ID pin；
- 外部 PD/Type-C 控制器。

运行时可以查看：

```bash
find /sys/class/usb_role -maxdepth 2 -type f -print -exec sh -c 'printf "  %s: " "$1"; cat "$1"' _ {} \;
```

如果设备树声明了双角色，但 role 节点不存在，说明控制器 glue、role switch 或内核配置还没有完整接通。

## 八、常见故障定位

### 故障 1：插入设备没有任何日志

先测 VBus，再检查插座 D+/D-。如果 VBus 为 0V，优先查看 regulator、GPIO、过流开关和 Host 角色；不要先改 USB 外设驱动。

### 故障 2：root hub 正常，外设枚举失败

检查：

- 插入瞬间 VBus 是否跌落；
- `-71`、`-110` 等错误码；
- USB 线和 ESD 器件；
- PHY 供电与参考时钟；
- 是否只有某一个外设失败。

`-110` 常表示超时，但根因可能是信号、电源或设备固件没有响应。

### 故障 3：USB 2.0 正常，USB 3.x 降速

分别验证 SuperSpeed 差分对、连接器翻转路径、mux 配置和 xHCI/PHY 的高速电源。不要用 USB 2.0 设备作为 SuperSpeed 通路的证据。

### 故障 4：设备反复断开重连

重点看：

- 过流保护是否触发；
- VBus 负载开关是否反复关闭；
- autosuspend 是否过早挂起；
- Hub 电源是否不足；
- 连接器机械接触是否可靠。

## 九、验收清单

完成一次 USB Host bring-up，至少应满足：

- [ ] 运行时 DTB 中控制器节点为 `okay`；
- [ ] 控制器、PHY、root hub 均成功 probe；
- [ ] Host 端 VBus 在空载和负载下均符合设计要求；
- [ ] 鼠标、U 盘、USB 转串口至少各验证一次；
- [ ] `lsusb -t` 能确认速度、拓扑和绑定驱动；
- [ ] 热插拔 50 次以上无异常；
- [ ] 持续传输测试中无重复 reset、超时和供电告警；
- [ ] USB 2.0 与 USB 3.x 路径分别验证过。

## 十、小结

USB Host bring-up 的主线是：

**原理图确认 → VBus 与 PHY → 控制器资源 → 设备树 → HCD probe → root hub → 外设枚举 → 类驱动。**

只有控制器和板级资源先稳定，USB 设备驱动层的调试才有意义。对于嵌入式 Linux，`probe()` 不进经常只是结果，真正的原因可能在供电、PHY、时钟、复位、角色切换或 DTB 没有生效。

---
