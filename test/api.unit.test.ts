import { afterEach, describe, expect, it, vi } from 'vitest';

import LibCreep, {
  ALGORITHM_VERSION,
  AUXILIARY_COMPONENT_NAMES,
  BOT_RULE_NAMES,
  collect,
  CORE_COMPONENT_NAMES,
  DEFAULT_AUXILIARY_COMPONENT_NAMES,
  getBrowserCapabilities,
  isBrowserEnvironment,
  isFingerprintingSupported,
  load,
  LIBRARY_VERSION,
  OPT_IN_AUXILIARY_COMPONENT_NAMES,
} from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server-side import safety', () => {
  it('imports without touching browser globals', () => {
    expect(isBrowserEnvironment()).toBe(false);
    expect(isFingerprintingSupported()).toBe(false);
    expect(getBrowserCapabilities().isBrowser).toBe(false);
    expect(LibCreep.libraryVersion).toBe(LIBRARY_VERSION);
    expect(LibCreep.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it('fails clearly when collection is attempted outside a browser', async () => {
    await expect(load()).rejects.toThrow(/only in a browser window/);
    await expect(collect()).rejects.toThrow(/only in a browser window/);
  });

  it('rejects incomplete Web Crypto implementations', () => {
    vi.stubGlobal('crypto', { subtle: {} });

    expect(getBrowserCapabilities().hasWebCrypto).toBe(false);
    expect(isFingerprintingSupported()).toBe(false);
  });

  it('reports every capability used by support and worker selection', () => {
    vi.stubGlobal('TextEncoder', undefined);

    expect(getBrowserCapabilities()).toMatchObject({
      hasDedicatedWorker: false,
      hasServiceWorker: false,
      hasSharedWorker: false,
      hasTextEncoder: false,
      isBrowser: false,
      isSecureContext: false,
    });
    expect(isFingerprintingSupported()).toBe(false);
  });
});

describe('component manifest', () => {
  it('contains every Creep.js component exactly once', () => {
    expect(CORE_COMPONENT_NAMES).toHaveLength(25);
    expect(new Set(CORE_COMPONENT_NAMES).size).toBe(
      CORE_COMPONENT_NAMES.length,
    );
    expect(CORE_COMPONENT_NAMES).toContain('lies');
    expect(CORE_COMPONENT_NAMES).toContain('workerScope');
    expect(CORE_COMPONENT_NAMES).toContain('canvasWebgl');
  });

  it('publishes the bot-mask rule order', () => {
    expect(BOT_RULE_NAMES).toEqual([
      'liedWorkerScope',
      'liedPlatformVersion',
      'functionToStringHasProxy',
      'outsideFeaturesVersion',
      'extremeLieCount',
      'excessiveLooseFingerprints',
      'workerScopeIsBlocked',
      'crowdBlendingScoreIsLow',
    ]);
  });

  it('enables passive detections by default and identifies opt-in probes', () => {
    expect(DEFAULT_AUXILIARY_COMPONENT_NAMES).toEqual([
      'mediaCapabilities',
      'mediaDevices',
      'status',
    ]);
    expect(OPT_IN_AUXILIARY_COMPONENT_NAMES).toEqual(['webRtc']);
    expect(AUXILIARY_COMPONENT_NAMES).toEqual([
      ...DEFAULT_AUXILIARY_COMPONENT_NAMES,
      ...OPT_IN_AUXILIARY_COMPONENT_NAMES,
    ]);
  });
});
