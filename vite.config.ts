import { defineConfig } from 'vite';

import packageJson from './package.json' with { type: 'json' };

const algorithmVersion = packageJson.fingerprintAlgorithmVersion;

export default defineConfig({
  define: {
    __LIBCREEP_DEBUG__: 'false',
    __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
    __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        worker: 'src/worker.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    minify: false,
    sourcemap: true,
    target: 'es2024',
    rollupOptions: {
      output: {
        chunkFileNames: '[name].js',
      },
    },
  },
});
