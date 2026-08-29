---
title: "嵌入式知识体系 · Linux 驱动开发实战 #21 · 内核内存、DMA、DMAengine、IOMMU 与 dma-buf"
description: "从 CPU 与设备看到的地址差异出发，依次理解 DMA mask、coherent/streaming 映射、所有权同步、SG、DMAengine、IOVA/IOMMU 与 dma-buf。"
pubDate: "2026-08-29"
series: linux-driver
order: 21
tags: ["Linux Driver", "DMA", "DMAengine", "IOMMU", "dma-buf"]
draft: true
---

上一篇读取 RTC 和 NVMEM 时，数据量只有几个到几十个字节，由 CPU 经过寄存器或总线完成复制并不困难。显示一帧 1920×1080、每像素 4 字节的图像却接近 8 MiB；摄像头、网络和存储控制器还会持续产生这样的数据。若 CPU 每次都从设备寄存器取一个字再写入内存，计算资源会消耗在重复搬运上。

DMA 让具备总线主控能力的设备直接在设备与内存之间传输数据，CPU 只负责准备缓冲区、描述传输并处理完成事件。问题也随之改变：CPU 手里的普通指针不能直接写进设备寄存器；CPU cache 中的新数据不一定已经对设备可见；设备可能只能产生 32 位地址；一块物理上分散的内存还可能需要组织成多个段。

DMA API、DMAengine、IOMMU 和 dma-buf 经常同时出现在多媒体驱动中，但它们不是同一套 API 的四层包装。DMA mapping API 解决某个设备怎样访问内存，DMAengine 管理专用搬运控制器，IOMMU 翻译和隔离设备地址，dma-buf 则让不同驱动共享同一个缓冲区。本章按依赖关系逐层展开，先让最基础的地址和所有权成立，再进入后面的框架。

## 1. 同一块内存可以有三种地址

驱动执行 `kmalloc()` 后得到的是 CPU 虚拟地址。内核通过页表把它翻译到物理内存；设备发起 DMA 时使用的则是总线上的 DMA 地址。在没有 IOMMU、总线也没有额外偏移的简单平台上，DMA 地址的数值可能碰巧等于物理地址，但驱动不能把这种巧合写成假设。

```text
CPU 指针 --CPU 页表--> 物理页
                         ^
                         |
设备 DMA 地址 --IOMMU/总线映射--+
```

Linux 用 `void *` 表示 CPU 能解引用的虚拟地址，用 `dma_addr_t` 表示应写入设备描述符或 DMA 地址寄存器的地址。`dma_addr_t` 只是数值类型，不是 CPU 指针；CPU 不能把它强制转换后访问。反过来，`virt_to_phys()` 得到的物理地址也不能替代 DMA API，因为它没有建立设备映射、没有处理 IOMMU，也没有执行 cache 维护。

### 1.1 DMA mask 先说明设备能够产生多宽的地址

设备若只有 32 位 DMA 地址寄存器，就只能表达 `0x00000000` 到 `0xffffffff`。驱动在 probe 时要把这个能力告诉 DMA core：

```c
ret = dma_set_mask_and_coherent(dev, DMA_BIT_MASK(32));
if (ret)
	return dev_err_probe(dev, ret, "32-bit DMA is unavailable\n");
```

`dma_set_mask_and_coherent()` 同时设置 streaming 和 coherent 两类 DMA 的地址能力。硬件对两类地址宽度不同时，也可以分别使用 `dma_set_mask()` 与 `dma_set_coherent_mask()`。返回失败表示系统无法为该设备提供要求的 DMA 地址范围；继续分配并截断高位会让设备访问错误位置，而不是一种可接受的降级。

DMA mask 描述的是设备地址能力，不等同于 CPU 位数。64 位 CPU 上的设备可能只有 32 位 DMA，32 位 CPU 平台也可能经过 IOMMU 获得另一套 IOVA 布局。后续每次映射都要携带 `struct device *`，正是因为映射约束属于具体设备。

## 2. coherent allocation 适合长期共享的控制结构

DMA 描述符环、完成状态和设备持续读取的小型控制块常由 CPU 与设备长期共享。`dma_alloc_coherent()` 同时返回两个地址：

```c
struct demo_ring {
	__le32 address;
	__le32 length;
	__le32 control;
	__le32 status;
};

struct demo_ring *ring;
dma_addr_t ring_dma;

ring = dma_alloc_coherent(dev, sizeof(*ring), &ring_dma, GFP_KERNEL);
if (!ring)
	return -ENOMEM;

memset(ring, 0, sizeof(*ring));
// ring 是 CPU 地址，ring_dma 才能交给设备。
```

这里的 coherent 表示 CPU 和设备对该区域的写入能够通过平台提供的一致性机制彼此可见，不需要像 streaming mapping 那样在每次所有权切换时做显式 cache 同步。它不表示读写顺序会自动满足设备协议。若驱动先填写描述符内容，最后写入一个 OWN 位把描述符交给设备，仍需要在 OWN 位之前放置适当的写内存屏障：

```c
ring->address = cpu_to_le32(lower_32_bits(buffer_dma));
ring->length = cpu_to_le32(buffer_len);
wmb();
ring->control = cpu_to_le32(DESC_OWN);
```

屏障约束“设备不能先看到 OWN 再看到旧内容”。`dma_alloc_coherent()` 解决 cache 可见性，`wmb()` 解决观察顺序，二者回答的问题不同。释放时要用原来的设备、大小、CPU 地址和 DMA 地址配对：

```c
dma_free_coherent(dev, sizeof(*ring), ring, ring_dma);
```

coherent 内存通常比普通内存受更多平台约束，也可能来自一致性保留区。数据面上的大缓冲区不应仅因为“省得调用 sync”就全部改用 coherent allocation。

## 3. streaming mapping 把普通缓冲区临时交给设备

网络包、块 I/O 和一次图像传输通常具有明确方向：CPU 准备数据后交给设备发送，或者设备填充后再交给 CPU 处理。这类缓冲区可以先按子系统规则分配，再用 streaming DMA API 建立一段传输期映射。

下面是一段 CPU 准备、设备读取的基本路径：

```c
void *buffer;
dma_addr_t dma;

buffer = kmalloc(buffer_len, GFP_KERNEL);
if (!buffer)
	return -ENOMEM;

fill_packet(buffer, buffer_len);

dma = dma_map_single(dev, buffer, buffer_len, DMA_TO_DEVICE);
if (dma_mapping_error(dev, dma)) {
	kfree(buffer);
	return -EIO;
}

program_device(dma, buffer_len);
// 等待中断、completion 或子系统自己的完成通知。
wait_for_transfer();

dma_unmap_single(dev, dma, buffer_len, DMA_TO_DEVICE);
kfree(buffer);
```

`DMA_TO_DEVICE` 从设备视角描述方向：CPU 产生内容，设备读取。`DMA_FROM_DEVICE` 表示设备写、CPU 随后读；真正双向时才使用 `DMA_BIDIRECTIONAL`。方向会影响 cache 维护和访问权限，不能为了“保险”一律写成双向。

### 3.1 map 与 unmap 之间存在所有权

streaming mapping 最重要的规则不是函数配对，而是所有权。对 `DMA_TO_DEVICE`，CPU 应在 map 前完成写入；map 后到设备完成前，CPU 不再修改该缓冲区。对 `DMA_FROM_DEVICE`，CPU 在设备完成并 unmap 后才读取数据。map/unmap 是一次性传输最清楚的所有权边界。

若为了性能保留映射并重复使用，同一缓冲区在 CPU 和设备之间往返时要显式同步：

```c
// 设备已完成 DMA_FROM_DEVICE，CPU 准备读取。
dma_sync_single_for_cpu(dev, dma, len, DMA_FROM_DEVICE);
consume_data(cpu_addr, len);

// CPU 访问结束，缓冲区重新交给设备。
dma_sync_single_for_device(dev, dma, len, DMA_FROM_DEVICE);
restart_device(dma, len);
```

`dma_sync_single_for_cpu()` 之后，CPU 拥有缓冲区；`dma_sync_single_for_device()` 之后，设备重新拥有它。所谓“cache 不一致问题”经常不是缺少一个随意插入的 flush，而是驱动没有定义谁在何时拥有数据。即便在硬件 cache coherent 的平台上，这套 API 仍表达生命周期，并允许同一驱动移植到非一致平台。

`dma_map_single()` 适用于满足 API 约束的连续 CPU 缓冲区。栈内存、`vmalloc()` 返回区域和任意用户虚拟地址不能直接照此映射；不同来源的内存需要页、scatterlist、pinning 或子系统专用 helper。先确定内存来源，再选 mapping API。

### 3.2 scatter-gather 描述物理上分散的数据

较大的缓冲区可能由多个页组成，块层和网络栈也天然携带多个片段。`struct scatterlist` 记录这些页及片段范围，`dma_map_sg()` 再为具体设备建立 DMA 段：

```c
int mapped_nents;

mapped_nents = dma_map_sg(dev, sgl, original_nents, DMA_FROM_DEVICE);
if (!mapped_nents)
	return -EIO;

for_each_sg(sgl, sg, mapped_nents, i)
	program_one_segment(sg_dma_address(sg), sg_dma_len(sg));

start_device();
wait_for_transfer();

dma_unmap_sg(dev, sgl, original_nents, DMA_FROM_DEVICE);
```

映射器可以把相邻片段合并，所以 `mapped_nents` 可能小于输入的 `original_nents`。设备描述符使用映射后的 `sg_dma_address()` 和 `sg_dma_len()`；解除映射仍传入最初的 entry 数。把 `page_to_phys()` 或 `sg_phys()` 写进硬件会绕开 IOMMU 和总线约束。

## 4. DMAengine 管理的是搬运控制器

到目前为止，DMA 数据传输由“当前设备”自己发起，例如网卡读取自己的 TX ring。SoC 中还常有一个通用 DMA controller，UART、SPI、I2S 等外设把 FIFO 请求线连接到它。DMAengine 为这种控制器提供 provider/client 框架：controller 驱动注册 channel 和能力，外设驱动按设备树中的 `dmas`、`dma-names` 请求 channel。

DMAengine 不替代 DMA mapping。client 仍要准备设备能够访问的缓冲区或 scatterlist，再把已映射的段交给 DMAengine 描述符。一个典型 slave DMA 流程是：

```c
chan = dma_request_chan(dev, "rx");
if (IS_ERR(chan))
	return PTR_ERR(chan);

config.src_addr = fifo_phys_addr;
config.src_addr_width = DMA_SLAVE_BUSWIDTH_4_BYTES;
config.src_maxburst = 4;
ret = dmaengine_slave_config(chan, &config);
if (ret)
	goto err_release;

mapped_nents = dma_map_sg(dev, sgl, original_nents, DMA_FROM_DEVICE);
if (!mapped_nents) {
	ret = -EIO;
	goto err_release;
}

desc = dmaengine_prep_slave_sg(chan, sgl, mapped_nents,
			      DMA_DEV_TO_MEM,
			      DMA_PREP_INTERRUPT | DMA_CTRL_ACK);
if (!desc) {
	ret = -EIO;
	goto err_unmap;
}

desc->callback = transfer_complete;
desc->callback_param = context;
cookie = dmaengine_submit(desc);
ret = dma_submit_error(cookie);
if (ret)
	goto err_unmap;

dma_async_issue_pending(chan);
```

`dmaengine_prep_slave_sg()` 只准备描述符，`dmaengine_submit()` 把它放入 pending queue，`dma_async_issue_pending()` 才允许 channel 开始执行。提交成功后，descriptor 指针归 DMAengine 所有，client 不再访问它。完成 callback、错误终止、unmap 与 `dma_release_channel()` 还要围绕设备自己的启动/停止时序配对；上面的片段只展示 API 依赖关系，不是一份可直接驱动任意 FIFO 的通用模块。

DMAengine 还支持 memcpy、cyclic、interleaved 等能力。音频环形缓冲常用 cyclic DMA，内存到内存测试可使用 memcpy channel。能力由 controller 驱动声明，消费驱动不能从“系统有 DMA 控制器”推断某一种操作一定可用。

## 5. IOMMU 在设备地址与物理页之间再放一张页表

没有 IOMMU 时，DMA mapping 往往把设备可达的物理内存映射为总线地址；有 IOMMU 时，设备看到的 `dma_addr_t` 通常是 I/O virtual address，也就是 IOVA。IOMMU 根据设备所属 domain 的 I/O 页表，把 IOVA 翻译到一个或多个物理页，并可设置读写权限。

```text
设备描述符中的 IOVA
          |
       IOMMU 页表
          |
  多个可能分散的物理页
          |
       CPU 页表
          |
      CPU 虚拟地址
```

这带来三个直接效果。第一，设备可以获得连续 IOVA，即使背后的物理页不连续；第二，设备只能访问 domain 中明确映射的范围，越界 DMA 更容易被隔离和记录；第三，地址宽度、页大小和 aperture 仍受设备与 IOMMU 共同限制，IOMMU 不是无限地址空间。

普通设备驱动继续调用 `dma_map_*()`，不因系统启用 IOMMU 就改成直接调用 `iommu_map()`。DMA layer 会选择 direct 或 IOMMU 后端并维护 IOVA；绕过它会丢失 DMA mask、cache、bus 和架构处理。启动日志中的 IOMMU fault 往往提示设备使用了失效 IOVA、访问方向不符、映射过早释放或描述符越界，排查时应先回到 mapping 生命周期。

> **RV1126 差异：** RV1126 厂商 SDK 的 IOMMU 节点、设备绑定方式、保留内存与 multimedia 驱动可能基于厂商内核实现。本文不假定某个显示、ISP 或编解码器一定经过 IOMMU，也不提供虚构的 IOVA 范围。应从实际 DTS 的 `iommus`、启动日志、`/sys/kernel/iommu_groups`（若该内核导出）和驱动源码确认。

## 6. dma-buf 让不同驱动共享同一个缓冲区

摄像头采集一帧图像后，显示控制器可能直接扫描同一帧，编解码器也可能继续读取。若每经过一个子系统都复制整帧，带宽和延迟都会迅速增加。dma-buf 提供跨驱动、跨子系统共享缓冲区的通用对象，并可通过文件描述符把引用传给用户空间。

分配并拥有 backing storage 的驱动称为 exporter；需要访问它的驱动称为 importer。importer 用 `dma_buf_attach()` 把自己的 `struct device` 附加到缓冲区，再用 `dma_buf_map_attachment()` 得到已经针对该设备映射的 `sg_table`。完成后按相反路径 unmap、detach 和 put。

```text
exporter 的 backing storage
            |
       struct dma_buf
       /            \
  importer A      importer B
 attachment A    attachment B
  sg_table A      sg_table B
 (各自设备地址)   (各自设备地址)
```

同一组物理页对两个 importer 可能得到不同 IOVA，所以 importer 只能使用自己 attachment 的映射。dma-buf 不负责驱动 DMA controller，也不保证由某个统一 allocator 分配；它管理的是共享对象、引用、attachment、映射回调以及同步约定。

设备之间的完成顺序通常通过 `dma_resv` 中的 `dma_fence` 表达。CPU 通过 `mmap` 或 `vmap` 访问非一致缓冲区时，还要用 `dma_buf_begin_cpu_access()` 与 `dma_buf_end_cpu_access()` 包围访问。文件描述符解决“把哪一块缓冲区传给谁”，fence 和 CPU access API 解决“什么时候能安全访问”，二者缺一不可。

DRM 的 GEM 对象常被导出为 dma-buf，摄像头或编解码器也常作为 importer/exporter 参与共享。下一篇会在显示 scanout 的场景中看到 GEM；现在先记住：GEM 管 DRM 内的 buffer object，dma-buf 管跨驱动共享，DMA mapping 为每个实际访问设备建立地址。

## 7. 用一个模块观察 CPU 地址与 DMA 地址

下面的实验模块注册一个仅用于观察的 synthetic platform device，分别分配 coherent buffer 和映射 streaming buffer，然后打印 CPU 虚拟地址与 `dma_addr_t`。它不连接真实 DMA master，不会启动硬件传输，因此只能验证当前内核的 DMA allocation/mapping 路径，不能证明任何 RV1126 外设的数据通路。

```c
// dma_address_demo.c
#include <linux/dma-mapping.h>
#include <linux/init.h>
#include <linux/kernel.h>
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/slab.h>

#define DEMO_SIZE PAGE_SIZE

static struct platform_device *demo_pdev;
static void *coherent_cpu;
static dma_addr_t coherent_dma;
static void *stream_cpu;
static dma_addr_t stream_dma;

static int __init dma_address_demo_init(void)
{
	struct device *dev;
	int ret;

	demo_pdev = platform_device_register_simple(
		"dma-address-demo", PLATFORM_DEVID_NONE, NULL, 0);
	if (IS_ERR(demo_pdev))
		return PTR_ERR(demo_pdev);

	dev = &demo_pdev->dev;
	ret = dma_set_mask_and_coherent(dev, DMA_BIT_MASK(32));
	if (ret)
		goto err_device;

	coherent_cpu = dma_alloc_coherent(dev, DEMO_SIZE,
					 &coherent_dma, GFP_KERNEL);
	if (!coherent_cpu) {
		ret = -ENOMEM;
		goto err_device;
	}
	memset(coherent_cpu, 0xa5, DEMO_SIZE);

	stream_cpu = kmalloc(DEMO_SIZE, GFP_KERNEL);
	if (!stream_cpu) {
		ret = -ENOMEM;
		goto err_coherent;
	}
	memset(stream_cpu, 0x5a, DEMO_SIZE);

	stream_dma = dma_map_single(dev, stream_cpu, DEMO_SIZE,
				    DMA_TO_DEVICE);
	if (dma_mapping_error(dev, stream_dma)) {
		ret = -EIO;
		goto err_stream;
	}

	pr_info("dma_address_demo: coherent cpu=%p dma=%pad\n",
		coherent_cpu, &coherent_dma);
	pr_info("dma_address_demo: streaming cpu=%p dma=%pad\n",
		stream_cpu, &stream_dma);
	pr_info("dma_address_demo: no hardware transfer was started\n");
	return 0;

err_stream:
	kfree(stream_cpu);
err_coherent:
	dma_free_coherent(dev, DEMO_SIZE, coherent_cpu, coherent_dma);
err_device:
	platform_device_unregister(demo_pdev);
	return ret;
}

static void __exit dma_address_demo_exit(void)
{
	struct device *dev = &demo_pdev->dev;

	dma_unmap_single(dev, stream_dma, DEMO_SIZE, DMA_TO_DEVICE);
	kfree(stream_cpu);
	dma_free_coherent(dev, DEMO_SIZE, coherent_cpu, coherent_dma);
	platform_device_unregister(demo_pdev);
}

module_init(dma_address_demo_init);
module_exit(dma_address_demo_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Observe CPU and DMA addresses without starting hardware");
```

同目录创建 `Kbuild`：

```make
obj-m += dma_address_demo.o
```

复用前文已经确认的内核构建目录：

```sh
make -C "$KERNEL_BUILD" M="$PWD" \
  ARCH="$ARCH" CROSS_COMPILE="$CROSS_COMPILE" modules

sudo insmod ./dma_address_demo.ko
dmesg | tail -n 20
sudo rmmod dma_address_demo
```

日志应出现两组 `cpu=... dma=...`，但内核可能为了安全哈希 `%p` 指针，所以 CPU 地址不一定显示原始数值。DMA 地址使用 `%pad` 输出。两种地址数值相同也不能推出驱动可以跳过 DMA API；这只说明当前 synthetic device 在这次映射中采用了直接或等值映射。模块若在 `dma_set_mask_and_coherent()` 或 allocation 阶段失败，表示当前架构不为这个无真实硬件的 platform device 提供该路径，应保留错误日志，而不是为实验伪造 `dma_mask` 或物理地址。

### 7.1 有 memcpy channel 时再运行 dmatest

内核的 `dmatest` 模块可以为声明了 `DMA_MEMCPY` 能力的 DMAengine channel 生成内存到内存测试。先确认测试配置和可用 channel：

```sh
zgrep CONFIG_DMATEST /proc/config.gz 2>/dev/null || true
ls -la /sys/class/dma 2>/dev/null || true
sudo modprobe dmatest iterations=10 test_buf_size=4096 timeout=2000

for p in /sys/module/dmatest/parameters/*; do
	printf '%s=%s\n' "$(basename "$p")" "$(cat "$p")"
done
```

若参数中存在 `run`，启动并查看日志：

```sh
echo 1 | sudo tee /sys/module/dmatest/parameters/run
sleep 3
dmesg | grep -i dmatest | tail -n 30
sudo modprobe -r dmatest
```

看到 `0 failures` 一类结果，说明被选中的 memcpy channel 在本次测试参数下完成了数据校验；没有 channel 或模块不存在，只说明当前内核没有暴露这项测试条件。不要把一个 memcpy test 推广为 UART slave DMA、显示 scanout 或外设握手都已正确。

### 7.2 从系统状态寻找 IOMMU 和 dma-buf

下面的命令都是只读观察：

```sh
find /sys/kernel/iommu_groups -maxdepth 2 -type l -print 2>/dev/null | sort
dmesg | grep -i -E 'iommu|dma.*mask|dma fault' | tail -n 50

if [ -r /sys/kernel/debug/dma_buf/bufinfo ]; then
	sudo cat /sys/kernel/debug/dma_buf/bufinfo
else
	echo "dma-buf debugfs information is unavailable"
fi
```

IOMMU group 目录不存在不等于 SoC 没有 IOMMU；嵌入式厂商内核可能没有导出相同视图。`bufinfo` 中的 size、exporter name 和 attachment 可以帮助把共享缓冲区连回显示、摄像头或编解码器，但 debugfs 不是稳定用户 ABI，字段应按当前内核解释。

## 8. 用所有权检查 DMA 故障

当设备收到的内容是旧数据，先画出 CPU 和设备的所有权时间线：CPU 在 map 前是否完成写入，设备完成事件是否真实到达，CPU 是否在 sync/unmap 后才读取。地址看起来合理却产生 IOMMU fault 时，检查 DMA 地址是否来自当前设备的 mapping、描述符长度是否越界、unmap 是否早于硬件停止。数据偶尔损坏时，还要检查描述符 OWN 位前的内存屏障和完成路径的并发保护。

这套排查顺序比“再刷一次 cache”更具体，因为每个 API 都对应一个问题：

- `dma_set_mask*()` 描述设备地址能力；
- `dma_alloc_coherent()` 为长期共享控制结构提供 CPU/DMA 双地址；
- `dma_map_*()` 为一次数据流建立设备映射并表达方向；
- `dma_sync_*()` 在保留映射时转移 CPU/设备所有权；
- DMAengine 描述并调度专用搬运 channel；
- IOMMU 把 IOVA 翻译到物理页并提供隔离；
- dma-buf 让不同驱动共享 backing storage 和同步状态。

它们可以共同出现在一条多媒体数据通路里，但不能互相代替。

## 9. 下一块大缓冲区将被送到屏幕

现在我们已经能够回答“设备怎样访问一块内存”：驱动先声明 DMA 能力，再分配或映射缓冲区，按方向管理所有权；DMAengine 只在需要通用搬运控制器时加入；IOMMU 可能把设备地址变成 IOVA；dma-buf 则允许另一设备复用同一 backing storage。

显示控制器正是这些概念的集中使用者。它持续从 framebuffer 读取像素，可能经过 IOMMU 得到 scanout 地址，也可能接收由其他设备导出的 dma-buf。下一篇将暂时不追踪摄像头和编解码器，而是只沿一条显示 pipeline，理解 framebuffer、DRM device、plane、CRTC、encoder、connector、GEM 和 atomic KMS 如何把一块像素内存送到屏幕。

## 10. 参考资料

- Linux Kernel Documentation, [Dynamic DMA mapping Guide](https://docs.kernel.org/6.12/core-api/dma-api-howto.html) 与 [DMA-API](https://docs.kernel.org/6.12/core-api/dma-api.html)。
- Linux Kernel Documentation, [DMA Engine API Guide for client drivers](https://docs.kernel.org/6.12/driver-api/dmaengine/client.html) 与 [DMA Test Guide](https://docs.kernel.org/6.12/driver-api/dmaengine/dmatest.html)。
- Linux 6.12 source, [`include/linux/dma-mapping.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/dma-mapping.h?h=v6.12)、[`kernel/dma/mapping.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/dma/mapping.c?h=v6.12) 与 [`drivers/iommu/dma-iommu.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/iommu/dma-iommu.c?h=v6.12)。
- Linux Kernel Documentation, [Buffer Sharing and Synchronization (dma-buf)](https://docs.kernel.org/6.12/driver-api/dma-buf.html)。
- Linux 6.12 source, [`include/linux/dma-buf.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/dma-buf.h?h=v6.12)。
- EmbedFire, [Linux 内核 DMA 与 IOMMU](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/subsystem_dma_iommu.html)，用于对照课程主题；本文的 API 语义以 Linux 6.12 官方文档和源码为准。
