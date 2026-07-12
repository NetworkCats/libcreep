import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

const algorithmVersion = packageJson.fingerprintAlgorithmVersion;

export default defineConfig({
  define: {
    __LIBCREEP_DEBUG__: 'true',
    __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
    __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        branches: 62,
        functions: 84,
        lines: 80,
        statements: 78,
      },
    },
    projects: [
      {
        define: {
          __LIBCREEP_DEBUG__: 'true',
          __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
          __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.unit.test.ts'],
        },
      },
      {
        define: {
          __LIBCREEP_DEBUG__: 'true',
          __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
          __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
        },
        test: {
          name: 'browser',
          include: ['test/**/*.browser.test.ts'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            instances: [
              { browser: 'chromium' },
              { browser: 'firefox' },
              { browser: 'webkit' },
            ],
            provider: playwright(),
          },
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
