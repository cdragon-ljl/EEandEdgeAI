---
title: "嵌入式知识体系 · 音视频开发实战 #05 · 点亮摄像头：sensor 驱动与设备树适配"
description: "以正点原子 RV1126 SDK 的设备树与 Rockchip IMX415 驱动为依据，讲清上电识别、媒体链路、模式配置和逐层调试。"
pubDate: "2026-08-13"
series: video-audio
order: 5
tags: ["Video & Audio", "Embedded Multimedia"]
draft: false
---

这一篇只讨论一个目标：让正点原子 RV1126 开发板上的 IMX415 从“设备树中有一个节点”，走到“驱动识别、媒体链路建立并能稳定出帧”。

本文的具体结论来自两份配套源码：

- `src/rv1126-alientek-800p.dts`
- `src/imx415.c`

当前源码里的关键事实是：IMX415 可挂在 `i2c1` 或 `i2c5`，I2C 地址均为 `0x1a`，使用 4 条 MIPI data lane，驱动把 `xvclk` 设置为 **37.125 MHz**，并从寄存器 `0x311A` 读取 1 字节芯片 ID `0xE0`。

> 源码是软件侧事实，原理图和传感器规格书是硬件侧事实。真正改板级配置时，三者必须一致；本文不会从所给文件中推断电源电压或其他未出现的硬件参数。

## 一、先看清实际链路

IMX415 有两类连接：I2C、时钟、电源和复位负责“控制与上电”，MIPI CSI-2 data lane 负责连续发送像素。

```mermaid
flowchart LR
    P[regulator / reset / xvclk] --> I[I2C probe<br>读取 0x311A]
    I --> S[写 global 与 mode 寄存器表]
    S --> D[IMX415 4-lane MIPI CSI-2]
    D --> R[D-PHY / CSI receiver]
    R --> C[RKCIF 或 ISP]
    C --> V["/dev/videoX"]
```

这份板级设备树给了两条不同的摄像头路径：

| 接口 | Sensor | 数据链路 |
|:---|:---|:---|
| CSI0 | `imx415@1a` under `i2c1` | `ucam_out0 → mipi_in_ucam0 → csidphy0_out → mipi_csi2_input → mipi_csi2_output → cif_mipi_in → cif_sditf → isp_virt1_in` |
| CSI1 | `imx415@1a` under `i2c5` | `ucam_out2 → csi_dphy1_input → csi_dphy1_output → isp_in` |

CSI0 经过 `mipi_csi2`、`rkcif_mipi_lvds` 和 `rkcif_mipi_lvds_sditf` 进入 `rkisp_vir0`；CSI1 则由 `csi_dphy1` 直接连接 `rkisp_vir1`。所以不能把两路都简化成同一条 `sensor → csi2 → rkcif → rkisp`。

## 二、Linux 里的对象如何对应

摄像头不是一个独立的 `/dev/video0` 驱动，而是一组协同对象：

- `imx415.c` 把 sensor 注册为 `v4l2_subdev`；
- D-PHY、CSI、RKCIF 和 ISP 驱动也注册自己的 media entity；
- Device Tree 的 `endpoint` 与 `remote-endpoint` 描述实体之间的连接；
- Media Controller 根据这些端点建立 graph；
- 最终由 RKCIF 或 ISP 暴露可采集的 `/dev/video*` 节点。

驱动用 `m%02d_%s_%s %s` 生成 sensor subdev 名称。两路 `camera-module-index` 分别为 `0`、`1`，`camera-module-facing` 都是 `front`，因此实体名通常包含 `m00_f_imx415` 或 `m01_f_imx415`，后面再跟 `1-001a` 或 `5-001a`。实际名称以 `media-ctl -p` 输出为准。

## 三、按源码读设备树

### 3.1 先定位真实文件

在 SDK 根目录执行：

```bash
cd ~/RV1126/atk-rv1126-sdk

find kernel/arch/arm/boot/dts -name 'rv1126-alientek-800p.dts'
grep -n 'imx415@1a' kernel/arch/arm/boot/dts/rv1126-alientek-800p.dts
grep -n 'IMX415_XVCLK\|IMX415_REG_CHIP_ID\|imx415_probe' \
    kernel/drivers/media/i2c/imx415.c
```

与本文配套的文件名就是 `rv1126-alientek-800p.dts`，不是假设存在的 `*-cam.dtsi`。如果 SDK 中的路径不同，先用 `find kernel -iname '*imx415*'` 定位，再以实际被构建的 DTS 为准。

还要确认运行中的板子确实加载了这份 DTB。只改对源码但烧入了旧 `boot.img`，板端现象不会改变。

### 3.2 CSI0：`i2c1` 上的 IMX415

源码中的第一路节点是：

```text
&i2c1 {
    status = "okay";
    clock-frequency = <400000>;

    imx415: imx415@1a {
        compatible = "sony,imx415";
        reg = <0x1a>;
        clocks = <&cru CLK_MIPICSI_OUT>;
        clock-names = "xvclk";
        power-domains = <&power RV1126_PD_VI>;
        pinctrl-names = "rockchip,camera_default";
        pinctrl-0 = <&mipicsi_clk0>;
        avdd-supply = <&vcc_avdd>;
        dovdd-supply = <&vcc_dovdd>;
        dvdd-supply = <&vcc_dvdd>;
        pwdn-gpios = <&gpio1 RK_PD4 GPIO_ACTIVE_HIGH>;
        reset-gpios = <&gpio4 RK_PA0 GPIO_ACTIVE_LOW>;
        rockchip,camera-module-index = <0>;
        rockchip,camera-module-facing = "front";
        rockchip,camera-module-name = "YT10092";
        rockchip,camera-module-lens-name =
            "IR0147-60IRC-8M-F20-hdr3";

        port {
            ucam_out0: endpoint {
                remote-endpoint = <&mipi_in_ucam0>;
                data-lanes = <1 2 3 4>;
            };
        };
    };
};
```

关键字段与驱动的对应关系如下：

| DTS 字段 | 驱动中的消费者 | 当前值 |
|:---|:---|:---|
| `compatible` | `imx415_of_match[]` | `sony,imx415` |
| `reg` | I2C core | `0x1a` |
| `clock-names` | `devm_clk_get(dev, "xvclk")` | `xvclk` |
| 三路 `*-supply` | `devm_regulator_bulk_get()` | `dvdd`、`dovdd`、`avdd` |
| `reset-gpios` | `devm_gpiod_get(dev, "reset", ...)` | GPIO4_A0，低有效 |
| 四个 module 字段 | `of_property_read_*()` | probe 的必需属性 |
| `data-lanes` | CSI endpoint | `<1 2 3 4>` |

四个 `rockchip,camera-module-*` 属性不是装饰。驱动把它们一起读取，只要缺一个就打印 `could not get module information!` 并返回 `-EINVAL`。

### 3.3 CSI1：`i2c5` 上的第二路 IMX415

第二路使用相同的电源与时钟资源，但 pinctrl、GPIO 和 endpoint 不同：

```text
imx415_csi1: imx415@1a {
    compatible = "sony,imx415";
    reg = <0x1a>;
    clocks = <&cru CLK_MIPICSI_OUT>;
    clock-names = "xvclk";
    pinctrl-names = "rockchip,camera_default";
    pinctrl-0 = <&mipicsi_clk1>;
    pwdn-gpios = <&gpio2 RK_PA7 GPIO_ACTIVE_HIGH>;
    reset-gpios = <&gpio4 RK_PA1 GPIO_ACTIVE_LOW>;
    rockchip,camera-module-index = <1>;
    rockchip,camera-module-facing = "front";
    rockchip,camera-module-name = "YT10092";
    rockchip,camera-module-lens-name =
        "IR0147-60IRC-8M-F20-hdr3";

    port {
        ucam_out2: endpoint {
            remote-endpoint = <&csi_dphy1_input>;
            data-lanes = <1 2 3 4>;
        };
    };
};
```

两颗 sensor 可以都使用 `0x1a`，因为它们位于不同的 I2C controller 上。排查时必须把“地址”写成“总线号 + 地址”，即 `1-001a` 或 `5-001a`。

这份板级文件没有在 `&i2c5` 段内显式写 `status = "okay"`，其最终状态取决于被 include 的 DTSI。使用第二路前应反编译实际 DTB，确认 `i2c5` 的有效 `status`，不能只看这一段源码就认定总线已经启用。

### 3.4 endpoint 必须按完整路径核对

CSI0 的互指关系为：

```text
ucam_out0        <-> mipi_in_ucam0
csidphy0_out     <-> mipi_csi2_input
mipi_csi2_output <-> cif_mipi_in
cif_sditf        <-> isp_virt1_in
```

CSI1 的互指关系为：

```text
ucam_out2        <-> csi_dphy1_input
csi_dphy1_output <-> isp_in
```

`remote-endpoint` 必须成对。对于声明了 `data-lanes` 的端点，当前文件统一写成 `<1 2 3 4>`。原文所说的“只核对三处 data-lanes”并不适用于这份设备树，因为 CSI0 链上不止三个 endpoint。

设备树中还为同一连接器保留了 IMX335、IMX415 等备选 sensor 节点，并使用相同 I2C 地址。最终产品配置必须确认实际焊接的 sensor、启用的驱动和 endpoint 选择一致，不能把备选节点理解成同一接口上可同时工作的设备。

### 3.5 DTS 与驱动之间有一处需要特别注意

DTS 写的是：

```text
pwdn-gpios = <...>;
```

但这份 `imx415.c` 获取的可选 GPIO 是：

```c
imx415->power_gpio = devm_gpiod_get(dev, "power", GPIOD_ASIS);
```

这个调用查找的是 `power-gpios`，不是 `pwdn-gpios`。所以当前 `pwdn-gpios` 不会被这份驱动作为 `power_gpio` 使用；probe 会打印 `Failed to get power-gpios` 警告，但不会仅因为该 GPIO 缺失而退出。硬件能否继续工作仍取决于模组 PWDN 的实际接法和默认电平，不能仅凭 probe 继续执行就判定这根脚不需要控制。

不要为了消除警告直接把属性改名。先对照原理图确认这根管脚究竟是模组电源使能还是 PWDN，再决定应改 DTS 还是驱动。

## 四、按源码读 IMX415 驱动

### 4.1 probe 的真实顺序

`imx415_probe()` 的核心流程是：

1. 读取四个 module 信息属性和可选的 `rockchip,camera-hdr-mode`；
2. 根据 HDR mode 从 `supported_modes[]` 选择第一个匹配模式；
3. 获取 `xvclk`、reset GPIO、可选 power GPIO、pinctrl 和三路 regulator；
4. 初始化 V4L2 controls 与 subdev；
5. 调用 `__imx415_power_on()`；
6. 调用 `imx415_check_sensor_id()`；
7. 初始化 media pad，并调用 `v4l2_async_register_subdev_sensor_common()`；
8. 启用 runtime PM。

函数名是 `imx415_check_sensor_id()`，不是 `imx415_check_chip_id()`。识别逻辑也不是泛化的“两字节 ID”：

```c
#define CHIP_ID            0xE0
#define IMX415_REG_CHIP_ID 0x311A

ret = imx415_read_reg(client, IMX415_REG_CHIP_ID,
                      IMX415_REG_VALUE_08BIT, &id);
if (id != CHIP_ID)
    return -ENODEV;
```

驱动开启 Thunder Boot 时会跳过 sensor ID 检查；看到 `Enable thunderboot mode, skip sensor id check`，不能再把“probe 成功”当成芯片 ID 已被实际读取的证据。

### 4.2 上电时序与 MCLK

这份驱动的实际 `__imx415_power_on()` 顺序是：

```text
选择 camera_default pinctrl
  -> regulator_bulk_enable(dvdd, dovdd, avdd)
  -> 可选 power GPIO 置有效
  -> 延时 10~20 ms
  -> reset GPIO 置逻辑 0
  -> 延时 10~20 ms
  -> xvclk 设置为 37.125 MHz 并使能
  -> 延时 20~30 ms
  -> 允许 I2C 访问
```

`reset-gpios` 在 DTS 中是 `GPIO_ACTIVE_LOW`。gpiod API 使用的是逻辑值，因此驱动写逻辑 0 表示“复位无效”，对应物理引脚拉高；关电时写逻辑 1，才是物理低电平复位。

驱动常量是：

```c
#define IMX415_XVCLK_FREQ_37M 37125000
```

所以这块板上应测到约 **37.125 MHz**，不是 24 MHz。代码注释给出的芯片最小间隔是 ns/us 量级，但实现为了模块加载场景留了更保守的 10~30 ms 延时。调试时应先验证这份实现，而不是套用另一版驱动的时序图。

### 4.3 支持模式与 link frequency

`supported_modes[]` 一共有 9 项：

| 输出尺寸 | RAW | HDR | 最大帧率 | V4L2 link frequency |
|:---|:---:|:---:|:---:|---:|
| 3864×2192 | 10 bit | Linear | 30 fps | 446 MHz |
| 3864×2192 | 10 bit | HDR X2 | 30 fps | 743 MHz |
| 3864×2192 | 10 bit | HDR X3 | 20 fps | 743 MHz |
| 3864×2192 | 10 bit | HDR X3 | 20 fps | 891 MHz |
| 3864×2192 | 12 bit | Linear | 30 fps | 446 MHz |
| 3864×2192 | 12 bit | HDR X2 | 30 fps | 891 MHz |
| 3864×2192 | 12 bit | HDR X3 | 20 fps | 891 MHz |
| 1944×1097 | 12 bit | Linear | 30 fps | 297 MHz |
| 1944×1097 | 12 bit | HDR X2 | 30 fps | 446 MHz |

驱动上报的 Bayer code 是 `MEDIA_BUS_FMT_SGBRG10_1X10` 或 `MEDIA_BUS_FMT_SGBRG12_1X12`，不是 SRGGB。

`link_freq_items[]` 为 297、446、743、891 MHz。寄存器表名字中的 `594M/891M/1485M/1782M` 表示 DDR lane 数据率，而 V4L2 link frequency 是它的一半。驱动按下面公式计算 pixel rate：

```text
pixel_rate = link_frequency × 2 × 4 lanes / bits_per_pixel
```

DTS endpoint 中没有 `link-frequencies` 属性；本驱动从当前 mode 的 `mipi_freq_idx` 建立 `V4L2_CID_LINK_FREQ`。因此不能在文章里凭空给 DTS 加一个固定的 891 MHz 属性。

`imx415_set_fmt()` 只选择最接近的模式并更新 `hblank`、`vblank`、link frequency 和 pixel rate；它不会立刻写完整寄存器表。真正写表发生在开始取流时。

### 4.4 曝光、增益与开始取流

Linear 模式下，曝光控制不是把曝光值直接写进寄存器，而是先计算：

```c
shr0 = imx415->cur_vts - ctrl->val;
```

再把 `shr0` 分别写入 `0x3050`、`0x3051`、`0x3052`。模拟增益写入 `0x3090`、`0x3091`。HDR X2/X3 的多帧曝光通过 Rockchip 私有 ioctl 处理。

开始取流时，`__imx415_start_stream()` 依次：

1. 写 `global_reg_list`；
2. 写当前 mode 的 `reg_list`；
3. 应用缓存的 V4L2 controls；
4. HDR 模式下应用初始多曝光参数；
5. 向 `0x3000` 写 `0x00`，进入 streaming。

停止取流则向 `0x3000` 写 `0x01`，进入 software standby。runtime PM 负责在首个用户开始取流时上电，在最后一个用户停止后释放电源。

## 五、从板端逐层验证

### 第 1 步：确认驱动实际 probe

```bash
dmesg | grep -i imx415
ls /sys/bus/i2c/drivers/imx415/
```

正常情况下，日志至少应出现类似信息：

```text
imx415 1-001a: driver version: 00.01.06
imx415 1-001a: Detected imx415 id 0000e0
```

第二路存在时还会看到 `5-001a`。如果 DTS 没有 `rockchip,camera-hdr-mode`，驱动会打印 `Get hdr mode failed! no hdr default`，随后默认选择 `NO_HDR`；这条警告本身不是 probe 失败。

按日志分层判断：

- 完全没有 IMX415 日志：检查正确 DTB 是否生效，以及驱动是否编入内核；
- `could not get module information!`：检查四个 module 属性；
- `Failed to get power regulators`：检查三路 supply phandle 与 regulator provider；
- `Unexpected sensor id`：检查 I2C、37.125 MHz MCLK、电源和 reset；
- `v4l2 async register subdev failed`：sensor 已识别，问题在 media graph 注册阶段。

### 第 2 步：正确理解 i2cdetect

先看 sysfs 中的绑定结果：

```bash
ls -l /sys/bus/i2c/drivers/imx415/
cat /sys/bus/i2c/devices/1-001a/name 2>/dev/null
cat /sys/bus/i2c/devices/5-001a/name 2>/dev/null
```

再扫描对应总线：

```bash
i2cdetect -y 1
i2cdetect -y 5
```

如果内核驱动已经占用地址，`i2cdetect` 通常显示 **`UU`**，而不是 `1a`。这表示地址已被内核驱动绑定，是正常现象。只有未绑定时，表格中才可能直接显示 `1a`。

不要在驱动仍绑定且可能取流时用 `i2ctransfer` 抢同一地址。确实需要独占读取芯片 ID 时，先停止所有摄像头应用，再执行：

```bash
echo 1-001a > /sys/bus/i2c/drivers/imx415/unbind
i2ctransfer -y 1 w2@0x1a 0x31 0x1a r1
echo 1-001a > /sys/bus/i2c/drivers/imx415/bind
```

预期读到 `0xe0`。第二路把 `1-001a` 和 `-y 1` 换成 `5-001a`、`-y 5`。即使中间命令失败，也要重新 bind，避免后续误判为驱动消失。

### 第 3 步：检查每一个 media graph

板上可能有多个 `/dev/media*`，不要默认只有 `/dev/media0`：

```bash
for dev in /dev/media*; do
    echo "===== $dev ====="
    media-ctl -d "$dev" -p
done

v4l2-ctl --list-devices
```

检查重点：

- sensor entity 名称包含正确的 `1-001a` 或 `5-001a`；
- CSI0 能沿 D-PHY、MIPI CSI2、RKCIF、sditf 到达 `rkisp_vir0`；
- CSI1 能沿 `csi_dphy1` 到达 `rkisp_vir1`；
- 相邻 entity 的 link 为 `ENABLED`；
- sensor source format 是 SGBRG10 或 SGBRG12；
- sensor 原生模式是 3864×2192 或 1944×1097，3840×2160、1920×1080 可以是驱动 selection/ISP 裁剪缩放后的尺寸，不能反推 sensor mode 表也是这个尺寸。

少 sensor entity 时回查 probe；sensor 存在但链路中断时，对照第 3.4 节逐对检查 `remote-endpoint`；链路完整但没有 video node 时，再查 RKCIF、ISP 和对应 MMU/保留内存配置。

### 第 4 步：选择正确 video node 抓帧

先列出节点，不要直接假设 `/dev/video0` 就是 NV12 ISP 输出：

```bash
v4l2-ctl --list-devices
v4l2-ctl -d /dev/videoX --list-formats-ext
```

选中实际 ISP mainpath 或目标采集节点后，再按它列出的格式抓帧。假设该节点确实支持 1920×1080 NV12：

```bash
VIDEO_NODE=/dev/videoX
v4l2-ctl -d "$VIDEO_NODE" \
    --set-fmt-video=width=1920,height=1080,pixelformat=NV12 \
    --stream-mmap --stream-count=30 --stream-to=frames.nv12
```

30 帧而不是 1 帧更容易暴露 CSI 错包、掉帧和 buffer 超时。文件大小在无额外 stride 的理想情况下应为：

```text
1920 × 1080 × 1.5 × 30 = 93,312,000 bytes
```

实际节点可能带 stride 或输出 RAW，必须以 `--list-formats-ext`、驱动格式和实际文件大小为准。查看 sensor controls 应对 `/dev/v4l-subdevX` 执行 `--list-ctrls`，不要默认曝光控制挂在某个 ISP `/dev/videoX` 上。

## 六、做一次不破坏取流的 DTS 实验

原文通过故意改错 data lane 或 I2C 地址再烧录来观察失败。这种实验会主动破坏摄像头链路，也容易在恢复旧 DTB 时留下新的变量。这里换成源码已经支持、且保持默认行为不变的验证。

当前 DTS 没有 `rockchip,camera-hdr-mode`。驱动读取失败后默认：

```c
hdr_mode = NO_HDR;
```

在正在使用的 IMX415 节点中显式加入：

```text
rockchip,camera-hdr-mode = <0>;
```

这仍然选择 Linear/NO_HDR，只会把“隐式默认”变成“显式配置”。完成后：

1. 执行 `./build.sh kernel`；
2. 从构建日志确认生成的是 `rv1126-alientek-800p.dtb`；
3. 用 `fdtdump` 或 `dtc -I dtb -O dts` 确认产物包含该属性；
4. 按当前 SDK 的打包和烧录流程更新实际承载 DTB 的镜像；
5. 重启后确认 `Get hdr mode failed! no hdr default` 消失；
6. 再抓 30 帧，确认分辨率、格式和稳定性不变。

这个实验同时验证了源码修改、DTC、镜像打包、烧录、启动加载和驱动解析六个环节，而不会故意制造 lane 错配。

## 七、排查清单

| 现象 | 源码对应 | 优先检查 |
|:---|:---|:---|
| 无 IMX415 probe 日志 | `imx415_of_match[]`、DTS 节点 | 当前 DTB、`compatible`、驱动配置 |
| module information 报错 | probe 中四个 `of_property_read_*` | module index/facing/name/lens-name |
| regulator 获取失败 | `imx415_configure_regulators()` | `dvdd/dovdd/avdd-supply` 与 provider |
| power GPIO 警告 | 驱动读取 `power-gpios`，DTS 写 `pwdn-gpios` | 结合原理图决定是否修 DTS/驱动 |
| sensor ID 为非 `0xE0` | `0x311A` 读 1 字节 | I2C 总线、37.125 MHz MCLK、reset、电源 |
| `i2cdetect` 显示 `UU` | I2C client 已绑定 | 正常，不要当成地址消失 |
| media graph 缺 link | DTS endpoint graph | 成对核对全部 `remote-endpoint` |
| 有 entity 但抓帧超时 | `s_stream()` 与接收链路 | 4 lane、一致的 format、CSI/RKCIF/ISP 日志 |
| RAW 格式或尺寸与预期不同 | `supported_modes[]` | SGBRG10/12、3864×2192 或 1944×1097 |
| 全黑但持续有帧 | 曝光/增益与 ISP/3A | sensor subdev controls、IQ 文件、镜头 |

## 八、动手练习

1. 在 DTS 中分别画出 CSI0 和 CSI1 的全部 endpoint 对。
2. 在板端确认 IMX415 实际绑定为 `1-001a`、`5-001a`，还是只有其中一路。
3. 从 `supported_modes[]` 找出当前 RAW bit depth、HDR mode、fps 和 link frequency。
4. 完成第六节的显式 NO_HDR 实验，并保留 DTB 反编译片段与 dmesg 前后对比。
5. 连续抓取 30 帧，记录节点、格式、尺寸、文件大小和内核错误计数。

## 里程碑

- [ ] 能解释为什么本板的 MCLK 是 37.125 MHz，而不是常见的 24 MHz
- [ ] 能说出芯片 ID 寄存器 `0x311A`、期望值 `0xE0` 和读取长度 1 字节
- [ ] 能分别画出 CSI0 经 RKCIF、CSI1 直达 ISP 的两条路径
- [ ] 能解释 `i2cdetect` 中 `UU` 的含义
- [ ] 能指出 `pwdn-gpios` 与驱动读取 `power-gpios` 的差异
- [ ] 能区分 sensor 原生 mode、selection crop 与 ISP 输出尺寸
- [ ] 能完成 DTS 修改、DTB 验证、烧录和 30 帧回归闭环

> 标签：sensor 驱动 · 设备树 · V4L2 subdev · Media Controller · MIPI CSI-2 · IMX415 · RV1126 · 上电时序
