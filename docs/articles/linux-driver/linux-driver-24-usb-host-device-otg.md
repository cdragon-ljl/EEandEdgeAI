---
title: "嵌入式知识体系 · Linux 驱动开发实战 #24 · USB Controller、PHY、Host 与 Gadget"
description: "以一个可重复插拔的 USB 接口为主线，建立角色选择、PHY/VBUS、枚举、gadget、日志与恢复验证的完整路径。"
pubDate: "2026-08-16"
series: linux-driver
order: 24
tags: ["Linux BSP", "USB", "Host", "Gadget", "OTG", "PHY"]
draft: false
---

USB 接口“没有识别 U 盘”时，最先要回答的不是“缺哪个驱动模块”，而是这一个 Type-A、Micro-USB 或 Type-C 口在当前硬件上到底承担 host、device 还是 OTG 角色。

host 负责提供 VBUS 并发起枚举；device 等待对端 host 枚举；OTG 需要基于 ID/VBUS/Type-C 控制器动态决定角色。

角色、USB PHY、控制器、VBUS 电源开关、连接检测和上层 class driver 缺一不可。

本章以“接口能稳定完成插入、枚举、传输、拔出并恢复”为主线组织 USB 调试。

## 1. 先确定接口的物理角色和供电方向

同一个 SoC USB controller 常既可作为 host，也可作为 gadget controller。

板级连接方式决定它在产品中是否真的能切换。

Type-A 通常固定为 host；Micro-B 通常固定为 device；Micro-AB 或 Type-C 可能需要 OTG/dual-role 支持，但仍要看 CC、ID 和 VBUS 检测电路是否实际接出。

```mermaid
flowchart TD
    A[USB connector] --> B{hardware role wiring}
    B -- Type-A host --> C[provide VBUS]
    B -- Micro-B device --> D[detect peer VBUS]
    B -- OTG/Type-C --> E[role switch controller]
    C --> F[host controller + PHY]
    D --> G[gadget controller + PHY]
    E --> F
    E --> G
```

| 问题 | 必须由原理图回答 |
| --- | --- |
| VBUS 由谁供电 | PMIC、load switch、外部 hub 还是对端 |
| 过流信号接到哪里 | GPIO、PMIC IRQ、无检测或 Type-C controller |
| ID/CC 信号是否存在 | 是否真的支持 OTG/dual-role |
| D+/D- 是否经过 hub/ESD/mux | 连接拓扑和 power sequence |
| USB2/USB3 PHY 是否独立 | 对应 controller 和时钟资源 |

不要把固定 Type-A host 口设成 dr_mode = "otg"，也不要期望一个没有 VBUS source 的 device-only 口去驱动 U 盘。

### 为实验选择安全的外设

host 验证可使用已知良好的低功耗 U 盘、USB 串口或键盘。

device/gadget 验证需连接可信 PC。对含有产品数据的 U 盘，不应使用自动挂载后立即写入的脚本。

```mermaid
flowchart LR
    A[connector and VBUS] --> B[USB PHY]
    B --> C[USB controller]
    C --> D[host enumeration or gadget bind]
    D --> E[USB class/function]
    E --> F[mount, tty, HID or PC application]
```

## 2. 第一步：让 DTS 描述 controller、PHY、VBUS 和角色

USB controller 节点需要关联 PHY、clock、reset、interrupt 和可能的 VBUS regulator/role switch。

属性与节点命名高度依赖 SoC 和内核版本，下面只强调资源关系。

```dts
&usb_host {
    dr_mode = "host";
    phys = <&usb2phy_host>;
    phy-names = "usb2-phy";
    vbus-supply = <&vcc_usb_host_5v>;
    status = "okay";
};

&usb_device {
    dr_mode = "peripheral";
    phys = <&usb2phy_device>;
    phy-names = "usb2-phy";
    status = "okay";
};
```

dr_mode 说明 controller 的软件角色，vbus-supply 说明 host 口提供电源的资源。

它们不能替代实际 load switch、over-current GPIO、Type-C controller 或 pinctrl 配置。

```mermaid
sequenceDiagram
    participant K as kernel driver
    participant R as VBUS regulator
    participant P as USB PHY
    participant C as USB controller
    participant D as USB device
    K->>R: enable host VBUS
    K->>P: power/init PHY
    K->>C: start host controller
    D->>C: attach and pull-up
    C->>D: reset and enumerate
    C-->>K: create USB device
```

若 VBUS 未实际升到规定电压，host 即使 controller 驱动加载成功也不会发现外设。

应先测 VBUS 测试点，再检查 regulator summary、过流状态和 USB 日志。

```sh
dmesg -w
lsusb -t
lsusb
find /sys/bus/usb/devices -maxdepth 1 -type l | sort
```

## 3. 第二步：用枚举日志区分物理连接、PHY 与 class driver

USB 枚举有明确的时序：检测 attach、端口 reset、读取 descriptor、选择 configuration，最后才绑定 mass storage、HID、CDC ACM 等 class driver。

```mermaid
sequenceDiagram
    participant H as host controller
    participant P as PHY
    participant U as USB peripheral
    participant C as class driver
    U->>P: attach/pull-up
    P->>H: connect status
    H->>U: port reset
    H->>U: read descriptors
    H->>U: set configuration
    H->>C: bind matching interface
```

如果 dmesg 中完全没有 connect 事件，先查 VBUS、线缆、connector、PHY 供电和 controller role。

如果能看到 new USB device 但 descriptor read error，查信号完整性、供电压降、hub、PHY 时钟和对端设备。

如果枚举成功但没有 /dev/ttyACM0 或 block device，则问题在 class driver、配置或权限层。

| 现象 | 更可能的层 | 第一项检查 |
| --- | --- | --- |
| 插拔无任何日志 | VBUS/PHY/role/物理连接 | 万用表测 VBUS，核对 dr_mode |
| 反复 reset/disconnect | 供电压降、线缆、PHY、过流 | dmesg 时间线和 VBUS 波形 |
| 设备出现在 lsusb 但无功能节点 | class driver 或接口类型 | lsusb -v、内核模块、udev |
| U 盘出现又立刻消失 | 供电能力或介质错误 | VBUS 电流、hub、dmesg |
| 只在 USB2/USB3 一种速率失败 | 对应 PHY/lane/mux | 端口拓扑和 speed 日志 |

### 不要把 USB 存储枚举和文件系统挂载混为一谈

USB mass storage 驱动成功后只会产生块设备，例如 /dev/sda。

分区表、文件系统、自动挂载和应用权限仍是独立问题。

先用 lsblk 和 blkid 确认目标，再在安全条件下挂载。

```sh
lsblk -o NAME,TRAN,SIZE,FSTYPE,LABEL,MOUNTPOINTS
blkid /dev/sdX1
mount -o ro /dev/sdX1 /mnt/usb-test
```

首次验证建议只读挂载，避免因错误目标、文件系统错误或应用脚本写入破坏用户介质。

## 4. 第三步：在 device/gadget 模式中显式管理功能组合

当板子作为 USB device 连接 PC 时，Linux gadget framework 需要提供明确功能，例如 ACM 串口、ECM/RNDIS 网络、mass storage 或自定义 FunctionFS。

它不是“开启 USB device controller 后 PC 自动看到文件”的行为。

```mermaid
flowchart LR
    A[UDC controller] --> B[configfs gadget]
    B --> C[configuration]
    C --> D[ACM function]
    C --> E[ECM/RNDIS function]
    C --> F[mass-storage function]
    D --> G[PC serial port]
    E --> H[PC network interface]
    F --> I[PC block device]
```

gadget 的 vendor ID、product ID、serial、configuration 和 function 必须由产品配置管理，而不是每次启动临时拼接。

mass-storage function 若导出某个镜像或 block device，Linux 本地不能同时以可写方式挂载并修改同一后端，否则两端文件系统视图会不一致。

### role 切换必须有单一控制者

OTG/Type-C 场景下，role switch 可能由 Type-C controller、extcon、USB role switch framework 或 vendor glue driver 协调。

手工在 sysfs 与脚本中交替加载 host/gadget 驱动，容易造成 VBUS 同时被两个方向驱动或 controller 状态残留。

```mermaid
flowchart TD
    A[ID/CC/VBUS event] --> B[role switch policy]
    B --> C{selected role}
    C -- host --> D[enable VBUS and host]
    C -- device --> E[disable local VBUS and bind gadget]
    D --> F[enumerate peripheral]
    E --> G[peer PC enumerates board]
```

对于固定角色产品，最可靠的策略通常是固定 DTS role 和简化硬件路径。

只有真实产品需要双角色时，才引入 OTG/Type-C 状态机并进行电源和插拔全组合验证。

## 5. 第四步：用插拔、过流和解绑回归证明接口可长期工作

USB 的成功标准必须包含重复插拔、不同设备、异常断开和恢复。

对 host 口，还应验证 VBUS 过流或短路保护不会导致 SoC 或其他端口异常；对 gadget 口，验证 PC 重连、功能重新绑定和数据一致性。

```mermaid
flowchart TD
    A[baseline enumeration] --> B[repeat plug/unplug]
    B --> C[transfer data]
    C --> D[unplug during idle]
    D --> E[replug and re-enumerate]
    E --> F[check dmesg and sysfs cleanup]
    F --> G[power cycle]
    G --> H[repeat with another device]
```

| 验收项目 | Host | Device/Gadget |
| --- | --- | --- |
| 供电 | VBUS 电压、电流和过流保护 | 不向对端反向供电 |
| 枚举 | 多种 class 设备均能识别 | PC 能稳定识别 VID/PID/功能 |
| 数据 | 连续读写、错误统计 | 串口/网络/存储功能完整 |
| 插拔 | 设备节点、挂载和驱动清理 | PC 拔插后重新绑定 |
| 重启 | controller 和 PHY 可恢复 | gadget 配置不依赖旧连接 |

### 本章练习

从原理图确认一个 USB 口的 connector 类型、实际角色、VBUS 来源、过流检测和 PHY/controller 对应关系。

在 DTS 中核对 dr_mode、PHY 和 VBUS resource，并用万用表与 dmesg 验证 host 枚举。

使用低功耗 USB 串口、键盘和 U 盘分别验证 class driver 路径，首次对 U 盘只读挂载。

为一个 device 口创建最小 ACM 或 ECM gadget，在 PC 端反复插拔并保存枚举与数据传输日志。

### 本章验收

完成本章后，应能独立回答：

- host、device、OTG/dual-role 的电源与枚举责任如何不同；
- 为什么 connector 外形不能单独证明接口角色；
- dr_mode、PHY 与 VBUS regulator 在 DTS 中各自描述什么；
- USB 枚举日志如何区分物理层、descriptor 和 class driver 问题；
- 为什么 USB 存储出现块设备后仍要单独处理分区与挂载；
- gadget framework 为什么需要显式的 function/configuration；
- 为什么 host 与 gadget 不能无控制地同时驱动同一个 controller；
- 如何用重复插拔、过流和重启验证 USB 端口的恢复能力。

当角色、供电、PHY、枚举和功能绑定都能逐层验证时，USB 接口才具备产品所需的可恢复性，而不是只在某一根线和某一个 U 盘上偶然可用。

### 建议保留的 USB 接口档案

每个 USB connector 都应在板级文档中有一张接口卡片：物理位置、连接器类型、固定或动态角色、controller/PHY 名称、VBUS 来源与额定电流、过流信号、可支持的速率、是否经过 hub/mux，以及允许连接的产品外设。

测试记录至少保存插入和拔出时的 dmesg、lsusb -t 拓扑、枚举速度、class driver、传输结果和 VBUS 实测值。对 Type-C 口还应保留 CC/role 状态，不能仅凭 USB 设备节点出现判断供电方向正确。

当发生反复重连时，先断开高功耗外设，观察 VBUS 是否跌落；随后使用短的已知良好线缆和直连口复测，再检查 hub、ESD、mux 和 PHY。一次性同时替换线、U 盘、hub 和 DTS 会失去定位价值。

若产品需要导出 mass-storage gadget，发布前应明确后端镜像是否只读、何时允许 host 写入、Linux 本地是否会挂载该介质，以及异常断开后的数据恢复策略。

USB 设备迁移到另一台 PC 时，host 的权限策略、已安装驱动和连接器能力会改变现象。测试 PC 的操作系统、端口类型、hub 以及 USB 视图也应写入记录，特别是在验证 gadget 网络、串口或历史兼容性时。

对于 host 口，允许的最大电流应由 VBUS 开关、PMIC 和电源预算共同决定。插入高功耗硬盘、4G/5G 模块或多级 hub 前，先确认负载峰值与过流策略；发现低压重连时优先检查供电能力，而不是强行禁止 USB reset。

接口从设备被拔出到内核完成清理可能会有短暂延迟。应用应处理节点消失、读写返回错误和重新枚举，而不应持有旧的 /dev/tty、block 或 network interface 句柄持续重试。

对需要支持现场升级的 USB 口，还应写清被允许的设备类型、验证机制和权限。把任意 U 盘自动执行脚本或自动写入系统分区会给产品引入可被物理访问触发的安全风险。

高速模式验证还需要记录实际协商 speed。一个设备退回 USB2 或 full-speed 时，枚举仍可能成功，但摄像头、网卡或存储的业务带宽会完全不同。

对 USB 网卡或 USB 串口模块，设备节点出现后还要验证网络地址或串口参数、断开后的应用错误处理，以及重插后设备命名变化。class driver 的 probe 成功只是业务路径的起点。

接口若使用外部 hub，hub 的上电与复位也属于链路。先验证无下游设备时 hub 自身是否稳定存在，再分别验证单设备和多个下游设备，避免把 hub 电源问题误判成某个外设的兼容性问题。

任何需要启用 autosuspend 的 USB 产品，都应在空闲、持续传输、拔插和系统恢复场景下测试。只在 idle 下观察到低功耗不代表恢复时不会发生丢失或超时。

对需要用户现场使用的端口，机械寿命和插拔方向也要进入系统测试。connector 松动、污染或反复受力造成的接触不良，软件日志通常只会表现为 disconnect/reconnect，仍需要结合物理检查处理。

USB 错误报告应包含 bus/port 路径，尤其是在 hub 下。只写“U 盘断开”无法定位是上游 root hub、外部 hub 还是某个下游口发生故障。

- 固定角色口的 dr_mode 与电源方向；
- VBUS 空载和负载电压；
- 插入设备的 VID/PID、速率和 port path；
- 枚举失败的完整 dmesg；
- class driver 与用户态功能结果；
- 拔出后的节点清理和重插恢复；
- autosuspend/系统恢复后的再次传输。

这些项目组成接口最小回归表。设备类型增加、hub 变更或根文件系统升级后，应重新执行而不是沿用以前的一次成功记录。

测试结束时应拔出所有外设并确认 host controller、hub 与应用资源已清理，再开始下一轮样本。

> 🏷️ Linux BSP · USB · host · gadget · OTG · PHY · VBUS · enumeration
