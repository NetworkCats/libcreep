import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadWorkerDetector(): Promise<
  typeof import('../src/internal/worker/index.js')
> {
  const navigatorStub = {
    hardwareConcurrency: 8,
    language: 'en-US',
    languages: ['en-US'],
    platform: 'Test',
    userAgent: 'test-agent',
  };
  vi.stubGlobal('navigator', navigatorStub);
  vi.stubGlobal('self', { document: {}, navigator: navigatorStub });
  vi.stubGlobal('window', {});
  vi.stubGlobal('speechSynthesis', { getVoices: vi.fn(() => []) });
  vi.resetModules();
  return import('../src/internal/worker/index.js');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('worker transport cleanup', () => {
  it('preserves structured language data from a dedicated worker', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const terminate = vi.fn();
    const worker: {
      onerror?: () => void;
      onmessage?: (event: { data: Record<string, unknown> }) => void;
      onmessageerror?: () => void;
      postMessage: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
    } = {
      postMessage: vi.fn(),
      terminate,
    };
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return worker;
        }
      },
    );

    const pendingResult = getBestWorkerScope(
      '/worker.js',
      'dedicated-only',
      undefined,
    );
    await vi.advanceTimersByTimeAsync(0);
    worker.onmessage?.({
      data: {
        hardwareConcurrency: 8,
        language: 'en-US',
        languages: ['en-US'],
        lied: false,
        lies: { proto: false },
        platform: 'Test',
        userAgent: 'test-agent',
      },
    });

    const result = await pendingResult;
    expect(result?.languages).toEqual(['en-US']);
    expect(terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a dedicated worker even when prototype inspection throws', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const terminate = vi.fn();
    const worker = {
      postMessage: vi.fn(),
      terminate,
    };
    Object.defineProperty(worker, '__proto__', {
      get() {
        throw new Error('prototype access blocked');
      },
    });
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return worker;
        }
      },
    );

    const result = getBestWorkerScope(
      '/worker.js',
      'dedicated-only',
      undefined,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('closes a shared-worker port even when prototype inspection throws', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const close = vi.fn();
    const sharedWorker = {
      port: {
        close,
        postMessage: vi.fn(),
        start: vi.fn(),
      },
    };
    Object.defineProperty(sharedWorker, '__proto__', {
      get() {
        throw new Error('prototype access blocked');
      },
    });
    vi.stubGlobal(
      'SharedWorker',
      class {
        constructor() {
          return sharedWorker;
        }
      },
    );
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('dedicated worker unavailable');
        }
      },
    );

    const result = getBestWorkerScope('/worker.js', 'auto', undefined);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it('preserves a falsy abort reason while terminating the worker', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const terminate = vi.fn();
    const worker = { postMessage: vi.fn(), terminate };
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return worker;
        }
      },
    );
    const controller = new AbortController();

    const result = getBestWorkerScope(
      '/worker.js',
      'dedicated-only',
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(false);

    await expect(result).rejects.toBe(false);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('cleans up when service-worker registration throws synchronously', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const removeEventListener = vi.fn();
    const register = vi.fn(() => {
      throw new Error('registration blocked');
    });
    Object.assign(navigator, {
      serviceWorker: {
        addEventListener: vi.fn(),
        register,
        removeEventListener,
      },
    });
    vi.stubGlobal('location', { href: 'https://example.test/page' });
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );

    const result = getBestWorkerScope(
      '/worker.js',
      'service-first',
      controller.signal,
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
    expect(removeAbortListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a never-settling registration and unregisters it if it appears later', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    let resolveRegistration!: (registration: object) => void;
    let resolveUnregister!: (result: boolean) => void;
    const unregister = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveUnregister = resolve;
        }),
    );
    const register = vi.fn(
      () =>
        new Promise<object>((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    Object.assign(navigator, {
      serviceWorker: {
        addEventListener: vi.fn(),
        register,
        removeEventListener: vi.fn(),
      },
    });
    vi.stubGlobal('location', { href: 'https://example.test/page' });

    let finished = false;
    const result = getBestWorkerScope(
      '/worker.js',
      'service-first',
      undefined,
    ).then((value) => {
      finished = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(finished).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBeUndefined();
    expect(finished).toBe(true);

    resolveRegistration({
      active: null,
      installing: null,
      unregister,
      waiting: null,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(unregister).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    resolveUnregister(true);
  });

  it('bounds a never-settling service-worker unregister', async () => {
    vi.useFakeTimers();
    const { default: getBestWorkerScope } = await loadWorkerDetector();
    const unregister = vi.fn(() => new Promise<never>(() => undefined));
    const register = vi.fn(async () => ({
      active: null,
      installing: null,
      unregister,
      waiting: null,
    }));
    Object.assign(navigator, {
      serviceWorker: {
        addEventListener: vi.fn(),
        register,
        removeEventListener: vi.fn(),
      },
    });
    vi.stubGlobal('location', { href: 'https://example.test/page' });

    const result = getBestWorkerScope('/worker.js', 'service-first', undefined);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
