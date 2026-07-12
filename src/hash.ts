import type { ComponentResult, DetectionError } from './types.js';

export type HashableComponents = Readonly<
  Record<string, ComponentResult<unknown>>
>;

function normalizeError(error: unknown): DetectionError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  if (error !== null && typeof error === 'object') {
    const value = error as Partial<DetectionError>;
    return {
      message: String(value.message ?? error),
      name: String(value.name ?? 'Error'),
      ...(value.stack === undefined ? {} : { stack: String(value.stack) }),
    };
  }
  return { message: String(error), name: 'Error' };
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'bigint') {
    return { $type: 'bigint', value: value.toString() };
  }
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Object.is(value, -0))
  ) {
    return {
      $type: 'number',
      value: Object.is(value, -0) ? '-0' : String(value),
    };
  }
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function getHashPayload(components: HashableComponents): unknown {
  return Object.fromEntries(
    Object.keys(components)
      .sort()
      .map((name) => {
        const component = components[name];
        if (component === undefined) return [name, { status: 'unsupported' }];
        if (component.status === 'fulfilled') {
          return [name, { value: canonicalize(component.value) }];
        }
        return [name, { status: component.status }];
      }),
  );
}

async function sha256(value: unknown): Promise<string> {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.subtle?.digest !== 'function'
  ) {
    throw new TypeError('SHA-256 hashing requires the Web Crypto API.');
  }
  const json = JSON.stringify(canonicalize(value));
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Hashes a custom component map using libcreep's canonical SHA-256 format. */
export function hashComponents(
  components: HashableComponents,
): Promise<string> {
  return sha256(getHashPayload(components));
}

/** Formats component results for diagnostics and support reports. */
export function componentsToDebugString(
  components: Readonly<Record<string, ComponentResult<unknown>>>,
): string {
  return JSON.stringify(
    components,
    (_key, value: unknown) =>
      value instanceof Error
        ? normalizeError(value)
        : typeof value === 'bigint'
          ? { $type: 'bigint', value: value.toString() }
          : typeof value === 'number' &&
              (!Number.isFinite(value) || Object.is(value, -0))
            ? {
                $type: 'number',
                value: Object.is(value, -0) ? '-0' : String(value),
              }
            : value,
    2,
  );
}

/** @internal Hashes arbitrary algorithm data using canonical SHA-256. */
export function hashValue(value: unknown): Promise<string> {
  return sha256(value);
}
