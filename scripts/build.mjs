import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const env = {
  ...process.env,
  ASTRO_TELEMETRY_DISABLED: '1',
};

const commands = [
  [process.execPath, [path.join(root, 'node_modules', 'astro', 'astro.js'), 'check']],
  [process.execPath, [path.join(root, 'node_modules', 'astro', 'astro.js'), 'build']],
  [process.execPath, [path.join(root, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs'), '--site', 'dist']],
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });

for (const [command, args] of commands) {
  await run(command, args);
}
