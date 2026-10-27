/** Machine-readable reasons for libcreep's own load and collection failures. */
export type LibCreepErrorCode =
  /** `load()` or `collect()` ran outside a browser window. */
  | 'NOT_BROWSER'
  /** The browser lacks a minimum API such as Web Crypto or `TextEncoder`. */
  | 'UNSUPPORTED_ENVIRONMENT'
  /** An option value is outside its documented range or set. */
  | 'INVALID_OPTION';

/**
 * Error thrown for environment and option failures. Cancellation and timeouts
 * keep their platform `DOMException` (or `signal.reason`) instead.
 */
export class LibCreepError extends Error {
  readonly code: LibCreepErrorCode;

  constructor(code: LibCreepErrorCode, message: string) {
    super(message);
    this.name = 'LibCreepError';
    this.code = code;
  }
}
