# EEandEdgeAI

`EEandEdgeAI` 是一个面向嵌入式、驱动与端侧 AI 工程师的系统化技术学习站，内容从 C/C++、RTOS 和 Linux BSP 延伸到 RISC-V、FPGA、GPU/NPU、深度学习与音视频工程。

当前站点包含 **12 个专题系列、302 篇已发布文章**。文章强调原理、源码调用链、硬件数据路径和真实工程约束，而不是只给出 API 用法或命令清单。

## 在线阅读

[EEandEdgeAI 技术学习站](https://cdragon-ljl.github.io/EEandEdgeAI/)

## 专题系列

| 系列 | 已发布 | 主要内容 |
|:---|---:|:---|
| [CUDA 与 NPU 算子开发](https://cdragon-ljl.github.io/EEandEdgeAI/cuda/) | 16 | GPU 执行模型、CUDA Kernel、内存层次、算子优化、推理与 AI 编译器 |
| [嵌入式知识体系](https://cdragon-ljl.github.io/EEandEdgeAI/ee-system/) | 40 | C/C++、Rust、构建与链接、ARM、STM32、ESP32、缓存、总线与系统工程 |
| [FreeRTOS 内核源码解读](https://cdragon-ljl.github.io/EEandEdgeAI/freertos/) | 12 | TCB、调度器、队列、同步、内存管理及 Cortex-M4/RISC-V 移植层 |
| [RKNN 端侧 AI 部署](https://cdragon-ljl.github.io/EEandEdgeAI/rknn/) | 16 | Rockchip NPU、模型转换、量化、板端推理、性能调优与 C++17 工程能力 |
| [RISC-V 架构精讲](https://cdragon-ljl.github.io/EEandEdgeAI/riscv/) | 30 | QEMU 裸机、指令集、特权级、MMU、缓存、FPGA 软核与端侧 AI |
| [FPGA 与芯片原型验证实战](https://cdragon-ljl.github.io/EEandEdgeAI/fpga/) | 36 | 数字逻辑、Verilog/SystemVerilog、Zynq、AXI、DMA、Linux 驱动与加速器原型 |
| [Zephyr RTOS 实战](https://cdragon-ljl.github.io/EEandEdgeAI/zephyr/) | 26 | west、Kconfig、Devicetree、内核、驱动、BLE、MCUboot、移植与测试 |
| [Linux BSP 开发实战](https://cdragon-ljl.github.io/EEandEdgeAI/bsp/) | 48 | 启动链、U-Boot、内核、设备树、驱动子系统、存储、网络、音视频与产品化 |
| [USB 驱动开发实战](https://cdragon-ljl.github.io/EEandEdgeAI/usb/) | 9 | USB 枚举、描述符、URB、Host/Gadget、类驱动与故障定位 |
| [PCIe 驱动开发实战](https://cdragon-ljl.github.io/EEandEdgeAI/pcie/) | 16 | 配置空间、BAR、MSI/MSI-X、DMA、IOMMU、Endpoint 与高吞吐设计 |
| [音视频开发实战](https://cdragon-ljl.github.io/EEandEdgeAI/video-audio/) | 26 | V4L2、Media Controller、ALSA/ASoC、ISP、编解码、FFmpeg、GStreamer 与流媒体 |
| [神经网络与深度学习](https://cdragon-ljl.github.io/EEandEdgeAI/deep-learning/) | 27 | 神经网络基础、CNN、RNN/LSTM、Transformer、视觉、生成、强化学习与 ARM 部署 |

## 推荐学习路线

### 嵌入式系统与驱动

```text
嵌入式知识体系 → FreeRTOS / Zephyr → Linux BSP → USB / PCIe / 音视频驱动
```

适合希望从 MCU、RTOS 逐步进入 Linux 内核、BSP 和设备驱动的读者。

### 端侧 AI 与多媒体

```text
神经网络与深度学习 → CUDA 与 NPU 算子 → RKNN 端侧部署 → 音视频采集、编码与流媒体
```

适合希望把模型从训练、转换一路部署到摄像头、NPU 和实时多媒体管线的读者。

### 体系结构与硬件加速

```text
嵌入式底层基础 → RISC-V 架构 → FPGA / Zynq → AXI、DMA 与自定义加速器
```

适合关注处理器架构、软核、PS/PL 协同和芯片原型验证的读者。

## 内容特点

- **调用链导向**：从用户 API 追到内核对象、驱动回调、DMA 和硬件状态机。
- **源码与硬件互证**：结合设备树、驱动源码、数据手册、日志和总线拓扑解释结论。
- **端到端视角**：覆盖构建、启动、采集、推理、编码、传输和产品化之间的连接。
- **工程约束优先**：关注生命周期、并发、内存、缓存一致性、时序、功耗和错误恢复。
- **可视化表达**：使用 Mermaid 展示架构、状态机、调用流程、时序和数据路径。

## 项目结构

```text
docs/articles/          各专题系列的 Markdown 文章
docs/articles/*/src/    部分文章配套的驱动、设备树与示例源码
src/                    Astro 站点、页面与内容集合配置
public/                 系列封面、站点图标等静态资源
scripts/                构建与内容迁移脚本
tests/                  内容契约、路由和页面行为测试
```

## 本地运行

环境要求：Node.js 20 或更高版本。

```bash
npm ci
npm test
npm run dev
```

生产构建：

```bash
npm run build
```

构建结果输出到 `dist/`，并生成 Pagefind 中文搜索索引。

## 技术栈

- [Astro](https://astro.build/)：静态站点与内容集合
- Markdown / Mermaid / KaTeX：文章、技术图表与公式
- Tailwind CSS：站点样式
- Pagefind：静态全文搜索
- Node.js Test Runner：内容与路由契约测试

## 项目说明

这是一个持续更新的个人技术资料项目。文章中的硬件参数、内核 API 和厂商 SDK 结论会尽量标明适用平台与版本；迁移到不同芯片、内核或工具链时，应以目标环境的源码和官方文档为准。
