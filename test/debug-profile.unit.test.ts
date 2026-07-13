import { describe, expect, it, vi } from 'vitest';

import {
  createSpeedProfile,
  printSpeedProfile,
} from '../src/internal/debug/profile.js';
import type { FingerprintResult } from '../src/types.js';

const result = {
  auxiliary: {
    mediaCapabilities: { durationMs: 5, status: 'fulfilled', value: {} },
    mediaDevices: { durationMs: 2, status: 'unsupported' },
    status: { durationMs: 3, status: 'fulfilled', value: {} },
    webRtc: { durationMs: 0, status: 'skipped' },
  },
  components: {
    canvas2d: { durationMs: 20, status: 'fulfilled', value: {} },
    fonts: { durationMs: 50, status: 'fulfilled', value: {} },
    voices: {
      durationMs: 10,
      error: { message: 'failed', name: 'Error' },
      status: 'rejected',
    },
  },
  durationMs: 100,
} as unknown as FingerprintResult;

describe('debug speed profiling', () => {
  it('ranks detector timings and summarizes parallel work', () => {
    expect(createSpeedProfile(result)).toMatchObject({
      auxiliary: [
        {
          durationMs: 5,
          name: 'mediaCapabilities',
          percentOfCollection: 5,
        },
        { durationMs: 3, name: 'status', percentOfCollection: 3 },
        { durationMs: 2, name: 'mediaDevices', percentOfCollection: 2 },
        { durationMs: 0, name: 'webRtc', percentOfCollection: 0 },
      ],
      collectionDurationMs: 100,
      core: [
        { durationMs: 50, name: 'fonts', percentOfCollection: 50 },
        { durationMs: 20, name: 'canvas2d', percentOfCollection: 20 },
        { durationMs: 10, name: 'voices', percentOfCollection: 10 },
      ],
      measuredDetectorTimeMs: 90,
      parallelismRatio: 0.9,
      rejectedCount: 1,
      unsupportedCount: 1,
    });
  });

  it('prints detailed tables only when called by a debug build', () => {
    const group = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {
      return undefined;
    });
    const table = vi.spyOn(console, 'table').mockImplementation(() => {
      return undefined;
    });
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {
      return undefined;
    });

    printSpeedProfile(result);

    expect(group).toHaveBeenCalledWith('[libcreep speed profile] 100ms total');
    expect(table).toHaveBeenCalledTimes(3);
    expect(groupEnd).toHaveBeenCalledOnce();
  });
});
