export type SeriesId = 'cuda' | 'ee-system' | 'rknn' | 'riscv' | 'zephyr' | 'bsp' | 'usb-pcie' | 'video-audio';

export interface SeriesMeta {
  id: SeriesId;
  title: string;
  shortTitle: string;
  description: string;
  accent: 'blue' | 'emerald' | 'violet' | 'indigo' | 'amber' | 'cyan' | 'orange' | 'rose';
  href: string;
  label: string;
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
  },
  'ee-system': {
    id: 'ee-system',
    title: '嵌入式知识体系',
    shortTitle: 'Embedded Systems',
    description: '系统梳理 C/C++、Rust、构建系统、ARM、STM32、ESP32 与工程实践。',
    accent: 'emerald',
    href: '/ee-system/',
    label: '底层工程',
  },
  rknn: {
    id: 'rknn',
    title: 'RKNN 端侧 AI 部署',
    shortTitle: 'RKNN',
    description: '围绕 Rockchip NPU 工具链，覆盖模型转换、量化、板端推理和性能调优。',
    accent: 'violet',
    href: '/rknn/',
    label: '端侧部署',
  },
  riscv: {
    id: 'riscv',
    title: 'RISC-V 架构精讲',
    shortTitle: 'RISC-V',
    description: '从 QEMU 裸机实验、架构原理到 FPGA 软核，建立可动手验证的 RISC-V 系统能力。',
    accent: 'indigo',
    href: '/riscv/',
    label: '架构与软核',
  },
  zephyr: {
    id: 'zephyr',
    title: 'Zephyr RTOS 实战',
    shortTitle: 'Zephyr',
    description: '从 FreeRTOS 经验迁移到 Zephyr，系统学习 west、Kconfig、Devicetree、驱动模型与板级工程。',
    accent: 'amber',
    href: '/zephyr/',
    label: 'RTOS 生态',
  },
  bsp: {
    id: 'bsp',
    title: 'Linux BSP 开发实战',
    shortTitle: 'Linux BSP',
    description: '围绕启动链路、SDK 构建、U-Boot、设备树与板级调试，建立嵌入式 Linux BSP 开发的完整工程视角。',
    accent: 'cyan',
    href: '/bsp/',
    label: '板级开发',
  },
  'usb-pcie': {
    id: 'usb-pcie',
    title: 'USB 与 PCIe 驱动开发',
    shortTitle: 'USB / PCIe',
    description: '从总线枚举、驱动框架和数据传输，到 DMA、中断与板级调试，建立高速外设驱动开发能力。',
    accent: 'orange',
    href: '/usb-pcie/',
    label: '高速外设',
  },
  'video-audio': {
    id: 'video-audio',
    title: '音视频开发实战',
    shortTitle: 'Video & Audio',
    description: '从图像与音频基础、摄像头与 ISP，到编码、推流、FFmpeg 和 GStreamer，系统构建端侧音视频能力。',
    accent: 'rose',
    href: '/video-audio/',
    label: '多媒体系统',
  },
};

export const SERIES_ORDER: SeriesId[] = ['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'usb-pcie', 'video-audio'];
