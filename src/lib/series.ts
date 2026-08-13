export type SeriesId = 'cuda' | 'ee-system' | 'rknn' | 'zephyr';

export interface SeriesMeta {
  id: SeriesId;
  title: string;
  shortTitle: string;
  description: string;
  accent: 'blue' | 'emerald' | 'violet' | 'amber';
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
  zephyr: {
    id: 'zephyr',
    title: 'Zephyr RTOS 实战',
    shortTitle: 'Zephyr',
    description: '从 FreeRTOS 经验迁移到 Zephyr，系统学习 west、Kconfig、Devicetree、驱动模型与板级工程。',
    accent: 'amber',
    href: '/zephyr/',
    label: 'RTOS 生态',
  },
};

export const SERIES_ORDER: SeriesId[] = ['cuda', 'ee-system', 'rknn', 'zephyr'];
