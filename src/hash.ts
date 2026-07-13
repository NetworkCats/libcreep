import type { ComponentError, ComponentResult } from './types.js';

export type HashableComponents = Readonly<
  Record<string, ComponentResult<unknown>>
>;

function stringifySafely(value: unknown): string {
  try {
    return String(value);
  } catch {
    return 'Unknown error';
  }
}

function normalizeError(error: unknown): ComponentError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  if (error !== null && typeof error === 'object') {
    const value = error as Partial<ComponentError>;
    return {
      message: stringifySafely(value.message ?? error),
      name: stringifySafely(value.name ?? 'Error'),
      ...(value.stack === undefined
        ? {}
        : { stack: stringifySafely(value.stack) }),
    };
  }
  return { message: stringifySafely(error), name: 'Error' };
}

function getPlainObjectEntries(value: object): Array<[string, unknown]> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== null && prototype !== Object.prototype) {
    throw new TypeError('Cannot hash non-plain object values.');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('Cannot hash symbol-keyed properties.');
  }

  return Object.entries(Object.getOwnPropertyDescriptors(value))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, descriptor]) => {
      if (!descriptor.enumerable) {
        throw new TypeError('Cannot hash non-enumerable properties.');
      }
      if (!('value' in descriptor)) {
        throw new TypeError('Cannot hash accessor properties.');
      }
      return [key, descriptor.value];
    });
}

function canonicalizeArray(
  value: unknown[],
  ancestors: Set<object>,
): unknown[] {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('Cannot hash symbol-keyed properties.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue;
    const index = Number(key);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key
    ) {
      throw new TypeError('Cannot hash extra array properties.');
    }
    if (!descriptor.enumerable) {
      throw new TypeError('Cannot hash non-enumerable properties.');
    }
    if (!('value' in descriptor)) {
      throw new TypeError('Cannot hash accessor properties.');
    }
  }
  return Array.from({ length: value.length }, (_, index) =>
    canonicalize(descriptors[index]?.value, ancestors),
  );
}

function canonicalize(
  value: unknown,
  ancestors: Set<object> = new Set(),
): unknown {
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
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Cannot hash ${typeof value} values.`);
  }
  if (value instanceof Error) return normalizeError(value);
  if (value !== null && typeof value === 'object') {
    if (ancestors.has(value)) {
      throw new TypeError('Cannot hash cyclic values.');
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return canonicalizeArray(value, ancestors);
      }
      return Object.fromEntries(
        getPlainObjectEntries(value).map(([key, entryValue]) => [
          key,
          canonicalize(entryValue, ancestors),
        ]),
      );
    } finally {
      ancestors.delete(value);
    }
  }
  return value;
}

function getHashPayload(components: HashableComponents): unknown {
  return Object.fromEntries(
    getPlainObjectEntries(components).map(([name, component]) => {
      if (component === undefined) return [name, { status: 'unsupported' }];
      if (component === null || typeof component !== 'object') {
        throw new TypeError(`Component "${name}" must be a result object.`);
      }
      const fields = Object.fromEntries(getPlainObjectEntries(component));
      const status = fields.status;
      if (
        status !== 'fulfilled' &&
        status !== 'rejected' &&
        status !== 'skipped' &&
        status !== 'unsupported'
      ) {
        throw new TypeError(`Component "${name}" has an invalid status.`);
      }
      return status === 'fulfilled'
        ? [name, { value: canonicalize(fields.value) }]
        : [name, { status }];
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
  if (json === undefined) {
    throw new TypeError('Cannot hash a value with no JSON representation.');
  }
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Hashes a custom component map using libcreep's canonical SHA-256 format. */
export async function hashComponents(
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
export async function hashValue(value: unknown): Promise<string> {
  return sha256(value);
}
