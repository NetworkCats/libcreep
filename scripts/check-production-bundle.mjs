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

const leakedDeclarationPaths = (
  await getFiles(fileURLToPath(new URL('../dist', import.meta.url)))
).filter(
  (path) =>
    path.includes(`${join('dist', 'internal')}`) ||
    path.endsWith('.d.ts.map') ||
    /(?:runtime|worker)\.d\.ts(?:\.map)?$/.test(path),
);
if (leakedDeclarationPaths.length > 0) {
  throw new Error(
    `Production output exposes internal or unusable declaration artifacts: ${leakedDeclarationPaths.join(', ')}`,
  );
}

const publicEntryPath = fileURLToPath(
  new URL('../dist/index.js', import.meta.url),
);
const publicEntry = await readFile(publicEntryPath, 'utf8');
if (
  !/new URL\(["']\.\/worker\.js["'],\s*import\.meta\.url\)/.test(publicEntry)
) {
  throw new Error(
    'Production output does not expose a statically bundleable worker URL',
  );
}

const workerEntry = await readFile(
  fileURLToPath(new URL('../dist/worker.js', import.meta.url)),
  'utf8',
);
if (/^\s*import\s/m.test(workerEntry)) {
  throw new Error(
    'Production worker entry is not self-contained for downstream asset copying',
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
