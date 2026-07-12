import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const algorithmVersion = packageJson.fingerprintAlgorithmVersion;
const samples = Math.max(
  1,
  Math.floor(positiveNumber(process.env.LIBCREEP_SPEED_SAMPLES, 5)),
);
const maxMedianMs = positiveNumber(
  process.env.LIBCREEP_SPEED_MAX_MEDIAN_MS,
  15_000,
);
const maxP95Ms = positiveNumber(process.env.LIBCREEP_SPEED_MAX_P95_MS, 30_000);

export default defineConfig({
  define: {
    __LIBCREEP_ALGORITHM_VERSION__: JSON.stringify(algorithmVersion),
    __LIBCREEP_DEBUG__: 'true',
    __LIBCREEP_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
    __LIBCREEP_SPEED_MAX_MEDIAN_MS__: JSON.stringify(maxMedianMs),
    __LIBCREEP_SPEED_MAX_P95_MS__: JSON.stringify(maxP95Ms),
    __LIBCREEP_SPEED_SAMPLES__: JSON.stringify(samples),
  },
  test: {
    name: 'speed',
    include: ['test/**/*.browser.bench.ts'],
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
    hookTimeout: 180_000,
    testTimeout: 180_000,
  },
});
