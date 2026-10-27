import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/internal/worker/index.js', () => ({
  WORKER_TYPE: 'dedicated',
}));

vi.stubGlobal('self', { document: {} });
vi.stubGlobal('navigator', { keyboard: undefined, plugins: [] });

const {
  FUZZY_METRIC_KEYS,
  getBotDetection,
  getFuzzyHash,
  partitionFuzzyMetricKeys,
} = await import('../src/internal/utils/crypto.js');

afterEach(() => {
  vi.unstubAllGlobals();
});

const botImports = {
  computeWindowsRelease: vi.fn(() => undefined),
  getFeaturesLie: vi.fn(() => false),
};

describe('bot detection', () => {
  it('maps the current toString proxy signal and preserves rule order', () => {
    const result = getBotDetection(
      {
        headless: { stealth: { hasToStringProxy: true } },
        workerScope: { userAgent: 'Mozilla/5.0' },
      },
      botImports,
    );

    expect(result).toEqual({
      botMask: '00101000',
      firstMatchedRule: 'functionToStringHasProxy',
      matchedRules: ['functionToStringHasProxy', 'extremeLieCount'],
    });
  });

  it('does not flag a successful dedicated worker scope as blocked', () => {
    const result = getBotDetection(
      { workerScope: { userAgent: 'Mozilla/5.0' } },
      botImports,
    );

    expect(result).toEqual({ botMask: '00000000', matchedRules: [] });
  });
});

describe('fuzzy fingerprint bins', () => {
  it('keeps metric keys unique and partitions them into 64 balanced bins', () => {
    expect(Object.isFrozen(FUZZY_METRIC_KEYS)).toBe(true);
    expect(new Set(FUZZY_METRIC_KEYS).size).toBe(FUZZY_METRIC_KEYS.length);

    const bins = partitionFuzzyMetricKeys();
    const binSizes = bins.map((bin) => bin.length);
    expect(bins).toHaveLength(64);
    expect(Math.max(...binSizes) - Math.min(...binSizes)).toBeLessThanOrEqual(
      1,
    );
    expect(bins.flat()).toEqual(FUZZY_METRIC_KEYS);
  });

  it('derives all 64 output characters from hashed bins', async () => {
    const digest = vi.fn(async () => new Uint8Array([0xab]).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });

    await expect(getFuzzyHash({})).resolves.toBe('a'.repeat(64));
    expect(digest).toHaveBeenCalledTimes(64);
  });
});
