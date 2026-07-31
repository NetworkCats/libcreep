import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALGORITHM_VERSION,
  collect,
  load,
  LIBRARY_VERSION,
  type CollectionOptions,
  type FingerprintResult,
} from '../src/index.js';
import { printSpeedProfile } from '../src/internal/debug/profile.js';
import { collectFingerprint } from '../src/runtime.js';

vi.mock('../src/internal/debug/profile.js', () => ({
  printSpeedProfile: vi.fn(),
}));
vi.mock('../src/runtime.js', () => ({
  collectFingerprint: vi.fn(),
}));

const mockedCollectFingerprint = vi.mocked(collectFingerprint);
const mockedPrintSpeedProfile = vi.mocked(printSpeedProfile);
const fingerprint = {
  components: {},
  rawVisitorId: 'fixture',
} as unknown as FingerprintResult;

beforeEach(() => {
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    body: {},
  });
  vi.stubGlobal('window', { isSecureContext: true });
  mockedCollectFingerprint.mockReset();
  mockedPrintSpeedProfile.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fingerprint collector orchestration', () => {
  it('forwards worker and collection options and serializes concurrent calls', async () => {
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint
      .mockImplementationOnce(
        () =>
          new Promise<FingerprintResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(fingerprint);
    const workerUrl = new URL('https://cdn.example.test/libcreep-worker.js');
    const collector = await load({
      worker: { strategy: 'dedicated-only', url: workerUrl },
    });

    const first = collector.collect({ includeWebRtc: true });
    const secondOptions = { timeoutMs: 250 };
    const second = collector.collect(secondOptions);
    secondOptions.timeoutMs = 999;

    await vi.waitFor(() =>
      expect(mockedCollectFingerprint).toHaveBeenCalledOnce(),
    );
    expect(mockedCollectFingerprint).toHaveBeenNthCalledWith(1, {
      includeWebRtc: true,
      signal: undefined,
      timeoutMs: undefined,
      workerStrategy: 'dedicated-only',
      workerUrl: workerUrl.href,
    });

    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
    await expect(second).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenNthCalledWith(2, {
      signal: expect.any(AbortSignal),
      timeoutMs: undefined,
      workerStrategy: 'dedicated-only',
      workerUrl: workerUrl.href,
    });
    expect(collector.libraryVersion).toBe(LIBRARY_VERSION);
    expect(collector.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it('continues the queue after a failed collection', async () => {
    mockedCollectFingerprint
      .mockRejectedValueOnce(new Error('first collection failed'))
      .mockResolvedValueOnce(fingerprint);
    const collector = await load();

    const first = collector.collect();
    const second = collector.collect();

    await expect(first).rejects.toThrow('first collection failed');
    await expect(second).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledTimes(2);
  });

  it('serializes collections across separate collectors', async () => {
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint
      .mockImplementationOnce(
        () =>
          new Promise<FingerprintResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(fingerprint);
    const firstCollector = await load();
    const secondCollector = await load();

    const first = firstCollector.collect();
    const second = secondCollector.collect();
    await vi.waitFor(() =>
      expect(mockedCollectFingerprint).toHaveBeenCalledOnce(),
    );

    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
    await expect(second).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledTimes(2);
  });

  it('rejects an aborted queued call without starting its collection', async () => {
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint.mockImplementationOnce(
      () =>
        new Promise<FingerprintResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const firstCollector = await load();
    const secondCollector = await load();
    const controller = new AbortController();

    const first = firstCollector.collect();
    const second = secondCollector.collect({ signal: controller.signal });
    await vi.waitFor(() =>
      expect(mockedCollectFingerprint).toHaveBeenCalledOnce(),
    );
    controller.abort();

    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockedCollectFingerprint).toHaveBeenCalledOnce();
    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
    await Promise.resolve();
    expect(mockedCollectFingerprint).toHaveBeenCalledOnce();
  });

  it('logs successful debug reports without changing the result', async () => {
    mockedCollectFingerprint.mockResolvedValueOnce(fingerprint);
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    const collector = await load({ debug: true });

    await expect(collector.collect()).resolves.toBe(fingerprint);
    await vi.waitFor(() => expect(debug).toHaveBeenCalledOnce());
    expect(debug.mock.calls[0]?.[0]).toContain(
      `[libcreep ${LIBRARY_VERSION}; algorithm ${ALGORITHM_VERSION}]`,
    );
    expect(debug.mock.calls[0]?.[0]).toContain('\n{}');
  });

  it('does not emit a debug report for failed collection', async () => {
    mockedCollectFingerprint.mockRejectedValueOnce(new Error('probe failed'));
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    const collector = await load({ debug: true });

    await expect(collector.collect()).rejects.toThrow('probe failed');
    await Promise.resolve();
    expect(debug).not.toHaveBeenCalled();
  });

  it('contains failures from detached debug diagnostics', async () => {
    mockedCollectFingerprint.mockResolvedValueOnce(fingerprint);
    vi.spyOn(console, 'debug').mockImplementation(() => {
      throw new Error('blocked console');
    });
    mockedPrintSpeedProfile.mockImplementationOnce(() => {
      throw new Error('blocked profiler');
    });
    const collector = await load({ debug: true });

    await expect(collector.collect()).resolves.toBe(fingerprint);
    await vi.waitFor(() => expect(mockedPrintSpeedProfile).toHaveBeenCalled());
  });

  it('splits load options from one-shot collection options', async () => {
    mockedCollectFingerprint.mockResolvedValueOnce(fingerprint);
    const signal = new AbortController().signal;

    await expect(
      collect({
        debug: false,
        includeWebRtc: true,
        signal,
        timeoutMs: 500,
        worker: {
          strategy: 'service-first',
          url: 'https://cdn.example.test/worker.js',
        },
      }),
    ).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledWith({
      includeWebRtc: true,
      signal: expect.any(AbortSignal),
      timeoutMs: undefined,
      workerStrategy: 'service-first',
      workerUrl: 'https://cdn.example.test/worker.js',
    });
    expect(mockedCollectFingerprint.mock.calls[0]?.[0].signal).not.toBe(signal);
  });

  it('rejects unknown worker strategies instead of silently using auto', async () => {
    await expect(
      load({
        worker: {
          strategy: 'typo' as 'auto',
        },
      }),
    ).rejects.toThrow('Unknown worker strategy: typo');
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('rejects invalid timeouts immediately instead of waiting in the queue', async () => {
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint.mockImplementationOnce(
      () =>
        new Promise<FingerprintResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const collector = await load();
    const first = collector.collect();
    await vi.waitFor(() =>
      expect(mockedCollectFingerprint).toHaveBeenCalledOnce(),
    );

    await expect(collector.collect({ timeoutMs: -1 })).rejects.toThrow(
      'timeoutMs must be a finite number between 0 and 2147483647.',
    );
    await expect(
      collector.collect({ timeoutMs: 2_147_483_648 }),
    ).rejects.toThrow(
      'timeoutMs must be a finite number between 0 and 2147483647.',
    );
    expect(mockedCollectFingerprint).toHaveBeenCalledOnce();

    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
  });

  it('returns a rejected promise when collection options cannot be read', async () => {
    const collector = await load();
    const reason = new TypeError('blocked option enumeration');
    const options = new Proxy({} as CollectionOptions, {
      ownKeys: () => {
        throw reason;
      },
    });

    const operation = collector.collect(options);

    await expect(operation).rejects.toBe(reason);
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('times out while queued without starting the expired collection', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint
      .mockImplementationOnce(
        () =>
          new Promise<FingerprintResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(fingerprint);
    const collector = await load();
    const first = collector.collect();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedCollectFingerprint).toHaveBeenCalledOnce();

    const expired = collector.collect({ timeoutMs: 25 });
    const expiredExpectation = expect(expired).rejects.toMatchObject({
      message: 'Fingerprint collection timed out after 25ms.',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(25);
    await expiredExpectation;
    expect(mockedCollectFingerprint).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
    await expect(collector.collect()).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledTimes(2);
  });

  it('times out one-shot collection while waiting for the document body', async () => {
    vi.useFakeTimers();
    let onReady: (() => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal('document', {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        onReady = listener;
      }),
      body: null,
      removeEventListener,
      readyState: 'loading',
    });

    const operation = collect({ timeoutMs: 40 });
    const operationExpectation = expect(operation).rejects.toMatchObject({
      message: 'Fingerprint collection timed out after 40ms.',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(40);

    await operationExpectation;
    expect(removeEventListener).toHaveBeenCalledWith(
      'DOMContentLoaded',
      onReady,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('cancels a direct load while waiting for the document body', async () => {
    let onReady: (() => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal('document', {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        onReady = listener;
      }),
      body: null,
      removeEventListener,
      readyState: 'loading',
    });
    const controller = new AbortController();

    const operation = load({ signal: controller.signal });
    controller.abort(false);

    await expect(operation).rejects.toBe(false);
    expect(removeEventListener).toHaveBeenCalledWith(
      'DOMContentLoaded',
      onReady,
    );
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('times out a direct load while waiting for the document body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      body: null,
      removeEventListener: vi.fn(),
      readyState: 'loading',
    });

    const operation = load({ timeoutMs: 30 });
    const expectation = expect(operation).rejects.toMatchObject({
      message: 'Fingerprint collection timed out after 30ms.',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(30);

    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets a signal cancel one-shot collection while load waits for the DOM', async () => {
    let onReady: (() => void) | undefined;
    const removeEventListener = vi.fn();
    vi.stubGlobal('document', {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        onReady = listener;
      }),
      body: null,
      removeEventListener,
      readyState: 'loading',
    });
    const controller = new AbortController();

    const operation = collect({ signal: controller.signal });
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(removeEventListener).toHaveBeenCalledWith(
      'DOMContentLoaded',
      onReady,
    );
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('disconnects the body observer when one-shot loading is cancelled', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal('document', {
      body: null,
      documentElement: {},
      removeEventListener: vi.fn(),
      readyState: 'interactive',
    });
    vi.stubGlobal(
      'MutationObserver',
      class {
        disconnect = disconnect;
        observe = vi.fn();
      },
    );
    const controller = new AbortController();

    const operation = collect({ signal: controller.signal });
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(mockedCollectFingerprint).not.toHaveBeenCalled();
  });

  it('waits for DOMContentLoaded when the document body is not ready', async () => {
    let onReady: (() => void) | undefined;
    vi.stubGlobal('document', {
      addEventListener: vi.fn(
        (
          _type: string,
          listener: () => void,
          options: AddEventListenerOptions,
        ) => {
          expect(options).toEqual({ once: true });
          onReady = listener;
        },
      ),
      body: null,
      removeEventListener: vi.fn(),
      readyState: 'loading',
    });

    let settled = false;
    const loading = load().then((collector) => {
      settled = true;
      return collector;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(onReady).toBeTypeOf('function');
    (document as unknown as { body: object | null }).body = {};
    onReady?.();
    await expect(loading).resolves.toMatchObject({
      algorithmVersion: ALGORITHM_VERSION,
      libraryVersion: LIBRARY_VERSION,
    });
  });

  it('waits for a body inserted after DOMContentLoaded', async () => {
    const documentStub = {
      body: null as object | null,
      documentElement: {},
      removeEventListener: vi.fn(),
      readyState: 'interactive',
    };
    const disconnect = vi.fn();
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal(
      'MutationObserver',
      class {
        private readonly callback: MutationCallback;

        constructor(callback: MutationCallback) {
          this.callback = callback;
        }

        disconnect = disconnect;

        observe(): void {
          documentStub.body = {};
          this.callback([], this as unknown as MutationObserver);
        }
      },
    );

    await expect(load()).resolves.toMatchObject({
      algorithmVersion: ALGORITHM_VERSION,
      libraryVersion: LIBRARY_VERSION,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
