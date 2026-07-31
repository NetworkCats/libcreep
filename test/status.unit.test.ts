import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('status collector utilities', () => {
  it('reports timer resolutions above one millisecond', async () => {
    const { getTimingResolution } =
      await import('../src/internal/status/index.js');
    let call = 0;
    vi.spyOn(performance, 'now').mockImplementation(() =>
      call++ % 2 === 0 ? 0 : 2,
    );

    expect(getTimingResolution()).toEqual([2, 2]);
  });

  it('falls back to the legacy storage API and handles its error callback', async () => {
    const { getStorage } = await import('../src/internal/status/index.js');
    const queryUsageAndQuota = vi
      .fn()
      .mockImplementationOnce((_success: unknown, failure: () => void) =>
        failure(),
      )
      .mockImplementationOnce(
        (success: (usage: number, quota: number) => void) =>
          success(1, 8_589_934_592),
      );
    vi.stubGlobal('navigator', {
      webkitTemporaryStorage: { queryUsageAndQuota },
    });

    await expect(getStorage()).resolves.toBeNull();
    await expect(getStorage()).resolves.toBe(8_589_934_592);
  });

  it('rejects a pending quota request when aborted', async () => {
    const { getStorage } = await import('../src/internal/status/index.js');
    vi.stubGlobal('navigator', {
      storage: { estimate: () => new Promise(() => undefined) },
    });
    const controller = new AbortController();
    const reason = new DOMException('cancel status', 'AbortError');
    const storage = getStorage(controller.signal);
    controller.abort(reason);

    await expect(storage).rejects.toBe(reason);
  });

  it('bounds storage APIs that never invoke their callbacks', async () => {
    vi.useFakeTimers();
    const { getStorage } = await import('../src/internal/status/index.js');
    vi.stubGlobal('navigator', {
      storage: { estimate: () => new Promise(() => undefined) },
      webkitTemporaryStorage: {
        queryUsageAndQuota: () => undefined,
      },
    });

    const storage = getStorage();
    const expectation = expect(storage).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);

    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a valid zero-byte quota as zero gigabytes', async () => {
    const { getStatus } = await import('../src/internal/status/index.js');
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 0 }) },
      webkitTemporaryStorage: {
        queryUsageAndQuota: (success: (usage: number, quota: number) => void) =>
          success(0, 0),
      },
    });
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM in unit test');
      },
      currentScript: null,
      querySelectorAll: () => [],
    });
    vi.stubGlobal('window', {});
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);

    const status = await getStatus();

    expect(status.quota).toBe(0);
    expect(status.quotaInGigabytes).toBe(0);
    expect(status.quotaIsInsecure).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads script size passively from resource timing data', async () => {
    const { getStatus } = await import('../src/internal/status/index.js');
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM in unit test');
      },
      currentScript: { src: 'https://example.test/app.js' },
      querySelectorAll: () => [],
    });
    vi.stubGlobal('window', {});
    const getEntries = vi
      .spyOn(performance, 'getEntriesByName')
      .mockReturnValue([
        { decodedBodySize: 1234 } as unknown as PerformanceEntry,
      ]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const status = await getStatus();

    expect(status.scriptSize).toBe(1234);
    expect(getEntries).toHaveBeenCalledWith(
      'https://example.test/app.js',
      'resource',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
