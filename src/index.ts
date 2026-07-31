import { componentsToDebugString, hashComponents } from './hash.js';
import type {
  BrowserCapabilities,
  CollectionOptions,
  CollectOptions,
  FingerprintCollector,
  FingerprintResult,
  LoadOptions,
  WorkerStrategy,
} from './types.js';
import { ALGORITHM_VERSION, LIBRARY_VERSION } from './version.js';

declare const __LIBCREEP_DEBUG__: boolean;

export { componentsToDebugString, hashComponents } from './hash.js';
export {
  AUXILIARY_COMPONENT_NAMES,
  BOT_RULE_NAMES,
  CORE_COMPONENT_NAMES,
  DEFAULT_AUXILIARY_COMPONENT_NAMES,
  OPT_IN_AUXILIARY_COMPONENT_NAMES,
} from './types.js';
export type * from './hash.js';
export type * from './types.js';
export { ALGORITHM_VERSION, LIBRARY_VERSION } from './version.js';

interface RuntimeModule {
  collectFingerprint(
    options: CollectionOptions & {
      workerStrategy: WorkerStrategy;
      workerUrl: string;
    },
  ): Promise<FingerprintResult>;
}

interface OperationCancellation {
  readonly dispose: () => void;
  readonly signal?: AbortSignal;
}

let collectionQueue: Promise<void> = Promise.resolve();
const MAX_TIMEOUT_MS = 2_147_483_647;

function getAbortReason(signal: AbortSignal): unknown {
  return 'reason' in signal
    ? signal.reason
    : new DOMException('Fingerprint collection was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw getAbortReason(signal);
}

function rejectWhenAborted<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal === undefined) return operation;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): boolean => {
      if (settled) return false;
      settled = true;
      signal.removeEventListener('abort', abort);
      return true;
    };
    const abort = (): void => {
      if (cleanup()) reject(getAbortReason(signal));
    };

    void operation.then(
      (value) => {
        if (cleanup()) resolve(value);
      },
      (error: unknown) => {
        if (cleanup()) reject(error);
      },
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function isObjectLike(value: unknown): value is object {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function')
  );
}

function readPropertySafely(target: unknown, key: PropertyKey): unknown {
  if (!isObjectLike(target)) return undefined;
  try {
    return Reflect.get(target, key);
  } catch {
    return undefined;
  }
}

function assertBrowserEnvironment(): void {
  if (!isBrowserEnvironment()) {
    throw new TypeError(
      'libcreep can collect fingerprints only in a browser window.',
    );
  }
}

function assertSupported(): void {
  const capabilities = getBrowserCapabilities();
  if (!capabilities.hasWebCrypto || !capabilities.hasTextEncoder) {
    throw new TypeError(
      'libcreep requires the Web Crypto and TextEncoder APIs.',
    );
  }
}

async function waitForDocumentBody(signal?: AbortSignal): Promise<void> {
  if (document.body !== null) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let observer: MutationObserver | undefined;
    const cleanup = (): void => {
      document.removeEventListener('DOMContentLoaded', onContentLoaded);
      signal?.removeEventListener('abort', onAbort);
      observer?.disconnect();
    };
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const checkBody = (): boolean => {
      if (document.body === null) return false;
      finish();
      return true;
    };
    const observe = (): void => {
      if (settled || observer !== undefined || checkBody()) return;
      try {
        observer = new MutationObserver(() => {
          checkBody();
        });
        observer.observe(document.documentElement ?? document, {
          childList: true,
          subtree: true,
        });
        checkBody();
      } catch (error) {
        finish(error);
      }
    };
    const onContentLoaded = (): void => {
      if (!checkBody()) observe();
    };
    const onAbort = (): void => {
      finish(getAbortReason(signal as AbortSignal));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onContentLoaded, {
        once: true,
      });
      checkBody();
    } else {
      observe();
    }
  });
}

function getDefaultWorkerUrl(): string {
  // Keep the worker entry external. Passing import.meta.url directly to
  // new URL() makes Vite treat worker.js as a source asset and inline the
  // unbuilt TypeScript entry instead of referencing dist/worker.js.
  const workerModuleUrl = import.meta.url;
  return new URL('./worker.js', workerModuleUrl).href;
}

function getWorkerStrategy(
  strategy: WorkerStrategy | undefined,
): WorkerStrategy {
  const value = strategy ?? 'auto';
  if (
    value !== 'auto' &&
    value !== 'dedicated-only' &&
    value !== 'service-first'
  ) {
    throw new TypeError(`Unknown worker strategy: ${String(value)}`);
  }
  return value;
}

function validateOperationOptions(options: {
  readonly timeoutMs?: number;
}): void {
  const { timeoutMs } = options;
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMEOUT_MS)
  ) {
    throw new TypeError(
      `timeoutMs must be a finite number between 0 and ${MAX_TIMEOUT_MS}.`,
    );
  }
}

function createOperationCancellation(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): OperationCancellation {
  if (signal === undefined && timeoutMs === undefined) {
    return { dispose: () => undefined };
  }

  const controller = new AbortController();
  const forwardAbort = (): void => {
    controller.abort(signal?.reason);
  };
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  const timeout =
    timeoutMs === undefined || controller.signal.aborted
      ? undefined
      : globalThis.setTimeout(() => {
          controller.abort(
            new DOMException(
              `Fingerprint collection timed out after ${timeoutMs}ms.`,
              'TimeoutError',
            ),
          );
        }, timeoutMs);

  return {
    signal: controller.signal,
    dispose(): void {
      signal?.removeEventListener('abort', forwardAbort);
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
    },
  };
}

/** Reports whether the current environment is a browser window. */
export function isBrowserEnvironment(): boolean {
  return (
    isObjectLike(readPropertySafely(globalThis, 'window')) &&
    isObjectLike(readPropertySafely(globalThis, 'document'))
  );
}

/** Reports the runtime capabilities relevant to fingerprint collection. */
export function getBrowserCapabilities(): BrowserCapabilities {
  const isBrowser = isBrowserEnvironment();
  const browserWindow = readPropertySafely(globalThis, 'window');
  const browserNavigator = readPropertySafely(globalThis, 'navigator');
  const serviceWorker = readPropertySafely(browserNavigator, 'serviceWorker');
  const webCrypto = readPropertySafely(globalThis, 'crypto');
  const subtleCrypto = readPropertySafely(webCrypto, 'subtle');
  return {
    hasDedicatedWorker:
      isBrowser &&
      typeof readPropertySafely(globalThis, 'Worker') === 'function',
    hasServiceWorker: isBrowser && isObjectLike(serviceWorker),
    hasSharedWorker:
      isBrowser &&
      typeof readPropertySafely(globalThis, 'SharedWorker') === 'function',
    hasTextEncoder:
      typeof readPropertySafely(globalThis, 'TextEncoder') === 'function',
    hasWebCrypto:
      typeof readPropertySafely(subtleCrypto, 'digest') === 'function',
    isBrowser,
    isSecureContext:
      isBrowser &&
      readPropertySafely(browserWindow, 'isSecureContext') === true,
  };
}

/** Reports whether the minimum APIs required for collection are available. */
export function isFingerprintingSupported(): boolean {
  const capabilities = getBrowserCapabilities();
  return (
    capabilities.isBrowser &&
    capabilities.hasTextEncoder &&
    capabilities.hasWebCrypto
  );
}

async function loadCollector(
  options: LoadOptions = {},
  signal?: AbortSignal,
): Promise<FingerprintCollector> {
  throwIfAborted(signal);
  assertBrowserEnvironment();
  assertSupported();
  const workerUrl = String(options.worker?.url ?? getDefaultWorkerUrl());
  const workerStrategy = getWorkerStrategy(options.worker?.strategy);
  const debug = options.debug ?? false;
  await waitForDocumentBody(signal);
  throwIfAborted(signal);

  const runtime = (await rejectWhenAborted(
    import('./runtime.js'),
    signal,
  )) as RuntimeModule;
  return {
    algorithmVersion: ALGORITHM_VERSION,
    libraryVersion: LIBRARY_VERSION,
    collect(
      collectionOptions: CollectionOptions = {},
    ): Promise<FingerprintResult> {
      let optionSnapshot: CollectionOptions;
      let cancellation: OperationCancellation;
      try {
        optionSnapshot = { ...collectionOptions };
        validateOperationOptions(optionSnapshot);
        cancellation = createOperationCancellation(
          optionSnapshot.signal,
          optionSnapshot.timeoutMs,
        );
      } catch (error) {
        return Promise.reject(error);
      }
      const queuedOperation = collectionQueue.then(() => {
        throwIfAborted(cancellation.signal);
        return runtime.collectFingerprint({
          ...optionSnapshot,
          signal: cancellation.signal,
          timeoutMs: undefined,
          workerStrategy,
          workerUrl,
        });
      });
      collectionQueue = queuedOperation.then(
        () => undefined,
        () => undefined,
      );
      const operation = rejectWhenAborted(queuedOperation, cancellation.signal);
      const finalizedOperation = operation.then(
        (result) => {
          cancellation.dispose();
          return result;
        },
        (error: unknown) => {
          cancellation.dispose();
          throw error;
        },
      );
      if (debug) {
        void finalizedOperation.then(
          (result) => {
            try {
              console.debug(
                `[libcreep ${LIBRARY_VERSION}; algorithm ${ALGORITHM_VERSION}]\n${componentsToDebugString(
                  result.components,
                )}`,
              );
            } catch {
              // Diagnostics must never affect collection or leak a rejection.
            }
            if (__LIBCREEP_DEBUG__) {
              void import('./internal/debug/profile.js').then(
                ({ printSpeedProfile }) => {
                  try {
                    printSpeedProfile(result);
                  } catch {
                    // Development profiling is also a detached diagnostic.
                  }
                },
                () => undefined,
              );
            }
          },
          () => undefined,
        );
      }
      return finalizedOperation;
    },
  };
}

export async function load(
  options: LoadOptions = {},
): Promise<FingerprintCollector> {
  validateOperationOptions(options);
  const cancellation = createOperationCancellation(
    options.signal,
    options.timeoutMs,
  );
  try {
    return await loadCollector(options, cancellation.signal);
  } finally {
    cancellation.dispose();
  }
}

export async function collect(
  options: CollectOptions = {},
): Promise<FingerprintResult> {
  const { debug, worker, ...collectionOptions } = options;
  validateOperationOptions(collectionOptions);
  const cancellation = createOperationCancellation(
    collectionOptions.signal,
    collectionOptions.timeoutMs,
  );
  try {
    throwIfAborted(cancellation.signal);
    const collector = await loadCollector(
      { debug, worker },
      cancellation.signal,
    );
    return await collector.collect({
      ...collectionOptions,
      signal: cancellation.signal,
      timeoutMs: undefined,
    });
  } finally {
    cancellation.dispose();
  }
}

const LibCreep = Object.freeze({
  algorithmVersion: ALGORITHM_VERSION,
  collect,
  componentsToDebugString,
  getBrowserCapabilities,
  hashComponents,
  isBrowserEnvironment,
  isFingerprintingSupported,
  load,
  libraryVersion: LIBRARY_VERSION,
});

export default LibCreep;
