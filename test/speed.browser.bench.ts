import { beforeAll, describe, expect, it } from 'vitest';

import {
  CORE_COMPONENT_NAMES,
  load,
  type FingerprintResult,
} from '../src/index.js';

declare const __LIBCREEP_SPEED_MAX_MEDIAN_MS__: number;
declare const __LIBCREEP_SPEED_MAX_P95_MS__: number;
declare const __LIBCREEP_SPEED_SAMPLES__: number;

interface SpeedSample {
  readonly result: FingerprintResult;
  readonly wallDuration: number;
}

function percentile(values: ReadonlyArray<number>, fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function browserLabel(): string {
  const match = navigator.userAgent.match(/(Firefox|Chrome|Version)\/(\S+)/);
  return match === null ? navigator.userAgent : `${match[1]} ${match[2]}`;
}

const samples: SpeedSample[] = [];

beforeAll(async () => {
  const collector = await load({
    worker: { strategy: 'auto', url: '/dist/worker.js' },
  });

  // Warm caches and one-time browser resources before collecting samples.
  await collector.collect();
  for (let index = 0; index < __LIBCREEP_SPEED_SAMPLES__; index += 1) {
    const start = performance.now();
    const result = await collector.collect();
    samples.push({ result, wallDuration: performance.now() - start });
  }
});

describe('Creep.js collection speed', () => {
  it('measures multiple end-to-end collections within the speed budget', () => {
    const collectionDurations = samples.map(({ result }) => result.durationMs);
    const wallDurations = samples.map(({ wallDuration }) => wallDuration);
    const report = {
      browser: browserLabel(),
      collectionMs: collectionDurations.map(round),
      maxMs: round(Math.max(...collectionDurations)),
      medianMs: round(percentile(collectionDurations, 0.5)),
      p95Ms: round(percentile(collectionDurations, 0.95)),
      samples: samples.length,
      wallMs: wallDurations.map(round),
    };

    console.info('[libcreep speed]', report);
    expect(samples).toHaveLength(__LIBCREEP_SPEED_SAMPLES__);
    expect(report.medianMs).toBeLessThanOrEqual(
      __LIBCREEP_SPEED_MAX_MEDIAN_MS__,
    );
    expect(report.p95Ms).toBeLessThanOrEqual(__LIBCREEP_SPEED_MAX_P95_MS__);
  });

  it('profiles every detector over every sample', () => {
    const detectorProfile = CORE_COMPONENT_NAMES.map((name) => {
      const durations = samples.map(
        ({ result }) => result.components[name].durationMs,
      );
      return {
        maxMs: round(Math.max(...durations)),
        medianMs: round(percentile(durations, 0.5)),
        name,
        p95Ms: round(percentile(durations, 0.95)),
      };
    }).sort((left, right) => right.p95Ms - left.p95Ms);

    console.info('[libcreep detector speed]', browserLabel());
    console.table(detectorProfile);
    expect(detectorProfile).toHaveLength(CORE_COMPONENT_NAMES.length);
    for (const { result } of samples) {
      expect(Object.keys(result.components)).toHaveLength(
        CORE_COMPONENT_NAMES.length,
      );
      for (const component of Object.values(result.components)) {
        expect(component.durationMs).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(component.durationMs)).toBe(true);
      }
    }
  });
});
