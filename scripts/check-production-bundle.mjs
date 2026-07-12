import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbiddenMarkers = [
  '[libcreep speed profile]',
  'measuredDetectorTimeMs',
  'parallelismRatio',
];

async function getFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? getFiles(path) : [path];
    }),
  );
  return files.flat();
}

const productionFiles = (
  await getFiles(fileURLToPath(new URL('../dist', import.meta.url)))
).filter((path) => ['.js', '.map'].includes(extname(path)));

const publicEntryPath = fileURLToPath(
  new URL('../dist/index.js', import.meta.url),
);
const publicEntry = await readFile(publicEntryPath, 'utf8');
if (!/new URL\(["']\.\/worker\.js["']/.test(publicEntry)) {
  throw new Error(
    'Production output does not reference the packaged dist/worker.js entry',
  );
}

for (const path of productionFiles) {
  const contents = await readFile(path, 'utf8');
  const marker = forbiddenMarkers.find((candidate) =>
    contents.includes(candidate),
  );
  if (marker !== undefined) {
    throw new Error(
      `Production output ${path} contains debug marker ${marker}`,
    );
  }
}
