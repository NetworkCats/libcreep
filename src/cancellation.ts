import { LibCreepError } from './errors.js';

/** @internal Shared abort and timeout plumbing for the API and runtime. */
export interface OperationCancellation {
  readonly dispose: () => void;
  readonly signal?: AbortSignal;
}

const MAX_TIMEOUT_MS = 2_147_483_647;

export function getAbortReason(signal: AbortSignal): unknown {
  return 'reason' in signal
    ? signal.reason
    : new DOMException('Fingerprint collection was aborted.', 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw getAbortReason(signal);
}

export function rejectWhenAborted<T>(
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

export function validateTimeout(timeoutMs: number | undefined): void {
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMEOUT_MS)
  ) {
    throw new LibCreepError(
      'INVALID_OPTION',
      `timeoutMs must be a finite number between 0 and ${MAX_TIMEOUT_MS}.`,
    );
  }
}

/** Combines an optional caller signal and timeout into one owned signal. */
export function createOperationCancellation(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): OperationCancellation {
  validateTimeout(timeoutMs);
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
