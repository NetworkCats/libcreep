import { defineConfig, type Plugin } from 'vite';

import packageJson from './package.json' with { type: 'json' };

const algorithmVersion = packageJson.fingerprintAlgorithmVersion;

function exposeStaticWorkerUrl(): Plugin {
  return {
    name: 'libcreep-static-worker-url',
    generateBundle(_options, bundle) {
      const entry = bundle['index.js'];
      if (entry?.type !== 'chunk') {
        throw new TypeError('The libcreep index bundle was not generated.');
      }
      const hiddenUrl = 'new URL("./worker.js", workerModuleUrl)';
      const staticUrl = 'new URL("./worker.js", import.meta.url)';
      if (!entry.code.includes(hiddenUrl)) {
        throw new TypeError('The libcreep worker URL rewrite did not match.');
      }
      // Both base expressions have the same length, so source-map offsets stay
      // valid while downstream bundlers receive their standard static pattern.
      entry.code = entry.code.replace(hiddenUrl, staticUrl);
    },
  };
}

export default defineConfig({
  plugins: [exposeStaticWorkerUrl()],
  define: {
    __LIBCREEP_DEBUG__: 'false',
    __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
    __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: { index: 'src/index.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    minify: false,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        chunkFileNames: '[name].js',
      },
    },
  },
});
