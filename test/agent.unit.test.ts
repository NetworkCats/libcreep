import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALGORITHM_VERSION,
  collect,
  load,
  VERSION,
  type FingerprintResult,
} from '../src/index.js';
import { collectFingerprint } from '../src/runtime.js';

vi.mock('../src/runtime.js', () => ({
  collectFingerprint: vi.fn(),
}));

const mockedCollectFingerprint = vi.mocked(collectFingerprint);
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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fingerprint agent orchestration', () => {
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
    const agent = await load({
      worker: { strategy: 'dedicated', url: workerUrl },
    });

    const first = agent.get({ includeWebRTC: true });
    const second = agent.get({ timeoutMs: 250 });

    await vi.waitFor(() =>
      expect(mockedCollectFingerprint).toHaveBeenCalledOnce(),
    );
    expect(mockedCollectFingerprint).toHaveBeenNthCalledWith(1, {
      includeWebRTC: true,
      workerStrategy: 'dedicated',
      workerUrl: workerUrl.href,
    });

    resolveFirst(fingerprint);
    await expect(first).resolves.toBe(fingerprint);
    await expect(second).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenNthCalledWith(2, {
      timeoutMs: 250,
      workerStrategy: 'dedicated',
      workerUrl: workerUrl.href,
    });
    expect(agent.version).toBe(VERSION);
    expect(agent.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it('continues the queue after a failed collection', async () => {
    mockedCollectFingerprint
      .mockRejectedValueOnce(new Error('first collection failed'))
      .mockResolvedValueOnce(fingerprint);
    const agent = await load();

    const first = agent.get();
    const second = agent.get();

    await expect(first).rejects.toThrow('first collection failed');
    await expect(second).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledTimes(2);
  });

  it('serializes collections across separate agents', async () => {
    let resolveFirst!: (result: FingerprintResult) => void;
    mockedCollectFingerprint
      .mockImplementationOnce(
        () =>
          new Promise<FingerprintResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(fingerprint);
    const firstAgent = await load();
    const secondAgent = await load();

    const first = firstAgent.get();
    const second = secondAgent.get();
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
    const firstAgent = await load();
    const secondAgent = await load();
    const controller = new AbortController();

    const first = firstAgent.get();
    const second = secondAgent.get({ signal: controller.signal });
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
    const agent = await load({ debug: true });

    await expect(agent.get()).resolves.toBe(fingerprint);
    await vi.waitFor(() => expect(debug).toHaveBeenCalledOnce());
    expect(debug.mock.calls[0]?.[0]).toContain(
      `[libcreep ${VERSION}; algorithm ${ALGORITHM_VERSION}]`,
    );
    expect(debug.mock.calls[0]?.[0]).toContain('\n{}');
  });

  it('does not emit a debug report for failed collection', async () => {
    mockedCollectFingerprint.mockRejectedValueOnce(new Error('probe failed'));
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    const agent = await load({ debug: true });

    await expect(agent.get()).rejects.toThrow('probe failed');
    await Promise.resolve();
    expect(debug).not.toHaveBeenCalled();
  });

  it('splits load options from one-shot collection options', async () => {
    mockedCollectFingerprint.mockResolvedValueOnce(fingerprint);
    const signal = new AbortController().signal;

    await expect(
      collect({
        debug: false,
        includeWebRTC: true,
        signal,
        timeoutMs: 500,
        worker: {
          strategy: 'shared-first',
          url: 'https://cdn.example.test/worker.js',
        },
      }),
    ).resolves.toBe(fingerprint);
    expect(mockedCollectFingerprint).toHaveBeenCalledWith({
      includeWebRTC: true,
      signal,
      timeoutMs: 500,
      workerStrategy: 'shared-first',
      workerUrl: 'https://cdn.example.test/worker.js',
    });
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
      readyState: 'loading',
    });

    let settled = false;
    const loading = load().then((agent) => {
      settled = true;
      return agent;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(onReady).toBeTypeOf('function');
    (document as unknown as { body: object | null }).body = {};
    onReady?.();
    await expect(loading).resolves.toMatchObject({
      algorithmVersion: ALGORITHM_VERSION,
      version: VERSION,
    });
  });

  it('waits for a body inserted after DOMContentLoaded', async () => {
    const documentStub = {
      body: null as object | null,
      documentElement: {},
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
      version: VERSION,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
