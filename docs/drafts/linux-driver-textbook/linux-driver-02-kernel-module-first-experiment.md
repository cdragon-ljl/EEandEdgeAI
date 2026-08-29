---
title: "嵌入式知识体系 · Linux 驱动开发实战 #02 · 内核模块原理与第一个模块实验"
description: "沿着外部模块从源码、Kbuild 构建、部署到 insmod、运行观察和 rmmod 的生命周期，理解 .ko 如何进入并离开正在运行的内核。"
pubDate: "2026-08-29"
series: linux-driver
order: 2
tags: ["Linux Driver", "Kernel Module", "Kbuild"]
draft: true
---

上一篇把实验的坐标定在了“正在运行的具体内核”上：源码、构建输出、工具链和板端 `uname -r` 必须能够彼此对应。现在可以把这个关系落到一个看得见的文件上。外部模块编译后得到的 `.ko` 究竟是什么？它为什么能在不重新启动系统的情况下进入内核，又为什么还能被卸载？

把 `.ko` 当成普通应用程序可执行文件会带来两个误解。第一，模块并不是由 shell 直接执行的；`insmod` 把它交给内核，内核决定它能否成为自己的一部分。第二，模块也不是一个独立进程：加载成功后，它的代码会在内核态运行，能够调用的接口、可用的符号和生存期都受运行内核约束。本篇只做一个会写入内核日志的最小模块，但完整走完构建、加载、观察和卸载的路径。后面每个真正驱动都会重复这条路径，只是初始化时做的事情会更多。

## 1. `.ko` 是可装入内核的一段目标代码

`.ko` 通常是 ELF 可重定位目标文件。它包含机器代码、数据、重定位记录、未解析符号以及一段供工具和内核识别的模块信息；它还没有像普通用户程序那样在某个固定地址完成装载。Kbuild 依据目标内核的配置和生成文件编译它，内核加载器再把需要保留的内容安排到模块内存中，解析它引用的内核符号，并在条件满足时调用模块的初始化入口。

因此，“生成了 `.ko`”只说明主机完成了一次外部模块构建，不说明目标板必定能加载它。架构不匹配、完整 release 不匹配、符号版本不匹配或模块签名策略不允许，都可能使装载失败。上一篇记录的构建目录正是让 Kbuild 得到正确配置、生成头文件和 `Module.symvers` 的依据。Linux 6.12 的外部模块文档明确要求使用已经构建过、包含配置和头文件的内核目录；启用 `CONFIG_MODVERSIONS` 时，单独执行 `modules_prepare` 不会生成 `Module.symvers`，仍需要完整内核构建产物。[Building External Modules](https://docs.kernel.org/6.12/kbuild/modules.html)

### 1.1 内建代码和可加载模块是两种进入内核的时机

Kconfig 中同一个功能常会给出 `y`、`m` 和 `n` 三种选择。`y` 表示把代码链接进内核映像：它随内核启动而存在，不能用 `rmmod` 单独拿掉。`m` 表示把它编译为模块：系统启动后可以在需要时装入，前提是运行内核启用了模块支持。`n` 则不构建该功能。具体选项未必都有这三种取值，但这种区分贯穿内核配置和构建结果。

模块并不是“比内建更高级”的形式。需要在非常早的启动阶段使用、无法接受装载失败、或者平台从不变化的基础功能，常会选择内建。模块的价值在于把可选硬件和可选功能从基础镜像中分离出来，让同一内核映像按实际需要装入代码，也让调试阶段能够修改、重新构建并重新装载一个局部功能。代价是运行时必须处理版本、依赖、权限和生命周期；这正是这篇实验要刻意观察的部分。

### 1.2 模块信息不是注释，而是装载和诊断的线索

用 `modinfo` 查看一个 `.ko`，通常会看到 `name`、`description`、`license`、`parm`、`depends` 和 `vermagic` 等字段。这些来自 Kbuild 和源码宏写入的模块信息，而非运行日志的猜测。`vermagic` 记录构建时的内核 release 以及若干影响二进制兼容性的标记，是出现 `invalid module format` 时应先与板端 `uname -r` 对照的线索；它不是绕过兼容性检查的开关。

`MODULE_LICENSE("GPL")` 同样不是装饰。它把模块声明的许可证写入元数据，内核据此判断模块是否声明为 GPL 兼容；未声明或声明为非 GPL 兼容时，内核会标记污染状态，并且 GPL-only 导出符号不能被该模块使用。模块实际使用哪一种许可证必须由代码的真实授权决定，不能为了消除提示而随意写成 `GPL`。`MODULE_DESCRIPTION`、`MODULE_AUTHOR` 和 `MODULE_PARM_DESC` 不直接改变执行路径，却让 `modinfo`、日志和后续维护者能够识别这个二进制文件。

Linux 6.12 的 [`include/linux/module.h`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/module.h?h=v6.12) 把这些声明组织为 `MODULE_INFO` 形式的宏。编译时它们会形成模块元数据，故而下面的源码既给内核提供入口，也给人和工具提供身份信息。

## 2. 从外部源码目录交给 Kbuild

外部模块不应自行复制内核编译器选项或手工链接 ELF。内核的 Kbuild 知道本次内核使用的架构、配置、生成头文件、符号版本和编译规则；外部模块通过 `M=` 说明“模块源码在这个目录”，把实际编译仍交给那棵匹配的内核构建树。Linux 6.12 文档给出的基本形式是 `make -C <kernel-dir> M=$PWD`，其中 `-C` 指向源码树或分离的输出树，而 `M` 是外部模块目录的绝对路径。[Building External Modules](https://docs.kernel.org/6.12/kbuild/modules.html)

### 2.1 一个足够小、但能观察运行状态的模块

在主机上创建一个独立实验目录，例如 `~/driver-labs/module-echo/`。下面的 `module_echo.c` 没有注册设备，也没有接触硬件；它只在初始化和退出时记录一条消息。`message` 是只读模块参数，所以同一份 `.ko` 可以在装载时得到不同文本，这使我们能同时观察参数解析、`/sys/module/` 状态和内核日志。

```c
// module_echo.c
#include <linux/init.h>
#include <linux/kernel.h>
#include <linux/module.h>

#define pr_fmt(fmt) KBUILD_MODNAME ": " fmt

static char *message = "hello from module_echo";
module_param(message, charp, 0444);
MODULE_PARM_DESC(message, "text written to the kernel log at load time");

static int __init module_echo_init(void)
{
	pr_info("init: message=%s\n", message);
	return 0;
}

static void __exit module_echo_exit(void)
{
	pr_info("exit\n");
}

module_init(module_echo_init);
module_exit(module_echo_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Linux driver textbook");
MODULE_DESCRIPTION("A minimal module lifecycle experiment");
```

`static` 让这三个符号只在本编译单元可见。`__init` 和 `__exit` 是生命周期标记：初始化函数在加载时执行，退出函数在卸载时执行。一个可成功加载的初始化函数返回 `0`；若返回负 errno，装载失败，模块不会进入正常运行状态。这里的初始化没有失败分支，是为了把焦点放在装载机制上，而不是假造硬件资源错误。

`module_init(module_echo_init)` 和 `module_exit(module_echo_exit)` 不是直接在源码中调用函数。对于可加载模块，它们把这两个函数交给模块框架作为装入和卸载的入口。内核会在用户空间请求装载、格式和依赖检查完成之后调用初始化函数；卸载时才有机会调用退出函数。这就是为什么 `pr_info` 的两条日志分别是加载和卸载的证据，而不是程序从 `main()` 顺序执行的输出。

### 2.2 Kbuild 文件和给人的 Makefile

同一目录再放置下面两个文件。`Kbuild` 的一行告诉 Kbuild：由 `module_echo.c` 生成 `module_echo.o`，再链接成 `module_echo.ko`。外层 `Makefile` 只提供便于人手执行的入口；真正的规则仍在内核构建系统中。

```make
# Kbuild
obj-m := module_echo.o
```

```make
# Makefile
KDIR ?= /lib/modules/$(shell uname -r)/build
PWD := $(shell pwd)

.PHONY: all clean

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean
```

Linux 6.12 文档也允许把 `obj-m := module_echo.o` 写在单个 `Makefile` 中；分开写在这个极小例子里不是必须的。这里特意分开，是为了区分两个角色：`Kbuild` 描述模块构成，`Makefile` 让调用者替换 `KDIR` 而不需要理解 Kbuild 的第二次解析。Kbuild 会优先寻找名为 `Kbuild` 的文件，找不到才读取 `Makefile` 中的 Kbuild 内容。[Building External Modules](https://docs.kernel.org/6.12/kbuild/modules.html)

## 3. 构建输出把源码变成可供内核检查的模块

如果实验对象是开发主机正在运行的内核，并且 `/lib/modules/$(uname -r)/build` 确实指向已准备好的匹配目录，可以在模块目录执行：

```sh
make
```

这会展开为 `make -C "$KDIR" M="$PWD" modules`。不要因为它在主机上成功就把主机 `.ko` 复制到 ARM 板上：主机 Kbuild 默认面向主机架构，且它的 release 和板端内核通常也不同。这个命令只适合验证本机的内核构建环境或本机运行模块。

### 3.1 交叉构建时，匹配的输出目录仍是中心

对上一篇已经确认过的 RV1126 SDK 环境，先在主机 shell 中填入实际值，再由同一环境调用 Kbuild：

```sh
# 以下路径、ARCH 和工具链前缀是环境相关示例，必须替换为实际 SDK 值。
export KDIR=/path/to/rv1126/kernel-build
export ARCH=arm
export CROSS_COMPILE=/path/to/toolchain/bin/arm-linux-gnueabihf-

make -C "$KDIR" M="$PWD" \
  ARCH="$ARCH" CROSS_COMPILE="$CROSS_COMPILE" modules
```

这里的 `KDIR` 应是生成目标板当前内核的构建输出目录；如果内核使用 `O=` 分离构建，它通常不是干净源码目录。`ARCH=arm` 和 `arm-linux-gnueabihf-` 只是本项目 RV1126 场景中可能出现的写法，不能替代 SDK 实际构建命令。某些厂商 SDK 导出不同前缀，或者要求经由其顶层脚本设置环境；此时应复用上一篇记录的 `ARCH`、`CROSS_COMPILE` 和输出目录，而不应从示例猜测。

成功后，目录中最关心的是 `module_echo.ko`。同时还能看到 `module_echo.o`、`module_echo.mod.c`、`modules.order`、`Module.symvers` 等中间或辅助文件。它们说明这不是“gcc 编译一个 C 文件”那么简单：Kbuild 先产生对象文件，`modpost` 再根据内核的 `Module.symvers` 检查模块引用的外部符号，并生成模块自身的符号信息。官方文档说明，内核构建的 `Module.symvers` 列出导出符号及其可选 CRC，外部模块的 `modpost` 会读取它来检查外部引用。[Building External Modules](https://docs.kernel.org/6.12/kbuild/modules.html)

可先在主机查看产物的身份信息，而不必加载它：

```sh
file module_echo.ko
modinfo module_echo.ko
modinfo -F vermagic module_echo.ko
```

`file` 应把它识别为与目标架构相符的可重定位 ELF；`modinfo` 应能看到 `description`、`author`、`license` 和 `parm: message:...`。`vermagic` 的前缀应与准备部署的板端 `uname -r` 对照。它们不同不一定只意味着版本号不同，也可能是源码分支、`LOCALVERSION` 或构建输出目录取错；先回到环境记录寻找原因，而不是试图修改 `.ko` 中的字符串。

## 4. `insmod` 把加载请求交给内核

把 `.ko` 复制到目标板的临时实验位置。下面以 `scp` 举例，主机名、用户和路径由实际板卡连接方式决定：

```sh
scp module_echo.ko root@<target-host>:/tmp/module_echo.ko
```

登录目标板后，先确认复制的正是刚才构建的文件，再装载它：

```sh
sha256sum /tmp/module_echo.ko
sudo insmod /tmp/module_echo.ko message="hello from the target board"
```

`insmod` 的职责很窄：它接收一个明确路径的模块文件和可选参数，发起装载请求。真正读取 ELF、检查元数据、安排内存、解析符号和调用初始化函数的是内核。Linux 6.12 的模块加载实现以 `init_module` 系统调用入口接收用户空间提供的模块映像，随后进入 `load_module` 处理；这个源码位置适合在本节建立“用户命令向内核加载器交接”的心智模型，而不必现在逐节追踪 ELF 重定位细节。[Linux 6.12 `kernel/module/main.c`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/module/main.c?h=v6.12)

### 4.1 从请求到 `module_init`，内核做了哪些关键判断

可以把一次成功装载理解为连续发生的几件事。内核先接收用户空间传来的模块映像和参数，确认当前策略允许装载；它解析模块 ELF，处理版本和签名等检查，安排可在模块存活期间使用的代码与数据，并解析模块对已导出符号的引用。随后，内核建立模块对象和依赖关系，最后调用由 `module_init` 指定的初始化函数。只有这个函数返回 `0`，模块才成为可见的 live 模块；它的名字会出现在 `/proc/modules`，参数目录会出现在 `/sys/module/`。

这里的“已导出符号”值得停一下。内核中不是所有全局函数都能被模块调用；只有内核或其他模块用导出机制公开的符号才能作为模块依赖。加载器需要把模块中对这些符号的引用连接到实际实现。若模块 A 使用模块 B 导出的符号，A 的存活就依赖 B：B 不能在 A 仍依赖它时被卸载。对这个最小模块而言，`depends` 往往为空，但它仍使用了由基础内核提供的接口；空的 `depends` 不是“它与内核没有关系”。

`MODULE_LICENSE` 也在这个阶段影响符号使用权限。声明 GPL 兼容许可证的模块可以使用标记为 GPL-only 的导出符号；非 GPL 兼容模块则不能。等以后读取真实驱动时，看到 `EXPORT_SYMBOL_GPL` 不要只把它当成链接细节，它同时表达了接口的授权边界。

### 4.2 用日志和内核对象观察，而不是只看命令返回值

`insmod` 没有报错只说明系统调用返回成功。更有价值的是让加载行为留下三种彼此独立的证据：初始化日志、模块列表和参数对象。可以按下面方式查看：

```sh
dmesg | tail -n 20
grep '^module_echo ' /proc/modules
cat /sys/module/module_echo/parameters/message
```

预期日志中有 `module_echo: init: message=hello from the target board`；`/proc/modules` 中出现以 `module_echo` 开头的一行；参数文件输出装载时传入的文本。`lsmod` 也会格式化展示 `/proc/modules`，但直接看 `/proc/modules` 有助于认识它是内核导出的状态，而不是 `lsmod` 自己保存的列表。

若 `insmod` 返回 `Invalid module format`，立即查看完整 `dmesg`，不要只依据该错误文字判断原因。日志通常会指出 `version magic`、架构、签名或其他拒绝原因；最常见的回溯路径仍是板端 `uname -r`、模块 `modinfo -F vermagic` 和主机所用构建目录。若报 `Unknown symbol`，则检查目标内核是否导出了模块所需符号，以及构建时使用的 `Module.symvers` 是否来自同一内核构建。若是权限错误，则确认是否具有加载模块所需能力，并检查系统是否在启动后禁止模块加载。

## 5. 参数、依赖和 `modprobe` 让模块进入可管理的系统

`insmod /tmp/module_echo.ko` 适合刚刚编译完的单文件实验，因为模块路径明确、依赖为空，失败时也容易把现象同一份文件对应起来。但实际系统中的模块通常按内核 release 放在 `/lib/modules/$(uname -r)/` 下，并由依赖数据库组织。这时更常用的是 `modprobe`。

### 5.1 `insmod` 和 `modprobe` 的区别不在于谁“更强”

`insmod` 以文件路径为输入，直接请求装入这一份模块。它不会替你搜索模块目录，也不会递归装入其他模块依赖。`modprobe` 则以模块名或别名为输入，在 `/lib/modules/$(uname -r)/` 的索引中查找目标，并依照 `depmod` 生成的依赖信息先装入所需模块。因此，`modprobe` 不能把临时绝对路径当作普通模块名使用；它的便利来自目录布局和索引，而不是替代内核的兼容性检查。

要让本例也走这条管理路径，可以在目标板安装到当前 release 的模块树，再重建索引：

```sh
sudo install -D -m 0644 /tmp/module_echo.ko \
  /lib/modules/$(uname -r)/extra/module_echo.ko
sudo depmod -a
sudo modprobe module_echo message="loaded through modprobe"
```

再次查看 `dmesg` 和 `/sys/module/module_echo/parameters/message`，预期会看见新的参数值。这里并没有改变 `.ko` 的格式；变化的是用户空间如何定位模块以及如何先处理依赖。官方 Kbuild 文档约定外部模块的默认安装位置在 `/lib/modules/$(KERNELRELEASE)/updates/` 下，也允许通过安装变量选择其他子目录；`extra/` 是不少系统用于本地模块的约定，实际发行版和 SDK 的模块管理策略应以目标系统为准。[Building External Modules](https://docs.kernel.org/6.12/kbuild/modules.html)

### 5.2 依赖关系也是模块生命周期的一部分

`modinfo` 的 `depends` 字段、`/proc/modules` 的使用计数和 `depmod` 的索引都在描述同一个事实：一个模块不是只靠文件名存在。模块可以引用其他模块导出的符号；加载器和模块管理工具需要知道这种关系，避免先卸载仍被使用的提供者。模块参数则是另一条运行时边界：它们由加载请求传入，并通过 `/sys/module/<name>/parameters/` 暴露出来；是否可在加载后修改由参数权限和模块实现共同决定。

本例把 `message` 设为 `0444`，意图是观察加载时确定的值。它不是通用配置系统，也不应把任何复杂状态都塞进模块参数。真正驱动以后会有更明确的设备描述、资源和用户接口；在进入那些主题前，先把参数看成“装载请求携带的少量、类型明确的输入”即可。

## 6. `rmmod` 并非删除文件，而是结束一次内核内生命周期

完成观察后，先确保这个模块当前已经加载，再请求卸载：

```sh
sudo rmmod module_echo
dmesg | tail -n 20
grep '^module_echo ' /proc/modules || echo "module_echo is not loaded"
```

预期日志新增 `module_echo: exit`，最后一条命令输出 `module_echo is not loaded`。`rmmod` 操作的是内核中已经 live 的模块对象，不会删除 `/tmp/module_echo.ko` 或 `/lib/modules/.../module_echo.ko` 文件；下次 `insmod` 或 `modprobe` 仍可从文件重新发起加载。把“卸载”与“删除模块文件”分开理解，才能避免看到文件还在就误以为模块没有卸载。

### 6.1 为什么 `rmmod` 可能说模块 busy

内核必须保证不会释放仍可能被执行或被依赖的模块代码。如果另一个模块正在使用它导出的符号，或者模块自己的引用计数尚未归零，`rmmod` 可以返回 busy。此时最重要的不是强制卸载，而是找出谁持有它：先看 `lsmod` 的 `Used by` 列和 `/proc/modules` 中对应字段，再回到创建引用的功能正常关闭的路径。强制卸载可能破坏仍在使用的函数地址，对初学实验不应把它当作常规解决办法。

本例没有注册设备、没有导出符号，也没有异步工作，因此正常情况下引用计数会很快为零，卸载可以立即成功。真实驱动的退出函数往往需要按与初始化相反的顺序停止活动、解除注册并释放资源；这正是为什么初始化和退出应该从第一天起被看作一对生命周期函数，而不是两条可有可无的日志。

## 7. 把一次最小实验放回驱动学习的主线

至此，模块的整个路径已经闭合：源码里的 `module_init`、`module_exit` 和元数据给出了入口与身份；Kbuild 使用匹配的内核构建输出生成 `.ko`；`modinfo` 在装载前展示它携带的线索；`insmod` 或 `modprobe` 把请求交给内核；内核完成检查、符号解析和初始化；日志、`/proc/modules` 与 `/sys/module/` 提供运行证据；`rmmod` 在引用安全时调用退出入口并结束它的内核内生命周期。

这次实验没有在 RV1126 开发板上实际运行。文中的 RV1126 路径、`ARCH` 和交叉工具链前缀都标为环境相关示例；只有使用与目标板正在运行的内核匹配的 SDK 构建目录，才能把命令的预期观察变成该板上的事实。未实际运行比编造一段“成功输出”更有价值，因为前一篇建立的环境核对仍然是所有板端实验的前提。

本篇的最小模块只证明了“代码能够进入内核并留下可观察的生命周期”。但用户空间执行 `open()`、`read()` 或 `write()` 时，究竟怎样从文件描述符走到驱动提供的回调？下一篇将从这个问题进入字符设备与 VFS 的连接。

## 8. 参考资料

- Linux Kernel Documentation, [Building External Modules (Linux 6.12)](https://docs.kernel.org/6.12/kbuild/modules.html)。
- Linux kernel stable source, [include/linux/module.h (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/linux/module.h?h=v6.12)。
- Linux kernel stable source, [kernel/module/main.c (v6.12)](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/kernel/module/main.c?h=v6.12)。
- EmbedFire, [Linux 内核模块](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_linuxkernel_module.html) 与 [Linux 内核模块实验](https://doc.embedfire.com/linux/rk356x/driver/zh/latest/linux_driver/base_first_module.html)，用于对照本系列实验措辞；本文的机制与构建规则以 Linux 6.12 官方文档和源码为准。
