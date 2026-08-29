---
title: "嵌入式知识体系 · Linux 驱动开发实战 #22 · Framebuffer、DRM/KMS 与 Linux 显示框架演进"
description: "从显示控制器持续 scanout 一块像素内存出发，理解 fbdev 的旧接口，以及 DRM 中 device、plane、CRTC、encoder、connector、GEM 和 atomic KMS 的协作。"
pubDate: "2026-08-29"
series: linux-driver
order: 22
tags: ["Linux Driver", "Framebuffer", "DRM", "KMS", "GEM"]
draft: false
---

上一篇把一块大缓冲区交给设备：CPU 使用虚拟地址，设备使用 DMA 地址，映射和同步决定谁能在什么时候访问内容。显示控制器正是一个持续读取缓冲区的设备。只要屏幕处于点亮状态，它就按照像素时钟一行接一行地取走像素，经过输出接口送到面板或显示器。这个过程称为 scanout。

如果显示问题只被理解成“申请一块显存然后写颜色”，很快就会遇到解释不了的现象：同一颗 SoC 可以连接 HDMI 和 MIPI DSI，图层可以缩放、叠加，显示模式可以切换，用户空间还希望在垂直消隐时无撕裂地换帧。一块内存无法单独表达这些拓扑和状态。

早期 framebuffer device，也就是常说的 fbdev，把主要注意力放在“用户怎样得到一块可写的像素表面”。DRM/KMS 则进一步描述缓冲区、图层、时序发生器、输出路径和显示端点，并用 atomic state 让多个对象作为一次更新被检查和提交。本章只沿一条显示 pipeline 解释这次演进，不展开摄像头采集或 V4L2；图像如何产生属于音视频专题，图像怎样被扫描到屏幕才是这里的问题。

## 1. scanout 需要像素、步幅和时序同时成立

设想一块 800×480 的 RGB565 屏幕。每个像素占 2 字节，一行可见像素至少需要 1600 字节。但硬件可能要求每行按 64 字节对齐，于是实际 pitch（也常称 stride）会大于可见宽度乘以每像素字节数。显示控制器取下一行时按 pitch 前进，而不是简单紧跟最后一个可见像素。

像素之外还有显示时序。一个 mode 包含可见宽高、像素时钟，以及水平和垂直方向的前肩、同步脉冲、后肩。scanout 引擎必须按这些参数产生稳定行帧节奏，输出接口再把像素和同步信息编码为 RGB、LVDS、HDMI、MIPI DSI 等物理协议。面板还可能依赖电源、复位、背光和初始化命令。

```text
像素缓冲区 --plane--> scanout/CRTC --encoder/bridge--> connector/panel
                    像素格式与位置       时序与路由          物理连接
```

任何一部分错误都可能表现为“屏不亮”。缓冲区地址错误可能触发 IOMMU fault，pitch 错误会让画面倾斜，mode 错误会使显示器拒绝同步，输出 bridge 或 panel 供电未完成则可能完全没有信号。显示框架的意义，就是让这些不同职责有各自对象，而不是都塞进一个 framebuffer 地址。

## 2. fbdev 把显示先抽象为可读写的像素表面

fbdev 驱动向 framebuffer core 注册 `struct fb_info`。这个对象保存固定能力 `struct fb_fix_screeninfo`、当前可变模式 `struct fb_var_screeninfo`、像素内存映射和一组 `struct fb_ops`。用户空间通常通过 `/dev/fb0` 打开它，使用 ioctl 查询参数，再用 `mmap()` 映射像素内存。

`fb_fix_screeninfo` 中的 `line_length` 是每行实际字节数，`smem_len` 是 framebuffer memory 长度，`visual` 描述颜色组织方式；`fb_var_screeninfo` 中的 `xres`、`yres`、`bits_per_pixel` 和颜色通道 bitfield 描述当前像素布局。应用绘图时至少要遵守这些返回值，不能从屏幕型号推测内存格式。

### 2.1 fbdev 的直观优势也是它的表达限制

对单屏、单图层的系统，fbdev 很容易理解：有一个设备节点和一块像素表面，改动表面即可影响显示。它适合早期控制台、小型 LCD 和许多兼容程序。但 HDMI 热插拔、一个 CRTC 连接不同输出、多个 plane 叠加以及无撕裂 page flip，都需要比“当前 framebuffer”更丰富的对象关系。

还要注意，系统出现 `/dev/fb0` 不等于底层一定是传统 fbdev 驱动。现代 DRM 驱动常通过 fbdev emulation 为内核控制台和旧应用提供兼容节点。判断实际驱动时应同时查看 `/dev/dri/cardN`、sysfs driver 链接和启动日志。

## 3. DRM/KMS 用对象描述一条显示 pipeline

DRM 最初服务于图形设备资源管理，KMS（Kernel Mode Setting）负责在内核中管理显示模式和 scanout。一个 KMS 驱动注册 `struct drm_device`，用户空间通常从 `/dev/dri/cardN` 访问它。render node 面向不需要 modeset 权限的渲染工作；本章关注的是能够查询和配置 KMS 对象的 card node。

对一条最小 pipeline，可以按像素流动方向认识五类对象：

- `drm_framebuffer` 描述像素格式、宽高、pitch、offset，以及像素来自哪些 buffer object；
- `drm_plane` 取得 framebuffer，定义源裁剪、目标位置、缩放、旋转和叠加关系；
- `drm_crtc` 表示一条 scanout pipeline 的时序发生与合成终点；
- `drm_encoder` 表示 CRTC 输出到具体链路之前的编码或路由能力；
- `drm_connector` 表示用户可见的显示端点，例如 HDMI 接口、eDP 接口或固定面板。

`struct drm_device` 不是上面对象中的“第六段硬件”，而是整个 DRM 驱动实例和对象集合的根。一个设备可以有多个 CRTC、plane、encoder 和 connector；`possible_crtcs`、attach 关系和 atomic check 共同约束哪些组合能工作。

### 3.1 plane 不只是 overlay

KMS 中 primary、overlay 和 cursor 都是 plane。primary plane 通常承载铺满屏幕的主画面，overlay plane 可承载视频或其他图层，cursor plane 针对光标做优化。它们都从 `drm_framebuffer` 取像素，并连接到某个 CRTC。

plane state 同时包含源矩形和目标矩形。源坐标常使用 16.16 fixed-point，以表达裁剪；目标坐标是 CRTC 可见区域中的位置。缩放比、像素格式、modifier、旋转和带宽是否受支持，由驱动在 atomic check 中验证。把图层称为“一个内存地址”会遗漏这些约束。

### 3.2 CRTC、encoder 和 connector 回答不同问题

CRTC 这个名字来自历史上的 CRT controller，但现代 KMS 中它表示完整显示 pipe 的时序和 scanout。一个 CRTC 在某一时刻使用一个 mode，并接收一个或多个 plane。

encoder 关心从 CRTC 到输出链路的转换和可路由关系。某些 SoC 驱动还会使用 DRM bridge chain，把协议转换芯片、PHY bridge 等逐段连接起来。connector 则代表信号最终到达的显示端点，负责连接状态、可用 mode、EDID 和用户可见属性。固定内嵌面板不会物理热插拔，仍可以用 connector/panel 对象表达它是显示链路的终点。

在简单 SoC 上，硬件模块与 DRM 对象可能近似一一对应；复杂硬件并不总是如此。KMS 对象首先是用户空间能够理解和组合的显示抽象，不要求每个对象都对应一块独立寄存器。

## 4. GEM 管理 buffer object，framebuffer 解释像素

上一篇已经知道 DMA buffer 需要 allocation、mapping 和生命周期。DRM 的 GEM（Graphics Execution Manager）为驱动提供 buffer object 管理框架。`struct drm_gem_object` 代表一块由 DRM 管理的存储对象，驱动可以使用 shmem、DMA helper 或自己的显存后端实现它。

GEM object 本身不等于能 scanout 的图像。KMS 还要创建 `struct drm_framebuffer`，说明 width、height、fourcc format、modifier、每个 plane 的 pitch/offset，并引用一个或多个 GEM object。例如 RGB framebuffer 通常只用一个内存 plane，NV12 可能有亮度和色度 plane，它们可以位于同一或不同对象中。

```text
GEM object：这块存储由谁拥有、怎样映射和释放
DRM framebuffer：这些字节按什么像素格式、pitch 和 offset 解释
KMS plane：把 framebuffer 的哪一部分放到 CRTC 的什么位置
```

从其他子系统传来的 dma-buf 可以被 DRM importer 附加、映射并包装为 GEM object，随后创建 framebuffer 参与 scanout。反方向上，DRM GEM object 也可导出为 dma-buf。共享并不消除格式约束：两个设备都能访问同一 backing storage，只说明地址和同步可建立，不表示它们支持相同 fourcc、modifier、pitch 或压缩布局。

## 5. KMS mode setting 把对象连接成可工作的状态

一次 modeset 至少要选择 connector、可驱动它的 encoder、CRTC、mode、primary plane 和 framebuffer。旧式 KMS ioctl 可以逐个修改对象，更新中间态可能暂时不一致。Atomic KMS 把计划中的 `drm_plane_state`、`drm_crtc_state` 和 `drm_connector_state` 收集到一个 `struct drm_atomic_state` 中。

atomic 更新先 check，后 commit。check 阶段验证格式、路由、带宽、时钟、缩放和共享资源，只修改新 state，不提前写硬件；如果任何对象组合不成立，整个请求可以在不改变当前显示的情况下失败。commit 阶段才把已经通过验证的状态应用到硬件。

```text
用户空间提出一组属性变化
          |
   组装 drm_atomic_state
          |
 atomic_check：只验证新状态
      | success
 atomic_commit：按顺序更新硬件
          |
      新画面生效
```

这并不意味着 commit 像数据库事务一样能把任何硬件动作任意回滚。Atomic KMS 的关键保证是失败的 check 不触碰持久硬件状态，驱动把可能失败的资源验证放在 check 阶段，并在 commit 中按 helper 规定的时序完成关闭、配置和启用。

### 5.1 page flip 与 vblank 让换帧发生在合适时刻

如果显示控制器正在一行行读取 framebuffer，CPU 在中途把 scanout 地址换成下一帧，屏幕上半部和下半部可能来自不同帧，形成 tearing。KMS page flip 可以把新的 framebuffer 安排到下一个垂直消隐边界生效，并用 event 或 fence 通知用户空间旧缓冲区何时不再用于当前 scanout。

这也是 buffer 生命周期不能只看“ioctl 已返回”的原因。nonblocking atomic commit 返回时，硬件更新可能仍在排队；旧 GEM/dma-buf 要等相应完成语义后才能复用。KMS 的 vblank/event 与上一篇的 dma-fence 都在回答“何时可以进入下一次所有权阶段”，但它们处在不同接口层。

## 6. 驱动怎样把硬件注册为 KMS 对象

一个显示驱动通常先初始化 `drm_device` 的 mode configuration，再创建 plane、CRTC、encoder/bridge 和 connector/panel，声明支持的格式、modifier 与路由，最后注册设备。Linux 提供 atomic helpers、bridge/panel helpers、GEM DMA helpers 和 `drm_simple_display_pipe` 等工具，简单硬件无需从零实现每个对象的通用状态机。

以 plane 为例，驱动通过 `drm_universal_plane_init()` 注册对象与支持格式，在 `drm_plane_helper_funcs.atomic_check` 验证源/目标矩形及硬件限制，在 `atomic_update` 中把已经检查过的 framebuffer 地址、pitch 和位置写入寄存器。CRTC helper 处理 mode timing 与 enable/disable，bridge/encoder helper 处理输出链路，connector helper 则获取 mode 并检测连接。

对象创建顺序只是初始化的一部分。真正让 pipeline 工作的是 atomic state 中的引用关系：哪个 framebuffer 绑定哪个 plane，plane 指向哪个 CRTC，connector 选择哪个 CRTC，以及 CRTC 采用哪个 mode。阅读源码时先画这条对象链，再进入寄存器代码，比从某个 `writel()` 反推整套显示拓扑容易得多。

> **RV1126 差异：** RV1126 厂商 SDK 常见 Rockchip 显示控制器、输出接口、bridge/panel 和 IOMMU 组合，但实际 VOP 版本、可用 plane、接口路由、像素格式、时钟及设备树属性都由具体 SDK 和板卡决定。本章不声明某个 connector 名称、CRTC id 或 mode 是 RV1126 固定值。厂商内核的 Rockchip DRM 私有属性也不能作为 Linux 6.12 通用 KMS 属性介绍。

## 7. 先从 sysfs 画出当前显示端点

下面的 `drm_pipeline_probe.sh` 不修改显示状态。它列出 card 的驱动、每个 connector 的连接状态、可用 mode 和当前 sysfs 属性：

```sh
#!/bin/sh
set -eu

found=0
for card in /sys/class/drm/card[0-9]*; do
	[ -d "$card" ] || continue
	found=1
	echo "== $(basename "$card") =="
	printf 'driver: '
	readlink -f "$card/device/driver" 2>/dev/null || echo unavailable
	printf 'device: '
	readlink -f "$card/device" 2>/dev/null || echo unavailable

	for conn in "$card"-*; do
		[ -d "$conn" ] || continue
		echo "-- $(basename "$conn") --"
		for attr in status enabled dpms; do
			[ -r "$conn/$attr" ] &&
				printf '%-8s %s\n' "$attr" "$(cat "$conn/$attr")"
		done
		if [ -r "$conn/modes" ]; then
			echo "modes:"
			sed 's/^/  /' "$conn/modes"
		fi
	done
done

[ "$found" -eq 1 ] || {
	echo "no DRM card found"
	exit 1
}
```

运行后，`connected` 表示 connector 当前检测到显示端点，`modes` 列出从 EDID、panel 或驱动取得的模式。没有 `modes` 可能来自断开状态、mode 获取失败或固定面板尚未完成 probe。sysfs 看不到 plane 和完整路由，所以它是端点地图，不是全部 KMS state。

若系统安装了 libdrm 的 `modetest`，可以继续做只读枚举：

```sh
modetest -c
modetest -e
modetest -p
```

多 DRM 驱动系统可用 `modetest -M <driver> -c` 指定驱动，`<driver>` 来自前面 sysfs driver 链接或 `modetest -M help` 的实际支持。输出会给对象 id、connector、encoder、CRTC、plane、format 和 property。对象 id 只在本次 DRM 设备生命周期中用于 ioctl 引用，不应写进设备树或应用永久配置。

### 7.1 atomic state 把当前连接关系展开

debugfs 已挂载且内核启用 DRM debugfs 时，可以读取当前 state：

```sh
find /sys/kernel/debug/dri -mindepth 2 -maxdepth 2 -name state -type f 2>/dev/null |
while IFS= read -r state; do
	echo "== $state =="
	sudo cat "$state"
done
```

在输出中选一个 active CRTC，找出引用它的 connector 和 plane，再记录 primary plane 的 `fb`、`crtc-pos`、`src-pos` 与 `src-size`。不同内核和驱动的 debugfs 文本会有差异，它适合调试而不是稳定应用 ABI。找不到 `state` 时，仍可以用 `modetest` 的对象和 property 输出建立静态能力图。

本实验不执行 `modetest -s` 或 atomic commit，因为 connector/CRTC id、mode 和像素格式都与当前设备有关，错误 modeset 可能暂时关闭正在使用的控制台。等已经从只读输出确认一条空闲 pipeline，并具备串口恢复通道后，再按 libdrm 工具文档进行受控 modeset。

## 8. 用 ioctl 读取 fbdev 的旧视图

如果系统提供 `/dev/fb0`，下面的程序只读取 fixed/variable screen info，不映射也不改写像素：

```c
// fb_probe.c
#include <errno.h>
#include <fcntl.h>
#include <linux/fb.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

int main(int argc, char **argv)
{
	const char *path = argc > 1 ? argv[1] : "/dev/fb0";
	struct fb_fix_screeninfo fix;
	struct fb_var_screeninfo var;
	int fd;

	fd = open(path, O_RDONLY);
	if (fd < 0) {
		fprintf(stderr, "open %s: %s\n", path, strerror(errno));
		return 1;
	}
	if (ioctl(fd, FBIOGET_FSCREENINFO, &fix) < 0 ||
	    ioctl(fd, FBIOGET_VSCREENINFO, &var) < 0) {
		fprintf(stderr, "fb ioctl: %s\n", strerror(errno));
		close(fd);
		return 1;
	}

	printf("id=%s\n", fix.id);
	printf("visible=%ux%u virtual=%ux%u bpp=%u\n",
	       var.xres, var.yres, var.xres_virtual, var.yres_virtual,
	       var.bits_per_pixel);
	printf("line_length=%u smem_len=%u type=%u visual=%u\n",
	       fix.line_length, fix.smem_len, fix.type, fix.visual);
	printf("red=%u/%u green=%u/%u blue=%u/%u transp=%u/%u\n",
	       var.red.offset, var.red.length,
	       var.green.offset, var.green.length,
	       var.blue.offset, var.blue.length,
	       var.transp.offset, var.transp.length);
	close(fd);
	return 0;
}
```

编译并运行：

```sh
${CC:-cc} -Wall -Wextra -O2 -o fb_probe fb_probe.c
./fb_probe /dev/fb0
```

`line_length` 若大于 `xres * bits_per_pixel / 8`，多出的部分就是每行 padding 或硬件布局带来的步幅差异。`xres_virtual/yres_virtual` 大于可见分辨率时，fbdev 可能提供虚拟画布或双缓冲空间。然后把 `fix.id`、sysfs driver 和 `/dev/dri` 状态对照，判断该节点来自原生 fbdev 还是 DRM fbdev emulation。

## 9. 从现象回到对应对象

屏幕完全没有 connector/mode 时，先查输出端点 probe、EDID/panel、bridge 和设备树连接；connector 已 connected、mode 也正确但 CRTC inactive 时，查 modeset 请求和 atomic check；CRTC active 却画面错位时，查 plane 的 format、pitch、source/destination rectangle 和 framebuffer；出现 IOMMU fault 时，再回到 GEM backing storage 与 scanout DMA mapping。

这种定位方式避免把所有黑屏都归结为“framebuffer 地址错了”。fbdev 提供的 fixed/variable info 适合解释旧接口看到的表面，DRM debugfs 和 modetest 则展示对象与 property。二者可能同时存在，因为兼容接口可以建立在现代 DRM 驱动之上。

## 10. 显示之后为什么自然进入存储

一条显示 pipeline 会在每个刷新周期持续读取 framebuffer；它关心像素格式、scanout 时序和换帧同步。另一个同样长期搬运大块内存的子系统是存储，但数据方向和组织方式不同：应用读写文件，页缓存聚合数据，块层把范围组成 I/O 请求，再由 eMMC、SCSI 设备或其他控制器完成传输。

下一篇将沿这条写入路径前进，同时回答一个嵌入式系统中特别重要的问题：eMMC 这样的块设备为什么可以被文件系统按扇区更新，而 raw NAND/NOR 为什么要面对 eraseblock、坏块、UBI 和 UBIFS。理解这条分界，才能避免把 `/dev/mtdX` 当成另一块普通磁盘。

## 11. 参考资料

- Linux Kernel Documentation, [The Frame Buffer Device API](https://docs.kernel.org/6.12/fb/api.html)。
- Linux Kernel Documentation, [Kernel Mode Setting (KMS)](https://docs.kernel.org/6.12/gpu/drm-kms.html) 与 [Mode Setting Helper Functions](https://docs.kernel.org/6.12/gpu/drm-kms-helpers.html)。
- Linux Kernel Documentation, [DRM Memory Management](https://docs.kernel.org/6.12/gpu/drm-mm.html)。
- Linux 6.12 source, [`include/drm/drm_device.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/drm/drm_device.h?h=v6.12)、[`drm_crtc.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/drm/drm_crtc.h?h=v6.12)、[`drm_plane.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/drm/drm_plane.h?h=v6.12)、[`drm_connector.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/drm/drm_connector.h?h=v6.12) 与 [`drm_gem.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/drm/drm_gem.h?h=v6.12)。
- EmbedFire, [Linux 内核帧缓冲](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_frame_buffer.html) 与 [Linux 内核 DRM](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_drm.html)，用于对照课程主题；本文的对象和 API 以 Linux 6.12 官方资料为准。
