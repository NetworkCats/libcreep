import { afterAll, describe, expect, it, vi } from 'vitest';

const navigatorStub = { keyboard: undefined, plugins: [] };
vi.stubGlobal('self', { document: {}, navigator: navigatorStub });
vi.stubGlobal('navigator', navigatorStub);

const { getErrors, getThrownMessage } =
  await import('../src/internal/engine/index.js');
const featuresModule = await import('../src/internal/features/index.js');
const getEngineFeatures = featuresModule.default;
const { getVersionLie, markTerminalEstimate, versionSort } = featuresModule;

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('engine error collection', () => {
  it('normalizes non-Error and hostile thrown values without aborting', () => {
    const hostile = Object.create(null, {
      message: {
        get: () => {
          throw new Error('blocked');
        },
      },
      toString: {
        value: () => {
          throw new Error('blocked');
        },
      },
    });

    expect(
      getErrors([
        () => {
          throw 0;
        },
        () => {
          throw Symbol('failure');
        },
        () => {
          throw { message: 'plain failure' };
        },
        () => {
          throw hostile;
        },
      ]),
    ).toEqual([
      '0',
      'Symbol(failure)',
      'plain failure',
      'Unknown thrown value',
    ]);
    expect(getThrownMessage({ message: 'cross-realm style' })).toBe(
      'cross-realm style',
    );
  });
});

describe('engine feature version estimates', () => {
  it('keeps sorting non-mutating and marks stale terminal maps as lower bounds', () => {
    const versions = ['112-113', '114-115', '99'];
    expect(versionSort(versions)).toEqual(['114-115', '112-113', '99']);
    expect(versions).toEqual(['112-113', '114-115', '99']);
    expect(markTerminalEstimate('114-115', '126')).toBe('115+');
    expect(markTerminalEstimate('112-113', '126')).toBe('112-113');
  });

  it('treats a terminal plus-version as a lower bound, not an exact version', () => {
    expect(getVersionLie('126', '115+')).toEqual({
      distance: 0,
      liedVersion: false,
    });
    expect(getVersionLie('113', '115+')).toEqual({
      distance: 2,
      liedVersion: true,
    });
  });

  it('rethrows unexpected collector failures for rejected status reporting', async () => {
    const failure = new Error('hostile computedStyle getter');
    const cssComputed = Object.create(null, {
      computedStyle: {
        get: () => {
          throw failure;
        },
      },
    });

    await expect(
      getEngineFeatures({
        cssComputed,
        navigatorComputed: {},
        windowFeaturesComputed: { keys: [] },
      }),
    ).rejects.toBe(failure);
    await expect(
      getEngineFeatures({
        cssComputed: undefined,
        navigatorComputed: {},
        windowFeaturesComputed: { keys: [] },
      }),
    ).resolves.toBeUndefined();
  });
});
