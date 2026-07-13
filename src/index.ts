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

let collectionQueue: Promise<void> = Promise.resolve();

function getAbortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException('Fingerprint collection was aborted.', 'AbortError')
  );
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

async function waitForDocumentBody(): Promise<void> {
  if (document.body !== null) return;

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      document.addEventListener('DOMContentLoaded', () => resolve(), {
        once: true,
      });
    });
    if (document.body !== null) return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled || document.body === null) return;
      settled = true;
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      finish();
    });
    observer.observe(document.documentElement ?? document, {
      childList: true,
      subtree: true,
    });
    finish();
  });
}

function getDefaultWorkerUrl(): string {
  // Keep the worker entry external. Passing import.meta.url directly to
  // new URL() makes Vite treat worker.js as a source asset and inline the
  // unbuilt TypeScript entry instead of referencing dist/worker.js.
  const moduleUrl = import.meta.url;
  return new URL('./worker.js', moduleUrl).href;
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

/** Reports whether the current environment is a browser window. */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Reports the runtime capabilities relevant to fingerprint collection. */
export function getBrowserCapabilities(): BrowserCapabilities {
  const isBrowser = isBrowserEnvironment();
  return {
    hasDedicatedWorker: isBrowser && typeof Worker !== 'undefined',
    hasServiceWorker:
      isBrowser &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator,
    hasSharedWorker: isBrowser && typeof SharedWorker !== 'undefined',
    hasTextEncoder: typeof TextEncoder !== 'undefined',
    hasWebCrypto:
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle?.digest === 'function',
    isBrowser,
    isSecureContext: isBrowser && window.isSecureContext === true,
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

export async function load(
  options: LoadOptions = {},
): Promise<FingerprintCollector> {
  assertBrowserEnvironment();
  assertSupported();
  await waitForDocumentBody();

  const runtime = (await import('./runtime.js')) as RuntimeModule;
  const workerUrl = String(options.worker?.url ?? getDefaultWorkerUrl());
  const workerStrategy = getWorkerStrategy(options.worker?.strategy);
  const debug = options.debug ?? false;
  return {
    algorithmVersion: ALGORITHM_VERSION,
    libraryVersion: LIBRARY_VERSION,
    collect(
      collectionOptions: CollectionOptions = {},
    ): Promise<FingerprintResult> {
      const queuedOperation = collectionQueue.then(() => {
        throwIfAborted(collectionOptions.signal);
        return runtime.collectFingerprint({
          ...collectionOptions,
          workerStrategy,
          workerUrl,
        });
      });
      collectionQueue = queuedOperation.then(
        () => undefined,
        () => undefined,
      );
      const operation = rejectWhenAborted(
        queuedOperation,
        collectionOptions.signal,
      );
      if (debug) {
        void operation.then(
          (result) => {
            console.debug(
              `[libcreep ${LIBRARY_VERSION}; algorithm ${ALGORITHM_VERSION}]\n${componentsToDebugString(
                result.components,
              )}`,
            );
            if (__LIBCREEP_DEBUG__) {
              void import('./internal/debug/profile.js').then(
                ({ printSpeedProfile }) => printSpeedProfile(result),
                () => undefined,
              );
            }
          },
          () => undefined,
        );
      }
      return operation;
    },
  };
}

export async function collect(
  options: CollectOptions = {},
): Promise<FingerprintResult> {
  const { debug, worker, ...collectionOptions } = options;
  const collector = await load({ debug, worker });
  return collector.collect(collectionOptions);
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
