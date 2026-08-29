import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const inputs = process.argv.slice(2);

if (inputs.length === 0) {
  console.error('Usage: node scripts/validate-article-mermaid.mjs <file-or-directory> [...]');
  process.exit(2);
}

function markdownFiles(path) {
  const absolute = resolve(path);
  const stat = statSync(absolute);

  if (stat.isFile()) return extname(absolute).toLowerCase() === '.md' ? [absolute] : [];
  if (!stat.isDirectory()) return [];

  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => markdownFiles(resolve(absolute, entry.name)));
}

const files = [...new Set(inputs.flatMap(markdownFiles))].sort();
const blockPattern = /^```mermaid\s*\r?\n([\s\S]*?)^```\s*$/gm;
let blockCount = 0;
let failureCount = 0;

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import('mermaid');

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

for (const file of files) {
  const markdown = readFileSync(file, 'utf8');
  let match;
  let index = 0;

  while ((match = blockPattern.exec(markdown)) !== null) {
    index += 1;
    blockCount += 1;
    try {
      await mermaid.parse(match[1]);
    } catch (error) {
      failureCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${file} block ${index}: ${message}`);
    }
  }
}

if (failureCount > 0) {
  console.error(`${failureCount} Mermaid block(s) failed out of ${blockCount}`);
  process.exitCode = 1;
} else {
  console.log(`${blockCount} Mermaid block(s) parsed from ${files.length} Markdown file(s)`);
}

dom.window.close();
