---
title: "嵌入式知识体系 · Linux 驱动开发实战 #23 · 块设备、eMMC、SCSI、MTD、UBI 与存储栈"
description: "沿一次文件 I/O 经过页缓存、bio、request 与 blk-mq，再比较 MMC/eMMC、SCSI 命令模型和 raw flash 的 MTD、UBI、UBIFS 路径。"
pubDate: "2026-08-29"
series: linux-driver
order: 23
tags: ["Linux Driver", "Block Layer", "eMMC", "SCSI", "MTD", "UBI", "UBIFS"]
draft: false
---

上一篇的显示控制器持续从 framebuffer 读取像素，应用不需要知道每个像素最终经过哪条 AXI 总线。存储也建立了类似的分层：应用面对文件和目录，文件系统面对页缓存与逻辑块，块层组织 I/O，底层驱动才把请求变成 MMC 或 SCSI 等设备命令。

但嵌入式系统还有另一类介质不能直接套入这条模型。eMMC 内部有控制器和 FTL，对主机表现为可覆盖写的逻辑块设备；raw NAND 和 NOR 则把擦除块、磨损与坏块等物理限制暴露给软件。它们可能都焊在板上、都被称为“flash”，Linux 上层路径却从根部不同。

因此本章不按 eMMC、SCSI、NAND 逐项罗列，而是先回答一个组织全篇的问题：这块介质向 Linux 提供的是普通 block address space，还是 raw flash eraseblock？在块设备一侧，我们沿 VFS、page cache、`bio`、`request` 和 blk-mq 走到 MMC/eMMC 与 SCSI；在 raw flash 一侧，再从 MTD 走到 UBI/UBIFS。实验全程只读，不会格式化、擦除、attach 未知 MTD 分区或改写 eMMC boot area。

## 1. 块设备隐藏擦除细节，raw flash 暴露擦除语义

块设备向上提供按逻辑块地址读取和写入的空间。文件系统可以请求“把这些 4 KiB 页写到某个 sector 范围”，设备内部怎样把它落到磁介质、NAND page 或磨损均衡后的物理位置，不属于块层接口。硬盘、NVMe SSD、SD 卡和 eMMC 都能以这种方式出现。

raw flash 的基本操作不同。读取和编程发生在 page 或更小范围，但已经写成 0 的 bit 通常不能直接改回 1；重写前要擦除整个 eraseblock。NAND 还可能带有出厂坏块和使用中新增的坏块，需要 ECC、OOB 和坏块管理参与。把这些限制藏在一个伪装的 512-byte sector 写接口后面，并不会让限制消失。

```text
                    文件与目录
                       |
              +--------+---------+
              |                  |
        块文件系统           UBIFS
              |                  |
          block layer            UBI
         /           \            |
   MMC/eMMC       SCSI 路径       MTD
                                  |
                           raw NOR/NAND
```

这张图最重要的是分叉位置。UBIFS 工作在 UBI volume 上，不经过普通 block layer；ext4 等块文件系统工作在 block device 上，不直接管理 raw NAND 坏块。个别兼容层可以让 MTD 看起来像块设备，但它们不自动提供完整 FTL、掉电保护和磨损均衡。

## 2. 文件写入通常先到 page cache

应用执行 `write(fd, buf, len)` 时，VFS 根据 `struct file` 找到具体文件系统。普通 buffered I/O 会把用户数据复制到该文件的 page cache，并把相应 folio/page 标记为 dirty；系统随后由 writeback 路径把脏数据提交给文件系统和块层。`write()` 返回成功通常只表示数据已经被内核接受，不表示非易失介质已经完成编程。

文件在内存中的缓存由 inode 的 `struct address_space` 组织。文件系统负责把文件偏移映射为自身的逻辑块或 extent，并决定数据、inode、目录项和 journal/metadata 怎样保持一致。块层只看到最终要读写的设备范围，不理解“这几个块共同组成一个文件重命名事务”。

### 2.1 `fsync()` 把持久化要求向下传递

应用需要确认文件内容与相关元数据已经提交时，会调用 `fsync()` 或语义更窄的 `fdatasync()`。文件系统开始 writeback、提交必要 journal/metadata，并等待底层 I/O 完成；存储栈还可能发出 flush/FUA 一类操作，把易失写缓存推进到设备承诺的持久边界。

这仍不是“任何突然掉电都绝对不丢业务状态”的完整保证。设备是否诚实实现 flush、板级供电能否完成内部编程、多文件更新是否包含目录 `fsync()`，都影响最终结果。对驱动学习而言，先建立准确边界即可：`write()` 与 `fsync()` 不等价，page cache、文件系统和块设备各自承担一段职责。

直接 I/O 可以在满足对齐和文件系统能力时绕过大部分 page cache 数据路径，但它仍进入文件系统和块层，也仍受设备队列、DMA、完成与持久化语义约束。它不是跳过存储栈直接操作控制器。

## 3. bio 描述块范围，request 面向驱动调度

当块文件系统准备提交 I/O 时，核心数据对象是 `struct bio`。一个 bio 包含目标 block device、起始 sector、读写操作和若干 `bio_vec`，后者引用承载数据的内存页及 offset/length。bio 关注“哪一组内存页对应设备上的哪一段”。

块层可以合并相邻 I/O，并把一个或多个 bio 组织进 `struct request`。request 除了操作和范围，还携带 tag、超时、队列状态和驱动完成所需信息。底层块驱动通常不从 VFS 的 `struct file` 开始工作，而是在自己的 request queue 上接收已经组织好的 request。

```text
多个进程的文件 I/O
        |
文件系统生成 bio
        |
合并、plug、scheduler
        |
struct request
        |
blk-mq hardware queue
        |
底层驱动与设备队列
```

### 3.1 blk-mq 把提交压力分散到多队列

blk-mq 使用每 CPU/软件上下文的 `struct blk_mq_ctx` 接收提交，再映射到一个或多个 `struct blk_mq_hw_ctx`。hardware context 不一定是一条物理导线，它表示驱动能够独立派发请求的硬件队列上下文。支持多提交队列的 NVMe 能直接利用多 hctx，只有单队列的控制器也可以用 blk-mq 统一接口。

驱动通过 `struct blk_mq_ops` 提供 `queue_rq` 等回调。块层把带 tag 的 request 交给驱动后，驱动设置 DMA、描述符或协议命令并启动硬件；中断或轮询确认完成后，再调用块层完成 helper。队列暂时没有资源时可以返回 resource 状态，让 blk-mq 之后重试，而不是丢失 request。

bio 与 request 的区分很实用。bio 更接近一段块 I/O 及其内存页，request 更接近经过合并和排队后交给驱动的一次命令。一个 request 可以包含多个 bio，设备能力和队列限制又可能促使上层拆分过大的 I/O。

## 4. MMC 子系统把 eMMC 接到块层

eMMC 把 NAND、控制器、ECC、坏块替换和 FTL 封装在一个器件内，对主机提供 MMC 协议。Linux 中，SoC 的 MMC host controller 驱动注册 `struct mmc_host`，MMC core 探测总线上的 card 并建立 `struct mmc_card`，`drivers/mmc/core/block.c` 再把存储功能注册为 `/dev/mmcblkN` 块设备。

host controller 与 card 的一次协议事务用 `struct mmc_request` 组织，其中可包含 command、data 和 stop command。MMC block driver 从块层 request 形成读写命令，host 驱动再通过寄存器、DMA 和中断执行它。这里会用到上一篇的 DMA mapping，但上层文件系统看见的仍是普通 block device。

```text
blk-mq request
      |
  mmc block
      |
MMC core: mmc_request / mmc_command / mmc_data
      |
mmc_host driver
      |
SoC host controller === eMMC
```

### 4.1 eMMC 的“块设备”不表示介质没有 flash 特性

FTL 让主机能够覆盖写逻辑块，并在器件内部处理擦除、坏块与磨损均衡，所以 Linux 不对 eMMC 建立 UBI。可是写放大、寿命、内部缓存、discard/erase、可靠写和掉电行为仍由器件能力决定。块接口隐藏实现细节，不会消除物理限制。

eMMC 还可能暴露 user area、boot0/boot1、RPMB 等不同硬件区域。Linux 常把 boot partition 显示为 `/dev/mmcblkNboot0` 和 `boot1`，并默认强制只读以减少误改 bootloader 的风险；RPMB 具有认证计数器和专用协议，不是普通可格式化分区。本章实验只读取 sysfs 身份和只读状态，不改变 `force_ro`。

> **RV1126 差异：** RV1126 板上的 host controller 实例、`bus-width`、pinctrl、时钟、供电、采样相位和 eMMC timing mode 由实际原理图、DTS 与厂商 SDK 决定。本文不提供固定 `mmc0`/`mmc1` 对应关系，也不把某个 `mmcblkN` 编号当作 eMMC 身份。应通过 `/sys/bus/mmc/devices` 的 type/name、DTS 与启动日志交叉确认。

## 5. SCSI 是命令与设备模型，不是所有存储的共同底层

SCSI 不只表示传统并行 SCSI 电缆。Linux SCSI mid-layer 建立 host、target、logical unit 和 command 模型，许多不同传输会把块 I/O 转换为 SCSI command。`struct Scsi_Host` 表示 host adapter，`struct scsi_device` 表示某个 target/LUN，`struct scsi_cmnd` 携带 CDB、数据方向、scatterlist 和完成状态；low-level driver 通过 `struct scsi_host_template` 的 `queuecommand` 接收命令。

SATA 设备通常经 libata 转换并接入 SCSI mid-layer，USB Mass Storage/UAS 和 UFS 也使用 SCSI 命令模型。这样上层磁盘、光驱和通用错误处理可以共享大量逻辑，而 transport driver 仍负责真实总线协议。

eMMC 路径不是 SCSI。它从块层进入 MMC block 和 MMC core；NVMe 也有自己的命令与驱动栈。把 SCSI 称为“块层以下所有磁盘的统一协议”会掩盖这些平行路径。正确关系是：块层可以把 request 交给 MMC、SCSI、NVMe 或其他块驱动；其中 SCSI mid-layer 又服务多种 SCSI command transport。

### 5.1 一次 SCSI request 怎样完成

SCSI disk 驱动根据块 request 形成 READ/WRITE CDB 和 `scsi_cmnd`，mid-layer 选择设备队列并调用 low-level driver 的 `queuecommand`。host driver 把 CDB 和映射后的数据段交给硬件或 transport；完成后填写 result/sense 并通知 mid-layer。成功 request 返回块层，错误则可能进入重试、sense 解析或 error handling。

SCSI sense 提供比“读写失败”更具体的设备状态，例如 not ready、medium error 或 illegal request。块层超时和文件系统报错只是上层现象，定位 USB 磁盘、SATA 或 UFS 故障时，SCSI 日志中的 host/channel/id/lun、CDB 与 sense 是重要证据。

## 6. MTD 保留 raw flash 的真实操作

MTD（Memory Technology Device）面向 raw NOR/NAND 等介质。驱动注册 `struct mtd_info`，提供 `_read`、`_write`、`_erase` 等操作以及 `size`、`erasesize`、`writesize`、OOB 和 ECC 能力。用户空间常看到 `/dev/mtdN` 字符设备以及 `/sys/class/mtd/mtdN` 属性。

MTD 的 offset 是字节位置，但可执行操作受 erase/write 粒度约束。NOR 通常可以随机读取并具有较小 write unit；NAND 以 page 编程、eraseblock 擦除，并依赖 OOB 中的 ECC 或坏块信息。驱动和 NAND core 共同处理 controller、chip 与 ECC，应用不应把 OOB 当作普通附加文件空间。

### 6.1 坏块是 NAND 模型的一部分

raw NAND 可能在出厂时已经标记坏块，也可能随擦写增加新坏块。看到少量 factory bad block 不自动等于器件损坏；软件栈要识别并避开它们。反过来，固定使用“分区起点后的第 N 个物理 eraseblock”保存唯一配置，会在坏块出现时失去可迁移能力。

`mtdblock` 一类接口可以为某些用途提供块式访问外观，但它没有凭空增加完整 FTL。特别是可写 raw NAND 文件系统，仍要选择理解 eraseblock、坏块与磨损的上层，而不是直接放一个为磁盘 block device 设计的文件系统。

## 7. UBI 管理 eraseblock，UBIFS 管理文件

UBI 位于 MTD 之上。它把可用 physical eraseblock（PEB）映射为 logical eraseblock（LEB），避开坏块、进行 wear leveling，并提供可调整的 volume。UBIFS 挂载 UBI volume，在 LEB 语义上组织目录、文件、索引和 journal。

```text
raw NAND
   |
MTD partition
   |
UBI: PEB <-> LEB、坏块、磨损、volume
   |
UBI volume
   |
UBIFS
   |
文件与目录
```

UBI 不是普通 block translation layer，UBIFS 也不是挂在 `/dev/mtdN` 上的 ext4。常见挂载源写作 `ubi0:rootfs` 或 `ubi0_0`。UBI 负责介质级映射与 volume，UBIFS 负责文件系统一致性；应用仍要通过 `fsync()`、rename、版本和校验定义自己的业务提交。

并非所有 raw flash 都要使用 UBI/UBIFS。较小只读 NOR 分区可能直接保存 bootloader、环境、固件或只读文件系统；启动 ROM 和 bootloader 还可能要求固定 offset、冗余与 ECC 格式。是否使用 UBI，取决于介质、可写需求、启动链和产品升级设计。

## 8. 用只读脚本画出本机存储分层

下面的 `storage_map.sh` 只读取 mount、block、MMC、SCSI、MTD 和 UBI 信息。它不会对任何设备执行 `mkfs`、`dd of=`、`ubiformat`、`ubiattach` 或写保护修改。

```sh
#!/bin/sh
set -eu

echo "== mounts =="
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS

echo
echo "== block devices =="
lsblk -o NAME,TYPE,SIZE,RO,RM,FSTYPE,MOUNTPOINTS,MODEL

echo
echo "== block queues =="
find /sys/class/block -mindepth 1 -maxdepth 1 -type l -print |
while IFS= read -r dev; do
	name=$(basename "$dev")
	[ -r "$dev/queue/logical_block_size" ] || continue
	printf '%s logical=%s physical=%s scheduler=%s\n' \
		"$name" \
		"$(cat "$dev/queue/logical_block_size")" \
		"$(cat "$dev/queue/physical_block_size")" \
		"$(cat "$dev/queue/scheduler" 2>/dev/null || echo n/a)"
done

echo
echo "== MMC cards =="
find /sys/bus/mmc/devices -mindepth 1 -maxdepth 1 -type l -print 2>/dev/null |
while IFS= read -r card; do
	echo "-- $(basename "$card") --"
	for attr in type name manfid oemid serial date fwrev hwrev; do
		[ -r "$card/$attr" ] &&
			printf '%-8s %s\n' "$attr" "$(cat "$card/$attr")"
	done
done

echo
echo "== SCSI devices =="
find /sys/class/scsi_device -mindepth 1 -maxdepth 1 -type l -print 2>/dev/null |
while IFS= read -r sdev; do
	echo "$(basename "$sdev") -> $(readlink -f "$sdev/device")"
done

echo
echo "== MTD =="
cat /proc/mtd 2>/dev/null || echo "no /proc/mtd"
find /sys/class/mtd -mindepth 1 -maxdepth 1 -type l -name 'mtd[0-9]*' -print 2>/dev/null |
while IFS= read -r mtd; do
	printf '%s name=%s size=%s erase=%s write=%s\n' \
		"$(basename "$mtd")" \
		"$(cat "$mtd/name")" \
		"$(cat "$mtd/size")" \
		"$(cat "$mtd/erasesize")" \
		"$(cat "$mtd/writesize")"
done

echo
echo "== UBI =="
find /sys/class/ubi -mindepth 1 -maxdepth 1 -type l -print 2>/dev/null |
while IFS= read -r ubi; do
	echo "-- $(basename "$ubi") --"
	for attr in mtd_num total_eraseblocks avail_eraseblocks \
		    eraseblock_size name type data_bytes; do
		[ -r "$ubi/$attr" ] &&
			printf '%-20s %s\n' "$attr" "$(cat "$ubi/$attr")"
	done
done
```

运行并保存结果：

```sh
chmod +x storage_map.sh
./storage_map.sh | tee storage-map.txt
```

先从 `findmnt` 选择一个挂载点。若 source 是 `/dev/mmcblk...`，沿 sysfs 找到对应 MMC card 和 host；这条路径属于 block → MMC。若 source 是 `/dev/sd...`，再看 `/sys/class/scsi_device` 与设备链，可能进入 USB Mass Storage、UAS、SATA/libata 或其他 SCSI transport。若 fstype 是 `ubifs` 且 source 类似 `ubiN:name`，则沿 UBI volume、UBI device 和 `mtd_num` 回到 MTD。

### 8.1 用队列统计观察一次安全读取

选一个已经挂载的块文件系统和其中一个普通文件，不读取裸设备。先找出 mount source 和顶层 block device，再比较读取前后的统计：

```sh
FILE=/bin/sh
SOURCE=$(findmnt -no SOURCE --target "$FILE")
echo "file=$FILE source=$SOURCE"

lsblk -s -o NAME,TYPE,PKNAME "$SOURCE" 2>/dev/null || true
dd if="$FILE" of=/dev/null bs=4096 count=1 status=none
```

若 source 是 device-mapper、overlay 或网络文件系统，`lsblk` 可能无法直接给出物理设备，这本身说明 VFS 下方还有一层映射。一次普通读取也可能完全命中 page cache，所以不能从“磁盘统计没有变化”推断块层未工作；它只表示本次读取没有产生可观察的底层 I/O。为了制造统计变化而清空全局 page cache 会影响整机，不属于本章实验。

对 MTD/UBI 也保持只读。`/proc/mtd` 的编号与名称要同 DTS、烧录布局和启动参数比对；没有明确用途前，不执行 attach、erase 或 format。UBI 已经 attach 时，sysfs 的 `mtd_num`、eraseblock 数和 volume 属性足以建立层次关系。

## 9. 根据对象和日志定位存储问题

文件读取返回 `EIO` 时，先保存文件系统和内核日志，再沿当前路径向下定位。块设备路径关注 filesystem error、bio/request 完成、blk-mq timeout，以及 MMC command/CRC、SCSI sense 或控制器 reset；raw flash 路径关注 ECC、bitflip、bad block、UBI attach/volume 与 UBIFS journal/recovery。

几个现象尤其需要分层解释。`/dev/mmcblk0` 出现说明 card 已注册为块设备，不证明高负载 timing 和掉电行为可靠；`/dev/sda` 只说明 SCSI disk 注册成功，不说明它物理上是 SATA 还是 USB；`/dev/mtd0` 出现说明 raw flash 范围被 MTD 暴露，不代表它适合挂 ext4；UBIFS 能重新挂载也不自动保证应用最后一次没有 `fsync()` 的配置已经提交。

先识别 block 还是 raw flash，再识别具体 transport 与文件系统，错误日志才会落在正确层次。

## 10. 存储路径把我们带到 USB

本章从文件走到两类介质。块设备一侧，page cache 和文件系统产生 bio，块层形成 request 并通过 blk-mq 交给 MMC 或 SCSI 等驱动；eMMC 使用 MMC core，不经过 SCSI。raw flash 一侧，MTD 保留 eraseblock、ECC 和坏块语义，UBI 管理 PEB/LEB 与 volume，UBIFS 再提供文件接口。

实验中若看到 `/dev/sdX` 的设备链经过 USB，就已经遇到了下一篇的入口。USB 存储只是 USB 子系统上的一种 class，枚举时还要经过 host controller、root hub、device、configuration、interface 和 endpoint。下一篇将建立这张 USB 对象地图，再把 Mass Storage 看成其中一个会继续接入 SCSI/块层的具体接口，而不是把 USB 等同于 U 盘。

## 11. 参考资料

- Linux Kernel Documentation, [Multi-Queue Block IO Queueing Mechanism (blk-mq)](https://docs.kernel.org/6.12/block/blk-mq.html)。
- Linux 6.12 source, [`include/linux/blk_types.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/blk_types.h?h=v6.12)、[`include/linux/blk-mq.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/blk-mq.h?h=v6.12) 与 [`block/blk-mq.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/block/blk-mq.c?h=v6.12)。
- Linux Kernel Documentation, [MMC/SD/SDIO card support](https://docs.kernel.org/6.12/driver-api/mmc/index.html) 与 [SD and MMC Device Partitions](https://docs.kernel.org/6.12/driver-api/mmc/mmc-dev-parts.html)。
- Linux 6.12 source, [`drivers/mmc/core/block.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/mmc/core/block.c?h=v6.12) 与 [`include/linux/mmc/core.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/mmc/core.h?h=v6.12)。
- Linux Kernel Documentation, [SCSI subsystem](https://docs.kernel.org/6.12/scsi/index.html) 与 [SCSI mid_level - lower_level driver interface](https://docs.kernel.org/6.12/scsi/scsi_mid_low_api.html)。
- Linux 6.12 source, [`include/scsi/scsi_cmnd.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/scsi/scsi_cmnd.h?h=v6.12)。
- Linux Kernel Documentation, [MTD NAND Driver Programming Interface](https://docs.kernel.org/6.12/driver-api/mtdnand.html) 与 [UBI File System](https://docs.kernel.org/6.12/filesystems/ubifs.html)。
- Linux 6.12 source, [`include/linux/mtd/mtd.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/mtd/mtd.h?h=v6.12) 与 [`drivers/mtd/ubi`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/mtd/ubi?h=v6.12)。
- EmbedFire, [Linux 内核块设备](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_block_device.html) 与 [Linux 内核 SCSI 子系统](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_scsi_subsystem.html)，用于对照课程覆盖；本文的内核对象和路径以 Linux 6.12 官方资料为准。
