import fs from 'node:fs/promises';
import path from 'node:path';
import {
  firstDescription,
  firstHeading,
  getOrder,
  normalizeMarkdown,
  slugifyFileName,
  stripFirstHeading,
  yamlString,
} from './article-migration-utils.mjs';

const root = process.cwd();
const sourceRoot = 'D:\\Official Account\\site';
const outputRoot = path.join(root, 'docs', 'articles');

const seriesList = [
  {
    id: 'cuda',
    source: path.join(sourceRoot, 'cuda'),
    title: 'CUDA 与 NPU 算子开发',
    tag: 'CUDA',
  },
  {
    id: 'ee-system',
    source: path.join(sourceRoot, 'ee-system'),
    title: '嵌入式知识体系',
    tag: '嵌入式',
  },
  {
    id: 'rknn',
    source: path.join(sourceRoot, 'rknn'),
    title: 'RKNN 端侧 AI 部署',
    tag: 'RKNN',
  },
];

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function migrateSeries(series) {
  const outDir = path.join(outputRoot, series.id);
  await ensureCleanDir(outDir);
  const files = (await fs.readdir(series.source))
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort((a, b) => getOrder(a) - getOrder(b) || a.localeCompare(b, 'zh-CN'));

  for (const file of files) {
    const sourcePath = path.join(series.source, file);
    const stat = await fs.stat(sourcePath);
    const raw = await fs.readFile(sourcePath, 'utf8');
    const title = firstHeading(raw, file.replace(/\.md$/i, ''));
    const description = firstDescription(raw, title);
    const order = getOrder(file);
    const slug = slugifyFileName(file);
    const body = normalizeMarkdown(raw, series.id);
    const withoutTitle = stripFirstHeading(body);
    const frontmatter = [
      '---',
      `title: ${yamlString(title)}`,
      `description: ${yamlString(description)}`,
      `pubDate: ${yamlString(stat.mtime.toISOString().slice(0, 10))}`,
      `series: ${yamlString(series.id)}`,
      `order: ${order}`,
      `tags: [${yamlString(series.tag)}, ${yamlString(series.title)}]`,
      'draft: false',
      '---',
      '',
    ].join('\n');

    await fs.writeFile(path.join(outDir, `${slug}.md`), frontmatter + withoutTitle, 'utf8');
  }

  return files.length;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const counts = [];

  for (const series of seriesList) {
    const count = await migrateSeries(series);
    counts.push(`${series.id}: ${count}`);
  }

  await ensureCleanDir(path.join(root, 'public', 'images', 'rknn'));
  await copyDir(path.join(sourceRoot, 'rknn', 'images'), path.join(root, 'public', 'images', 'rknn'));

  console.log(`Migrated ${counts.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
