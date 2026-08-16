# RISC-V 系列首篇发布闭环设计

日期：2026-08-16

## 目标

在 Astro 技术学习站中发布“嵌入式知识体系 · RISC-V 架构精讲”的第一篇文章，并让该系列成为与 CUDA、嵌入式基础、RKNN、Zephyr、Linux BSP、音视频并列的一等内容系列。

首篇面向已有 C/C++、ARM、RTOS 与 Linux 基础，但没有 RISC-V 实践经验的嵌入式软件工程师。读者完成文章后，应能在零硬件成本的 QEMU `virt` 平台上，以统一的 CMake 工程交叉编译、启动、观察并调试一个 RV64 裸机串口 Hello World 程序。

## 推荐范围

采用“首篇完整发布闭环”。本次只发布系列第一篇，同时完成其在站点中的注册与自动化验证。

不一次性补写后续文章，不创建实际 FPGA 或 MilkV 工程，也不改动现有 BSP、Zephyr 或其他系列的未提交文章。

## 内容模型与站点接入

在 `src/content/config.ts` 的文章 collection glob 与 `series` 枚举中加入 `riscv`。

在 `src/lib/series.ts` 中扩展 `SeriesId`、`SERIES` 元数据和展示顺序，使 RISC-V 有中文名称、描述、颜色及站内链接。

在 `src/lib/articles.ts` 中允许 `riscv` 通过系列 ID 类型守卫；在 `src/components/SeriesCard.astro` 中为该系列提供与既有系列一致的图标或视觉标识。现有通用路由将据此自动生成系列页和文章页，不另建专用页面。

`tests/site-content-config.test.mjs` 将覆盖系列注册和 RISC-V 首篇的必需 frontmatter，防止内容存在却不被构建系统收录。

## 首篇文章

新增 `docs/articles/riscv/qemu-riscv-01-env-setup-hello-world.md`，frontmatter 使用：

- `title`：嵌入式知识体系 · RISC-V 架构精讲 #01 · QEMU 环境搭建与第一个 Hello World
- `description`：强调在 QEMU `virt` 上完成从构建、启动到 GDB 验证的最小 RISC-V 裸机闭环。
- `pubDate`：2026-08-16。
- `series`：`riscv`。
- `order`：1。
- `draft`：`false`。

正文按现有长文格式组织：

1. 说明 QEMU 的作用、适用边界，以及它与真实开发板和 ARM Cortex-M 实验的关系。
2. 定义 RV64、RISC-V ABI、交叉编译器、QEMU `virt` 和 UART；每个首次出现的 RISC-V 概念同时给出嵌入式或 ARM 类比。
3. 给出可复用的工程目录、`toolchain-riscv.cmake`、`CMakeLists.txt`、链接脚本、启动代码及 C 入口。代码以裸机 RV64 为目标，只输出串口字符，不假设操作系统、库函数或真实硬件。
4. 说明构建与启动命令，解释 QEMU 的 `virt` 内存布局、`-bios none`、加载 ELF 与串口输出的责任边界；每个命令都给出可观察的成功条件和常见失败线索。
5. 使用 QEMU 的 GDB stub 验证复位入口、栈指针、`main` 和串口写入路径，明确这是对“程序被正确装载并开始执行”的验证，而不只看见一行文本。
6. 用 Mermaid 图表达宿主机到 QEMU 的构建/运行链、裸机启动路径、UART 字节输出路径和 GDB 调试交互。文章至少包含两张图，图中不依赖图片资产。
7. 以练习、里程碑和可执行验收清单收尾，再用单行标签结束。

文章遵守系列框架中的红线：不写思考过程或草稿痕迹，不使用 Part A/B/C 指代，不预告后续文章，不列出全系列目录或篇数，不在正文中点名 RV 编号。文末只保留标签行。

## 技术正确性边界

文中 RISC-V 指令、寄存器和 ABI 描述以 RISC-V 官方规范为准；QEMU `virt` 的机器行为、命令行参数与调试方式以 QEMU 官方文档和当前源码为准。开始正文编写前逐项核对这些来源，避免沿用旧版教程中可能失效的地址、选项或工具链假设。

文章不会声称 QEMU `virt` 等同于 Zynq、MicroBlaze V 或 MilkV Duo；与这些平台的差异只作为边界说明，避免把仿真结果误当成真实硬件验证。

## 验收

- `npm test` 通过，且新的注册测试与文章 frontmatter 测试覆盖 `riscv`。
- `npm run build` 成功，构建产物包含 RISC-V 系列列表页及首篇文章路由。
- 文章的 frontmatter 可被 Astro content collection 解析；系列文章按 `order: 1` 排序。
- 文章中每个 shell 命令、CMake 文件和代码片段在文本层面相互一致，且不违反系列写作红线。
- 工作区中现有未提交的 BSP 和 Zephyr 改动保持原样。

## 非目标

- 不补写大纲中的其他 RISC-V 文章。
- 不在本次提供实际 FPGA bitstream、FreeRTOS port 或 Linux 镜像。
- 不将文章作为草稿隐藏发布；首篇以 `draft: false` 出现在站点中。
