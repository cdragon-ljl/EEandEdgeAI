export function slugifyFileName(fileName) {
  return fileName
    .replace(/\.md$/i, '')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function getOrder(fileName) {
  const match = fileName.match(/(?:npu-|rknn-)?(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 999;
}

export function yamlString(value) {
  return JSON.stringify(String(value).replace(/\r?\n/g, ' '));
}

export function firstHeading(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

export function firstDescription(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '---' || line.startsWith('#')) continue;
    if (line.startsWith('>')) {
      const cleaned = line.replace(/^>\s*/, '').trim();
      if (cleaned) return cleaned.slice(0, 180);
    }
    if (!line.startsWith('```') && !line.startsWith('|')) {
      return line.slice(0, 180);
    }
  }
  return title;
}

export function normalizeMarkdown(markdown, seriesId) {
  if (seriesId !== 'rknn') return markdown;
  return markdown.replaceAll('./images/', '/EEandEdgeAI/images/rknn/');
}

export function stripFirstHeading(markdown) {
  return markdown.replace(/^#\s+.+\r?\n/, '').trimStart();
}
