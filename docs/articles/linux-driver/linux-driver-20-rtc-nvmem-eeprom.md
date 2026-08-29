---
title: "嵌入式知识体系 · Linux 驱动开发实战 #20 · RTC、NVMEM、EEPROM 与板级数据"
description: "区分 RTC 的时间与闹钟职责、NVMEM 的 provider/cell 模型和 EEPROM 的物理存储特性，并用只读实验安全检查序列号、MAC 地址与校准数据。"
pubDate: "2026-08-29"
series: linux-driver
order: 20
tags: ["Linux Driver", "RTC", "NVMEM", "EEPROM", "Device Tree"]
draft: false
---

上一章从 ADC 通道读到了会随外部电压变化的采样值。这样的数据描述“现在测到了什么”，而一块板还需要另外两类不随本次进程消失的信息：断电后仍继续走动的日期时间，以及出厂后应长期保留的序列号、网卡地址和校准参数。它们都具有“掉电后还在”的特征，却不应该由同一套接口处理。

RTC 关心的是时间和闹钟。EEPROM、片上 OTP 或其他非易失介质关心的是若干字节存在哪里。NVMEM 再把这些介质中的一段字节命名为 cell，让网卡、传感器等消费者不必知道序列号位于哪一颗芯片的哪个偏移。把三者混成一个“保存数据的地方”，最直接的后果就是驱动开始硬编码偏移，或者为了读 MAC 地址而绕过已有 EEPROM 驱动。

本章先把这三种职责拆开，再完成一组只读实验。实验会读取 RTC、设置一个不会让系统休眠的短时闹钟，检查 NVMEM provider，并把需要分析的字节复制到 `/tmp` 后验证。它不会写 EEPROM，也不会尝试编程不可逆的 eFuse。通用接口以 Linux 6.12 为基线；RV1126 SDK 中的 RTC 节点、EEPROM 型号、总线地址和 cell 偏移只能从实际原理图、设备树与量产资料确认。

## 1. RTC class 表达时间和 alarm

Linux 内核维护自己的系统时间，调度器和超时机制还使用单调时钟。RTC 则通常是 SoC 内部或 I2C/SPI 总线上的低功耗时钟器件，在主电源关闭后由后备电源继续计时。系统启动时可以从 RTC 取得初始墙上时间，联网后再由时间同步服务校准系统时间；关机前也可以把校准后的系统时间写回 RTC。

`hwclock --hctosys` 是从硬件时钟设置系统时钟，`hwclock --systohc` 是从系统时钟写回硬件时钟。读取命令适合本章实验，写回命令会改变设备状态，只应在已经明确 UTC/本地时间约定和时间同步策略后使用。RTC 通常按 UTC 保存，不负责时区和夏令时换算。

RTC 的另一个职责是闹钟。用户给出未来时刻，RTC 在计时到达后产生中断；如果硬件连线、电源域和系统睡眠策略都支持唤醒，这个中断还可以唤醒系统。并非每个 RTC 都有 alarm IRQ，也并非注册了 `/dev/rtc0` 就一定具备系统唤醒能力，因此“能读时间”“能产生闹钟”和“能从 suspend 唤醒”是三个逐层增加的能力。

### 1.1 驱动、RTC core 与用户接口

RTC 驱动注册 `struct rtc_device` 并通过 `struct rtc_class_ops` 提供硬件真正支持的操作。学习阶段最常遇到的是 `read_time`、`set_time`、`read_alarm`、`set_alarm` 和 `alarm_irq_enable`。`struct rtc_time` 表示拆分后的年月日时分秒，`struct rtc_wkalrm` 在时间之外还带有 alarm 是否启用以及是否已触发的状态。

RTC core 负责 `/dev/rtcN`、`/sys/class/rtc/rtcN` 和通用 ioctl；芯片驱动负责把请求转换为寄存器读写。Linux 6.12 的公共声明位于 `include/linux/rtc.h`，class 注册和用户请求的核心实现主要位于 `drivers/rtc/class.c` 与 `drivers/rtc/interface.c`。

```text
hwclock / rtcwake / sysfs
            |
        RTC core
            |
   struct rtc_class_ops
            |
  SoC RTC 或 I2C/SPI RTC
```

一台机器可以注册多个 RTC。编号来自探测顺序，不适合作为产品含义；启动日志、sysfs 的 `name`、设备树和系统时间策略共同决定哪一个用于开机校时。

```sh
cat /sys/class/rtc/rtc0/name
hwclock --show
date
```

RTC 电池掉电、首次生产或振荡器误差都会让时间不可信，因此安全日志不能仅凭 RTC 非零就认定时间正确。

## 2. NVMEM provider 暴露介质

假设一颗 I2C EEPROM 的前 16 字节保存序列号，接着 6 字节保存以太网 MAC 地址，另一个区域保存 ADC 校准参数。如果网卡驱动直接操作 I2C 地址 `0x50` 并读取固定偏移，它就同时承担了 EEPROM 访问、板级布局和 MAC 格式验证三种职责。换一颗 EEPROM 或调整布局时，网卡驱动也要跟着修改。

NVMEM 用 provider/consumer 模型拆开这些事情。EEPROM、OTP controller 或特定 flash 区域注册 NVMEM provider，说明介质大小、字宽以及怎样读写；板级描述再把 provider 中的地址范围划成具名 cell；消费驱动只按名字取得 cell。这样，“怎样访问介质”和“这些字节在产品上表示什么”可以分别变化。

### 2.1 provider 提供字节访问能力

provider 驱动填充 `struct nvmem_config` 并调用 `devm_nvmem_register()`。配置中的 `reg_read` 和可选 `reg_write` 回调把 NVMEM core 的偏移访问转换为真实总线或寄存器操作。只读 OTP 可以不提供写能力；I2C EEPROM 驱动则可以在器件能力和写保护允许时提供写操作。

以常见的 AT24 系列 EEPROM 为例，Linux 的 `drivers/misc/eeprom/at24.c` 已经处理 I2C 传输、器件容量、页写限制和 NVMEM 注册。使用它的板级代码通常不需要再写一个“EEPROM 字符设备驱动”。EEPROM 是物理器件类别，NVMEM 是内核向其他驱动提供非易失数据的统一框架，二者不是互相替代的名称。

下面的设备树片段只展示关系。`eeprom@50`、容量兼容串、偏移和长度均为教学示例，不是 RV1126 开发板实测值：

```dts
eeprom@50 {
    compatible = "atmel,24c02";
    reg = <0x50>;
    read-only;

    #address-cells = <1>;
    #size-cells = <1>;

    serial: serial@0 { reg = <0x00 0x10>; };
    mac0: mac@10 { reg = <0x10 0x06>; };
    calibration: calibration@20 { reg = <0x20 0x40>; };
};
```

新旧内核对 NVMEM layout binding 的表达有演进，厂商 SDK 也可能基于较旧内核。移植时先用该内核源码自带的 binding 和现有 DTS 确定写法，再运行 `make dtbs_check`；“dtc 能生成 dtb”只能证明语法可编译，不足以证明节点符合对应版本 schema。

### 2.2 cell 给字节范围赋予板级含义

consumer 引用 cell 名称，不再散布 offset：

```c
cell = devm_nvmem_cell_get(dev, "calibration");
buf = nvmem_cell_read(cell, &len);
if (IS_ERR(buf))
    return PTR_ERR(buf);
```

完整的消费节点还会用 `nvmem-cells` 引用 phandle，并用 `nvmem-cell-names` 赋予消费者使用的名字。消费驱动传入 `calibration` 时，NVMEM core 把 cell 的 offset/length 交给 EEPROM provider，provider 再完成真实 I2C 读取。

`devm_nvmem_cell_get()` 管理 cell 引用的释放，`nvmem_cell_read()` 返回的内容缓冲区仍由调用者在使用后 `kfree()`。cell 名字让消费驱动摆脱物理偏移，却不会替消费者判断内容是否合理。驱动仍要验证长度、magic、版本、CRC 和数值范围，再应用到硬件。

## 3. 数据格式是跨阶段协议

序列号、MAC 和校准块要同时被工装、Bootloader、Linux 和应用理解。记录应规定字节序、长度、版本和完整性。全 0、全 FF、截断或未知版本不能默认为有效值。

序列号不能对固定长度原始区直接调用 `strlen()`，因为内容可能没有 NUL。MAC cell 除了恰好 6 字节，还应排除全零、广播和组播地址。校准块应包含 layout version、payload length、定点数比例和 CRC，并确认它属于当前 sensor/module revision。NVMEM cell 只回答“读哪一段”，不回答“这一段怎样解释”。

EEPROM 有页写大小、内部 write cycle 和寿命限制。跨页内容若在掉电时只写了一部分，就会出现新旧字段混合，而不是自动回到旧版本。正常产品系统通常只读消费，写入由受控量产流程完成。eFuse/OTP 的某些位只能改变一次，错误值无法像 EEPROM 那样擦除重写，因此它的不可逆写入不属于本章实验。

## 4. 分别验证时间和身份

实验可以在具备 RTC class 的 Linux 6.12 主机或目标板上进行。先列出所有 RTC，并把编号、驱动名和当前值一起记录：

```sh
for rtc in /sys/class/rtc/rtc*; do
    [ -d "$rtc" ] || continue
    echo "== $rtc =="
    for attr in name date time since_epoch hctosys; do
        [ -r "$rtc/$attr" ] &&
            printf '%-12s %s\n' "$attr" "$(cat "$rtc/$attr")"
    done
    readlink -f "$rtc/device/driver" 2>/dev/null || true
done

ls -l /dev/rtc* 2>/dev/null || true
cat /proc/driver/rtc 2>/dev/null || true
```

`name` 指出 RTC 驱动或硬件身份，`date` 与 `time` 是 RTC 当前日历值，`since_epoch` 便于同系统时间比较，`hctosys` 为 `1` 的设备表示本次启动曾用它初始化系统时间。某些内核没有导出所有属性，缺少一个文件只表示该 ABI 或驱动能力不可用。

如果系统提供 `hwclock`，再做一次纯读取：

```sh
sudo hwclock --show --rtc=/dev/rtc0
date -u '+system UTC: %Y-%m-%d %H:%M:%S'
```

BusyBox 与 util-linux 的 `hwclock` 参数可能不同，先运行 `hwclock --help`。两者有几秒差异并不奇怪；明显偏差则要继续检查后备电池、RTC 是否停振、启动校时方向和时间同步服务。

### 4.1 不进入休眠也能观察一次 alarm

选定已经确认身份的 RTC，例如 `/sys/class/rtc/rtc0`。下面只把 alarm 设置到 60 秒后，不执行 suspend：

```sh
RTC=/sys/class/rtc/rtc0
WAKEALARM="$RTC/wakealarm"

if [ ! -w "$WAKEALARM" ]; then
    echo "$WAKEALARM is absent or not writable"
    exit 1
fi

alarm=$(( $(date +%s) + 60 ))
printf 'alarm epoch: %s\n' "$alarm"

sudo sh -c "echo 0 > '$WAKEALARM'; echo '$alarm' > '$WAKEALARM'"
cat "$WAKEALARM"
sleep 65
cat /proc/driver/rtc 2>/dev/null || true
```

写入 `0` 先取消旧 alarm，随后写入 Unix epoch 秒。立刻读回的值应与计划时间对应；约一分钟后，支持 alarm IRQ 的驱动可能在 `/proc/driver/rtc` 中显示 pending 状态变化。这个实验只观察 alarm 编程路径，不能证明系统能够从 suspend 唤醒。若要验证唤醒，还要确认 `wakeup-source`、中断路由、电源域和板级连接，并在可恢复环境中单独测试。

RTC 断主电保留实验还依赖真实后备电池和板级供电，不能由本文远程声称结果。关机、断主电、等待和重新上电后，应记录 RTC 经过的时间是否合理，而不是用系统联网校时后的 `date` 代替硬件证据。


## 5. consumer 读取后要拥有并验证数据

`nvmem_cell_read()` 返回动态分配的 buffer，consumer 检查长度并复制到自己的对象：

```c
buf = nvmem_cell_read(cell, &len);
if (IS_ERR(buf))
    return PTR_ERR(buf);
if (len != ETH_ALEN || !is_valid_ether_addr(buf)) {
    kfree(buf);
    return -EINVAL;
}
ether_addr_copy(mac, buf);
kfree(buf);
```

序列号不能直接对原始字节调用 `strlen()`；固定长度字段可能没有 NUL。校准块应包含 magic、layout version、payload length 和 CRC，并确认它属于当前 sensor/module revision。

先用只读命令发现 provider：

```sh
find /sys/bus/nvmem/devices -maxdepth 2 -type f -o -type l 2>/dev/null | sort

for dev in /sys/bus/nvmem/devices/*; do
    [ -d "$dev" ] || continue
    echo "== $dev =="
    [ -r "$dev/name" ] && cat "$dev/name"
    [ -r "$dev/size" ] && cat "$dev/size"
    ls -l "$dev/nvmem" 2>/dev/null || true
done
```

Linux 6.12 的 NVMEM core 可在 provider 设备目录中建立二进制 `nvmem` 属性；它是否可读还受 provider、内核配置和权限限制。发现 provider 后，回到实际 DTS 找到 cell 的 offset/length。下面沿用前面教学布局，只示范怎样复制字节；路径和范围要替换为真实值：

```sh
PROVIDER=/sys/bus/nvmem/devices/0-0050/nvmem

# 这些范围来自本文示意 DTS，不是 RV1126 固定布局。
sudo dd if="$PROVIDER" of=/tmp/board-eeprom.bin bs=1 status=none
dd if=/tmp/board-eeprom.bin of=/tmp/serial.bin bs=1 skip=$((0x00)) count=$((0x10)) status=none
dd if=/tmp/board-eeprom.bin of=/tmp/mac.bin    bs=1 skip=$((0x10)) count=$((0x06)) status=none
dd if=/tmp/board-eeprom.bin of=/tmp/cal.bin    bs=1 skip=$((0x20)) count=$((0x10)) status=none

wc -c /tmp/serial.bin /tmp/mac.bin /tmp/cal.bin
od -An -tx1 -v /tmp/mac.bin
```

所有后续解析都针对 `/tmp` 中的副本。这样即使验证脚本有错误，也不会改动 provider。若目标是 OTP/eFuse，更应保持这一读出后离线分析的路径。

### 5.1 同时验证长度、语义和校验值

下面的完整脚本给出一个教学格式。序列号要求 4 到 16 个可打印 ASCII 字符；MAC 必须是 6 字节、非全零、非全 `ff` 且为单播地址；校准块固定为 16 字节，包含 `CAL1` magic、版本、总长度、保留标志、带符号 offset、Q12 gain 和对前 12 字节计算的 CRC32。

这套校准格式用于演示验证层次，不是 RV1126 或某家板卡的既有格式。产品若已有量产 ABI，应按现有文档解析。

```python
#!/usr/bin/env python3
import pathlib
import struct
import sys
import zlib


def read_exact(path, size):
    data = pathlib.Path(path).read_bytes()
    if len(data) != size:
        raise ValueError(f"{path}: expected {size} bytes, got {len(data)}")
    return data


def validate_serial(path):
    raw = read_exact(path, 16)
    value = raw.rstrip(b"\x00\xff")
    if not 4 <= len(value) <= 16:
        raise ValueError("serial length is outside 4..16")
    if any(byte < 0x21 or byte > 0x7e for byte in value):
        raise ValueError("serial contains non-printable bytes")
    return value.decode("ascii")


def validate_mac(path):
    mac = read_exact(path, 6)
    if mac == b"\x00" * 6 or mac == b"\xff" * 6:
        raise ValueError("MAC is empty or erased")
    if mac[0] & 1:
        raise ValueError("MAC is multicast")
    return ":".join(f"{byte:02x}" for byte in mac)


def validate_calibration(path):
    raw = read_exact(path, 16)
    magic, version, total_len, flags, offset, gain_q12 = struct.unpack(
        "<4sBBHhH", raw[:12]
    )
    stored_crc, = struct.unpack("<I", raw[12:])
    actual_crc = zlib.crc32(raw[:12]) & 0xffffffff
    if magic != b"CAL1" or version != 1 or total_len != 16:
        raise ValueError("unknown calibration format")
    if flags != 0 or gain_q12 == 0:
        raise ValueError("invalid flags or gain")
    if stored_crc != actual_crc:
        raise ValueError("calibration CRC mismatch")
    return offset, gain_q12 / 4096.0


if len(sys.argv) != 4:
    raise SystemExit(f"usage: {sys.argv[0]} SERIAL MAC CALIBRATION")

try:
    serial = validate_serial(sys.argv[1])
    mac = validate_mac(sys.argv[2])
    offset, gain = validate_calibration(sys.argv[3])
except (OSError, ValueError, UnicodeError) as error:
    raise SystemExit(f"invalid board data: {error}")

print(f"serial={serial}")
print(f"mac={mac}")
print(f"adc_offset={offset}, adc_gain={gain:.6f}")
```

运行并解释输出：

```sh
python3 validate_board_data.py /tmp/serial.bin /tmp/mac.bin /tmp/cal.bin
```

成功输出表示三个副本符合约定格式，不表示它们一定属于当前产品。还应把序列号与标签或生产数据库比对，把 MAC 与合法地址分配记录比对，并把校准版本与消费驱动支持的版本比对。验证失败时保留原始副本和 provider/DT 身份，回到生产数据来源排查，不在运行板上“修成一个能通过的值”。

## 6. 写入流程与运行时读取分开

EEPROM 写入受 page size、write-cycle 和掉电影响。量产流程可以先写 staging record，读回验证后再写 commit marker；正常 rootfs 则保持 provider 或节点只读。这样中途掉电留下“未提交记录”，而不是看似有效的半份身份。

建立数据字典时，为每个 cell 记录 offset、长度、字节序、版本、默认/无效模式和写入责任方。冷启动、Bootloader、Linux 和应用读取到的 MAC/serial 应一致。日志可以记录来源和版本，不应打印密钥或完整敏感身份材料。

断主电实验观察 RTC 是否依靠后备电源继续走时，NVMEM 身份则应保持原字节不变；rootfs 升级不应覆盖出厂 cell，无效 CRC 应产生明确错误或受控默认值，而不是继续应用随机数据。这些现象分别证明时间保持、非易失存储和格式校验，不能用一个“读取成功”混合代替。

## 7. 把观察结果放回驱动调用链

RTC 实验经过用户工具、RTC core、`rtc_class_ops` 和具体 RTC 驱动；NVMEM 实验经过 sysfs 二进制属性、NVMEM core、provider 回调和 EEPROM/OTP 驱动。消费驱动按 cell 名读取时，路径略有不同，但不会改变 provider 的物理访问职责：

```text
消费驱动 --cell name--> NVMEM core --offset/length--> provider --总线访问--> EEPROM/OTP
```

如果 `/dev/rtc0` 不存在，先看 RTC 设备是否 probe、驱动和时钟/中断资源是否齐全；如果 RTC 能读时间却不能设置 alarm，就检查该驱动是否实现 alarm 回调以及硬件是否有 IRQ。若 NVMEM provider 存在而消费驱动得到 `-ENOENT`，问题通常在 `nvmem-cell-names`、phandle 或 consumer 节点关系；若 cell 能读但内容不通过验证，问题已经从连接关系推进到布局、量产数据或字节序。

> **RV1126 差异：** 本章没有假定 RV1126 板上使用哪一个 RTC、哪一颗 EEPROM、哪个 I2C 地址，也没有假定 SoC OTP 的 cell 布局。厂商 4.19/5.10 SDK 可能拥有不同的 RTC 驱动、旧版 NVMEM binding 或私有 efuse 节点。应以该 SDK 的 DTS、binding、驱动源码和实际启动日志为证据，再与 Linux 6.12 的通用对象关系对照。

本章的数据量很小，读取几个 cell 时由 CPU 完成复制完全合理。摄像头帧、显示缓冲区、网络包和高速外设数据则可能达到每秒数百兆字节，CPU 逐字节搬运很快会成为瓶颈。下一篇将从“CPU 和设备怎样看见同一块内存”开始，依次建立 DMA 地址、映射所有权、DMAengine、IOMMU 和 dma-buf 的关系。

## 8. 参考资料

- Linux Kernel Documentation, [Real Time Clock (RTC) Drivers for Linux](https://docs.kernel.org/6.12/admin-guide/rtc.html)。
- Linux 6.12 source, [`include/linux/rtc.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/rtc.h?h=v6.12)、[`drivers/rtc/class.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/rtc/class.c?h=v6.12) 与 [`drivers/rtc/interface.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/rtc/interface.c?h=v6.12)。
- Linux Kernel Documentation, [NVMEM Subsystem](https://docs.kernel.org/6.12/driver-api/nvmem.html)。
- Linux 6.12 source, [`drivers/nvmem/core.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/nvmem/core.c?h=v6.12) 与 [`include/linux/nvmem-consumer.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/nvmem-consumer.h?h=v6.12)。
- Devicetree bindings, [NVMEM provider common schema](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/Documentation/devicetree/bindings/nvmem/nvmem.yaml?h=v6.12) 与 [AT24 EEPROM](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/Documentation/devicetree/bindings/eeprom/at24.yaml?h=v6.12)。
- EmbedFire, [Linux 内核 RTC 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_rtc_subsystem.html)，用于对照课程覆盖；本文的 API 和源码以 Linux 6.12 官方资料为准。
