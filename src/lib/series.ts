export type SeriesId = 'cuda' | 'ee-system' | 'freertos' | 'rknn' | 'riscv' | 'fpga' | 'zephyr' | 'bsp' | 'linux-driver' | 'usb' | 'pcie' | 'video-audio' | 'deep-learning';

export interface SeriesMeta {
  id: SeriesId;
  title: string;
  shortTitle: string;
  description: string;
  accent: 'blue' | 'emerald' | 'violet' | 'indigo' | 'amber' | 'cyan' | 'orange' | 'rose';
  href: string;
  label: string;
  cover: {
    src: string;
    width: number;
    height: number;
    alt: string;
  };
}

export const SERIES: Record<SeriesId, SeriesMeta> = {
  cuda: {
    id: 'cuda',
    title: 'CUDA 与 NPU 算子开发',
    shortTitle: 'CUDA / NPU',
    description: '从嵌入式开发思维进入 GPU 并行编程、算子优化和端侧 AI 部署。',
    accent: 'blue',
    href: '/cuda/',
    label: '算子与并行',
    cover: { src: '/covers/cuda.webp', width: 1923, height: 818, alt: 'CUDA 与 NPU 算子开发系列封面' },
  },
  'ee-system': {
    id: 'ee-system',
    title: '嵌入式知识体系',
    shortTitle: 'Embedded Systems',
    description: '系统梳理 C/C++、Rust、构建系统、ARM、STM32、ESP32 与工程实践。',
    accent: 'emerald',
    href: '/ee-system/',
    label: '底层工程',
    cover: { src: '/covers/ee-system.webp', width: 1922, height: 818, alt: '嵌入式知识体系系列封面' },
  },
  freertos: {
    id: 'freertos',
    title: 'FreeRTOS 内核源码解读',
    shortTitle: 'FreeRTOS',
    description: '沿真实调用链拆解任务、调度、通信、同步、内存管理与 Cortex-M4/RISC-V 移植层。',
    accent: 'rose',
    href: '/freertos/',
    label: 'RTOS 内核',
    cover: { src: '/covers/freertos.webp', width: 1923, height: 818, alt: 'FreeRTOS 内核源码解读系列封面' },
  },
  rknn: {
    id: 'rknn',
    title: 'RKNN 端侧 AI 部署',
    shortTitle: 'RKNN',
    description: '围绕 Rockchip NPU 工具链，覆盖模型转换、量化、板端推理和性能调优。',
    accent: 'violet',
    href: '/rknn/',
    label: '端侧部署',
    cover: { src: '/covers/rknn.webp', width: 1938, height: 811, alt: 'RKNN 端侧 AI 部署系列封面' },
  },
  riscv: {
    id: 'riscv',
    title: 'RISC-V 架构精讲',
    shortTitle: 'RISC-V',
    description: '从 QEMU 裸机实验、架构原理到 FPGA 软核，建立可动手验证的 RISC-V 系统能力。',
    accent: 'indigo',
    href: '/riscv/',
    label: '架构与软核',
    cover: { src: '/covers/riscv.webp', width: 1919, height: 820, alt: 'RISC-V 架构精讲系列封面' },
  },
  fpga: {
    id: 'fpga',
    title: 'FPGA 与芯片原型验证实战',
    shortTitle: 'FPGA / Zynq',
    description: '从数字逻辑、RTL 与 Zynq PS/PL，到 AXI、Linux 驱动访问 PL 和硬件加速器原型。',
    accent: 'cyan',
    href: '/fpga/',
    label: '硬件原型',
    cover: { src: '/covers/fpga.webp', width: 1921, height: 819, alt: 'FPGA 与芯片原型验证实战系列封面' },
  },
  zephyr: {
    id: 'zephyr',
    title: 'Zephyr RTOS 实战',
    shortTitle: 'Zephyr',
    description: '从 FreeRTOS 经验迁移到 Zephyr，系统学习 west、Kconfig、Devicetree、驱动模型与板级工程。',
    accent: 'amber',
    href: '/zephyr/',
    label: 'RTOS 生态',
    cover: { src: '/covers/zephyr.webp', width: 1923, height: 818, alt: 'Zephyr RTOS 实战系列封面' },
  },
  bsp: {
    id: 'bsp',
    title: 'Linux BSP 开发实战',
    shortTitle: 'Linux BSP',
    description: '围绕启动链路、SDK 构建、U-Boot、设备树与板级调试，建立嵌入式 Linux BSP 开发的完整工程视角。',
    accent: 'cyan',
    href: '/bsp/',
    label: '板级开发',
    cover: { src: '/covers/bsp.webp', width: 1942, height: 809, alt: 'Linux BSP 开发实战系列封面' },
  },
  'linux-driver': {
    id: 'linux-driver',
    title: 'Linux 驱动开发实战',
    shortTitle: 'Linux Driver',
    description: '从设备模型、内核资源与总线驱动，到存储、网络、USB、V4L2、ASoC 和驱动可靠性。',
    accent: 'cyan',
    href: '/linux-driver/',
    label: '内核驱动',
    cover: { src: '/covers/linux-driver.webp', width: 1942, height: 809, alt: 'Linux 驱动开发实战系列封面' },
  },
  usb: {
    id: 'usb',
    title: 'USB 驱动开发实战',
    shortTitle: 'USB',
    description: '从架构与枚举、描述符和 URB，到类驱动、Gadget、Host 控制器与故障排查。',
    accent: 'orange',
    href: '/usb/',
    label: '通用外设总线',
    cover: { src: '/covers/usb.webp', width: 1919, height: 820, alt: 'USB 驱动开发实战系列封面' },
  },
  pcie: {
    id: 'pcie',
    title: 'PCIe 驱动开发实战',
    shortTitle: 'PCIe',
    description: '从配置空间、BAR 与中断，到 DMA、IOMMU、Endpoint bring-up 和高吞吐设计。',
    accent: 'orange',
    href: '/pcie/',
    label: '高速设备互联',
    cover: { src: '/covers/pcie.webp', width: 1919, height: 820, alt: 'PCIe 驱动开发实战系列封面' },
  },
  'video-audio': {
    id: 'video-audio',
    title: '音视频开发实战',
    shortTitle: 'Video & Audio',
    description: '从图像与音频基础、摄像头与 ISP，到编码、推流、FFmpeg 和 GStreamer，系统构建端侧音视频能力。',
    accent: 'rose',
    href: '/video-audio/',
    label: '多媒体系统',
    cover: { src: '/covers/video-audio.webp', width: 1920, height: 819, alt: '音视频开发实战系列封面' },
  },
  'deep-learning': {
    id: 'deep-learning',
    title: '神经网络与深度学习',
    shortTitle: 'Deep Learning',
    description: '从神经网络基础、CNN、RNN 与 Transformer，到视觉、生成、强化学习和 ARM 边缘部署。',
    accent: 'indigo',
    href: '/deep-learning/',
    label: '模型与智能',
    cover: { src: '/covers/deep-learning.webp', width: 1672, height: 941, alt: '神经网络与深度学习系列封面' },
  },
};

export const SERIES_ORDER: SeriesId[] = ['cuda', 'ee-system', 'freertos', 'rknn', 'riscv', 'fpga', 'zephyr', 'bsp', 'linux-driver', 'usb', 'pcie', 'video-audio', 'deep-learning'];
