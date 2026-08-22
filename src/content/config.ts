import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '{cuda,ee-system,rknn,riscv,zephyr,bsp,usb,pcie,video-audio}/**/!(riscv-architecture-framework).md', base: './docs/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    series: z.enum(['cuda', 'ee-system', 'rknn', 'riscv', 'zephyr', 'bsp', 'usb', 'pcie', 'video-audio']),
    order: z.number().default(0),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
