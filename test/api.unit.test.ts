import { afterEach, describe, expect, it, vi } from 'vitest';

import * as LibCreep from '../src/index.js';
import {
  AUXILIARY_COMPONENT_NAMES,
  BOT_RULE_NAMES,
  collect,
  CORE_COMPONENT_NAMES,
  DEFAULT_AUXILIARY_COMPONENT_NAMES,
  getBrowserCapabilities,
  isFingerprintingSupported,
  LibCreepError,
  load,
  OPT_IN_AUXILIARY_COMPONENT_NAMES,
} from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server-side import safety', () => {
  it('imports without touching browser globals', () => {
    expect(isFingerprintingSupported()).toBe(false);
    expect(getBrowserCapabilities().isBrowser).toBe(false);
  });

  it('exposes only named exports', () => {
    expect(Object.keys(LibCreep).sort()).toEqual([
      'ALGORITHM_VERSION',
      'AUXILIARY_COMPONENT_NAMES',
      'BOT_RULE_NAMES',
      'CORE_COMPONENT_NAMES',
      'DEFAULT_AUXILIARY_COMPONENT_NAMES',
      'LIBRARY_VERSION',
      'LibCreepError',
      'OPT_IN_AUXILIARY_COMPONENT_NAMES',
      'collect',
      'componentsToDebugString',
      'getBrowserCapabilities',
      'hashComponents',
      'isFingerprintingSupported',
      'load',
    ]);
  });

  it('fails clearly when collection is attempted outside a browser', async () => {
    await expect(load()).rejects.toThrow(/only in a browser window/);
    await expect(collect()).rejects.toThrow(/only in a browser window/);
    await expect(load()).rejects.toBeInstanceOf(LibCreepError);
    await expect(collect()).rejects.toMatchObject({
      code: 'NOT_BROWSER',
      name: 'LibCreepError',
    });
  });

  it('reports missing minimum APIs with a dedicated error code', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    vi.stubGlobal('crypto', { subtle: {} });

    await expect(load()).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENVIRONMENT',
    });
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

  it('does not treat null browser globals as a browser environment', () => {
    vi.stubGlobal('window', null);
    vi.stubGlobal('document', null);

    expect(getBrowserCapabilities().isBrowser).toBe(false);
    expect(isFingerprintingSupported()).toBe(false);
  });

  it('treats restricted capability getters as unavailable', () => {
    const browserWindow = {};
    const browserNavigator = {};
    const webCrypto = {};
    Object.defineProperty(browserWindow, 'isSecureContext', {
      get: () => {
        throw new TypeError('blocked secure-context getter');
      },
    });
    Object.defineProperty(browserNavigator, 'serviceWorker', {
      get: () => {
        throw new TypeError('blocked service-worker getter');
      },
    });
    Object.defineProperty(webCrypto, 'subtle', {
      get: () => {
        throw new TypeError('blocked crypto getter');
      },
    });
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', browserNavigator);
    vi.stubGlobal('crypto', webCrypto);

    expect(() => getBrowserCapabilities()).not.toThrow();
    expect(getBrowserCapabilities()).toMatchObject({
      hasServiceWorker: false,
      hasWebCrypto: false,
      isBrowser: true,
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
    expect(CORE_COMPONENT_NAMES).toContain('apiTampering');
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
      'browserStatus',
    ]);
    expect(OPT_IN_AUXILIARY_COMPONENT_NAMES).toEqual(['webRtc']);
    expect(AUXILIARY_COMPONENT_NAMES).toEqual([
      ...DEFAULT_AUXILIARY_COMPONENT_NAMES,
      ...OPT_IN_AUXILIARY_COMPONENT_NAMES,
    ]);
  });
});
