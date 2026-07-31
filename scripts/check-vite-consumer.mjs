import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

async function getFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? getFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const projectRoot = dirname(
  fileURLToPath(new URL('../package.json', import.meta.url)),
);
const temporaryRoot = await realpath(
  await mkdtemp(join(tmpdir(), 'libcreep-vite-consumer-')),
);

try {
  const installedPackage = join(temporaryRoot, 'node_modules', 'libcreep');
  await mkdir(installedPackage, { recursive: true });
  await copyFile(
    join(projectRoot, 'package.json'),
    join(installedPackage, 'package.json'),
  );
  await cp(join(projectRoot, 'dist'), join(installedPackage, 'dist'), {
    recursive: true,
  });
  await writeFile(
    join(temporaryRoot, 'package.json'),
    JSON.stringify({
      name: 'libcreep-vite-consumer',
      private: true,
      type: 'module',
    }),
  );
  await writeFile(
    join(temporaryRoot, 'index.html'),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(
    join(temporaryRoot, 'main.js'),
    "import { load } from 'libcreep';\nwindow.loadLibcreep = load;\n",
  );

  const outputDirectory = join(temporaryRoot, 'output');
  await build({
    build: { minify: false, outDir: outputDirectory },
    logLevel: 'silent',
    root: temporaryRoot,
  });

  const outputFiles = await getFiles(outputDirectory);
  const javascriptFiles = outputFiles.filter((path) => path.endsWith('.js'));
  const packagedWorker = await readFile(
    join(projectRoot, 'dist', 'worker.js'),
    'utf8',
  );
  let workerAsset;
  for (const path of javascriptFiles) {
    if ((await readFile(path, 'utf8')) === packagedWorker) {
      workerAsset = path;
      break;
    }
  }
  if (workerAsset === undefined) {
    throw new Error('Vite did not copy the packaged worker into app assets.');
  }

  const workerAssetName = basename(workerAsset);
  const appBundles = javascriptFiles.filter((path) => path !== workerAsset);
  const referencesWorker = (
    await Promise.all(appBundles.map((path) => readFile(path, 'utf8')))
  ).some((contents) => contents.includes(workerAssetName));
  if (!referencesWorker) {
    throw new Error(
      'The Vite app bundle does not reference its copied worker.',
    );
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
