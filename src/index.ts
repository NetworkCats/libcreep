import { componentsToDebugString, hashComponents } from './hash.js';
import type {
  BrowserSupport,
  FingerprintAgent,
  FingerprintResult,
  GetOptions,
  LoadOptions,
  WorkerStrategy,
} from './types.js';
import { ALGORITHM_VERSION, VERSION } from './version.js';

declare const __LIBCREEP_DEBUG__: boolean;

export { componentsToDebugString, hashComponents } from './hash.js';
export {
  AUXILIARY_DETECTION_NAMES,
  DEFAULT_AUXILIARY_DETECTION_NAMES,
  DETECTION_NAMES,
  OPT_IN_DETECTION_NAMES,
} from './types.js';
export type * from './hash.js';
export type * from './types.js';
export { ALGORITHM_VERSION, VERSION } from './version.js';

interface RuntimeModule {
  collectFingerprint(
    options: GetOptions & {
      workerStrategy: WorkerStrategy;
      workerUrl: string;
    },
  ): Promise<FingerprintResult>;
}

function assertBrowserEnvironment(): void {
  if (!isBrowserEnvironment()) {
    throw new TypeError(
      'libcreep can collect fingerprints only in a browser window.',
    );
  }
}

function assertSupported(): void {
  if (!getBrowserSupport().webCrypto || typeof TextEncoder === 'undefined') {
    throw new TypeError(
      'libcreep requires the Web Crypto and TextEncoder APIs.',
    );
  }
}

async function waitForDocumentBody(): Promise<void> {
  if (document.body !== null) return;

  await new Promise<void>((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), {
      once: true,
    });
  });
}

/** Reports whether the current environment is a browser window. */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Reports the runtime capabilities relevant to fingerprint collection. */
export function getBrowserSupport(): BrowserSupport {
  const browserEnvironment = isBrowserEnvironment();
  return {
    browserEnvironment,
    secureContext: browserEnvironment && window.isSecureContext,
    webCrypto: typeof crypto !== 'undefined' && crypto.subtle !== undefined,
    workers: browserEnvironment && typeof Worker !== 'undefined',
  };
}

/** Reports whether the minimum APIs required for collection are available. */
export function isSupported(): boolean {
  const support = getBrowserSupport();
  return (
    support.browserEnvironment &&
    support.webCrypto &&
    typeof TextEncoder !== 'undefined'
  );
}

export async function load(
  options: LoadOptions = {},
): Promise<FingerprintAgent> {
  assertBrowserEnvironment();
  assertSupported();
  await waitForDocumentBody();

  const runtime = (await import('./runtime.js')) as RuntimeModule;
  const workerUrl = String(
    options.worker?.url ?? new URL('./worker.js', import.meta.url),
  );
  const workerStrategy = options.worker?.strategy ?? 'auto';
  const debug = options.debug ?? false;
  let queue: Promise<void> = Promise.resolve();

  return {
    algorithmVersion: ALGORITHM_VERSION,
    version: VERSION,
    get(getOptions: GetOptions = {}): Promise<FingerprintResult> {
      const operation = queue.then(() =>
        runtime.collectFingerprint({
          ...getOptions,
          workerStrategy,
          workerUrl,
        }),
      );
      queue = operation.then(
        () => undefined,
        () => undefined,
      );
      if (debug) {
        void operation.then(
          (result) => {
            console.debug(
              `[libcreep ${VERSION}; algorithm ${ALGORITHM_VERSION}]\n${componentsToDebugString(
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
  options: LoadOptions & GetOptions = {},
): Promise<FingerprintResult> {
  const { debug, worker, ...getOptions } = options;
  const agent = await load({ debug, worker });
  return agent.get(getOptions);
}

const LibCreep = Object.freeze({
  algorithmVersion: ALGORITHM_VERSION,
  collect,
  componentsToDebugString,
  getBrowserSupport,
  hashComponents,
  isBrowserEnvironment,
  isSupported,
  load,
  version: VERSION,
});

export default LibCreep;
