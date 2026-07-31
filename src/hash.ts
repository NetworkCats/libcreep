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

interface PropertyRead {
  readonly succeeded: boolean;
  readonly value?: unknown;
}

function readPropertySafely(value: object, key: PropertyKey): PropertyRead {
  try {
    return { succeeded: true, value: Reflect.get(value, key) };
  } catch {
    return { succeeded: false };
  }
}

const BUILTIN_ERROR_CONSTRUCTOR_SOURCES = new Set(
  [
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
  ]
    .map((constructor) => {
      try {
        return Function.prototype.toString.call(constructor);
      } catch {
        return undefined;
      }
    })
    .filter((source): source is string => source !== undefined),
);

const DOM_EXCEPTION_NAME_GETTER = (() => {
  try {
    return typeof DOMException === 'function'
      ? Object.getOwnPropertyDescriptor(DOMException.prototype, 'name')?.get
      : undefined;
  } catch {
    return undefined;
  }
})();

function hasBuiltinErrorPrototype(value: object): boolean {
  const visited = new Set<object>();
  let current: object | null = value;
  try {
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      const constructor = Object.getOwnPropertyDescriptor(
        current,
        'constructor',
      );
      if (
        constructor !== undefined &&
        'value' in constructor &&
        typeof constructor.value === 'function' &&
        BUILTIN_ERROR_CONSTRUCTOR_SOURCES.has(
          Function.prototype.toString.call(constructor.value),
        )
      ) {
        return true;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return false;
  }
  return false;
}

function hasToStringTagInPrototypeChain(value: object): boolean {
  const visited = new Set<object>();
  let current: object | null = value;
  try {
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      if (
        Object.getOwnPropertyDescriptor(current, Symbol.toStringTag) !==
        undefined
      ) {
        return true;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return true;
  }
  return false;
}

function isErrorObject(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  if (DOM_EXCEPTION_NAME_GETTER !== undefined) {
    try {
      DOM_EXCEPTION_NAME_GETTER.call(value);
      return true;
    } catch {
      // It is not a platform DOMException with the required internal slots.
    }
  }
  if (hasToStringTagInPrototypeChain(value)) return false;
  try {
    return (
      Object.prototype.toString.call(value) === '[object Error]' &&
      hasBuiltinErrorPrototype(value)
    );
  } catch {
    return false;
  }
}

/** @internal Normalizes thrown values without trusting their property getters. */
export function normalizeError(error: unknown): ComponentError {
  if (error !== null && typeof error === 'object') {
    const recognizedError = isErrorObject(error);
    const message = readPropertySafely(error, 'message');
    const name = readPropertySafely(error, 'name');
    const stack = readPropertySafely(error, 'stack');
    return {
      message:
        message.succeeded && message.value !== undefined
          ? stringifySafely(message.value)
          : recognizedError
            ? 'Unknown error'
            : stringifySafely(error),
      name:
        name.succeeded && name.value !== undefined
          ? stringifySafely(name.value)
          : 'Error',
      ...(!stack.succeeded || stack.value === undefined
        ? {}
        : { stack: stringifySafely(stack.value) }),
    };
  }
  return { message: stringifySafely(error), name: 'Error' };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value: object): boolean {
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
  } catch {
    return false;
  }
  if (prototype === null || prototype === Object.prototype) return true;

  let constructor: PropertyDescriptor | undefined;
  try {
    constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
  } catch {
    return false;
  }
  if (
    constructor === undefined ||
    !('value' in constructor) ||
    typeof constructor.value !== 'function'
  ) {
    return false;
  }
  try {
    return (
      constructor.value.prototype === prototype &&
      Function.prototype.toString.call(constructor.value) ===
        Function.prototype.toString.call(Object)
    );
  } catch {
    return false;
  }
}

function getPlainObjectEntries(value: object): Array<[string, unknown]> {
  if (!isPlainObject(value)) {
    throw new TypeError('Cannot hash non-plain object values.');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('Cannot hash symbol-keyed properties.');
  }

  return Object.entries(Object.getOwnPropertyDescriptors(value))
    .sort(([left], [right]) => compareCodeUnits(left, right))
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
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    return descriptor === undefined
      ? { $type: 'array-hole' }
      : canonicalize(descriptor.value, ancestors);
  });
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
  if (value !== null && typeof value === 'object') {
    let symbols: symbol[];
    try {
      symbols = Object.getOwnPropertySymbols(value);
    } catch {
      throw new TypeError('Cannot inspect symbol-keyed properties.');
    }
    if (symbols.length > 0) {
      throw new TypeError('Cannot hash symbol-keyed properties.');
    }
    if (isErrorObject(value)) {
      return { $type: 'error', value: normalizeError(value) };
    }
    if (ancestors.has(value)) {
      throw new TypeError('Cannot hash cyclic values.');
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return canonicalizeArray(value, ancestors);
      }
      const object = Object.fromEntries(
        getPlainObjectEntries(value).map(([key, entryValue]) => [
          key,
          canonicalize(entryValue, ancestors),
        ]),
      );
      // `$type` is reserved for canonical representations of values that JSON
      // cannot encode. Escape user objects with that key so they cannot collide
      // with undefined, bigint, special numbers, Error, or array-hole tags.
      return Object.hasOwn(object, '$type')
        ? { $type: 'object', value: object }
        : object;
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
      if (status === 'fulfilled' && !Object.hasOwn(fields, 'value')) {
        throw new TypeError(
          `Fulfilled component "${name}" must contain a value.`,
        );
      }
      return status === 'fulfilled'
        ? [name, { value: fields.value }]
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
      value === undefined
        ? { $type: 'undefined' }
        : isErrorObject(value)
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
