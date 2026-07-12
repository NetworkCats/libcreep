import { afterEach, describe, expect, it, vi } from 'vitest';

import LibCreep, {
  ALGORITHM_VERSION,
  AUXILIARY_DETECTION_NAMES,
  collect,
  DEFAULT_AUXILIARY_DETECTION_NAMES,
  DETECTION_NAMES,
  getBrowserSupport,
  isBrowserEnvironment,
  isSupported,
  load,
  OPT_IN_DETECTION_NAMES,
  VERSION,
} from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server-side import safety', () => {
  it('imports without touching browser globals', () => {
    expect(isBrowserEnvironment()).toBe(false);
    expect(isSupported()).toBe(false);
    expect(getBrowserSupport().browserEnvironment).toBe(false);
    expect(LibCreep.version).toBe(VERSION);
    expect(LibCreep.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it('fails clearly when collection is attempted outside a browser', async () => {
    await expect(load()).rejects.toThrow(/only in a browser window/);
    await expect(collect()).rejects.toThrow(/only in a browser window/);
  });

  it('rejects incomplete Web Crypto implementations', () => {
    vi.stubGlobal('crypto', { subtle: {} });

    expect(getBrowserSupport().webCrypto).toBe(false);
    expect(isSupported()).toBe(false);
  });
});

describe('detection manifest', () => {
  it('contains every Creep.js component exactly once', () => {
    expect(DETECTION_NAMES).toHaveLength(25);
    expect(new Set(DETECTION_NAMES).size).toBe(DETECTION_NAMES.length);
    expect(DETECTION_NAMES).toContain('lies');
    expect(DETECTION_NAMES).toContain('workerScope');
    expect(DETECTION_NAMES).toContain('canvasWebgl');
  });

  it('enables passive detections by default and identifies opt-in probes', () => {
    expect(DEFAULT_AUXILIARY_DETECTION_NAMES).toEqual([
      'mediaCapabilities',
      'mediaDevices',
      'status',
    ]);
    expect(OPT_IN_DETECTION_NAMES).toEqual(['webRTC']);
    expect(AUXILIARY_DETECTION_NAMES).toEqual([
      ...DEFAULT_AUXILIARY_DETECTION_NAMES,
      ...OPT_IN_DETECTION_NAMES,
    ]);
  });
});
