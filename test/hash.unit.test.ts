import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  componentsToDebugString,
  hashComponents,
  type HashableComponents,
} from '../src/hash.js';

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canonical component hashing', () => {
  it('sorts component and value keys and encodes non-JSON primitives', async () => {
    const components = {
      missing: undefined,
      rejected: {
        durationMs: 12,
        error: { message: 'private detail', name: 'TypeError' },
        status: 'rejected',
      },
      value: {
        durationMs: 7,
        status: 'fulfilled',
        value: {
          z: undefined,
          a: [1, Number.NaN, Infinity, -Infinity, 2n],
        },
      },
      unsupported: { durationMs: 3, status: 'unsupported' },
    } as unknown as HashableComponents;

    const expectedPayload = {
      missing: { status: 'unsupported' },
      rejected: { status: 'rejected' },
      unsupported: { status: 'unsupported' },
      value: {
        value: {
          a: [
            1,
            { $type: 'number', value: 'NaN' },
            { $type: 'number', value: 'Infinity' },
            { $type: 'number', value: '-Infinity' },
            { $type: 'bigint', value: '2' },
          ],
          z: { $type: 'undefined' },
        },
      },
    };

    await expect(hashComponents(components)).resolves.toBe(
      sha256Json(expectedPayload),
    );
  });

  it('ignores timing and error details but distinguishes result statuses', async () => {
    const first = {
      sample: {
        durationMs: 1,
        error: { message: 'first failure', name: 'Error' },
        status: 'rejected',
      },
    } as HashableComponents;
    const second = {
      sample: {
        durationMs: 999,
        error: { message: 'different failure', name: 'RangeError' },
        status: 'rejected',
      },
    } as HashableComponents;
    const skipped = {
      sample: { durationMs: 1, status: 'skipped' },
    } as HashableComponents;

    await expect(hashComponents(first)).resolves.toBe(
      await hashComponents(second),
    );
    await expect(hashComponents(first)).resolves.not.toBe(
      await hashComponents(skipped),
    );
  });

  it('distinguishes negative zero from positive zero', async () => {
    const negativeZero = {
      sample: { durationMs: 1, status: 'fulfilled', value: -0 },
    } as HashableComponents;
    const positiveZero = {
      sample: { durationMs: 1, status: 'fulfilled', value: 0 },
    } as HashableComponents;

    await expect(hashComponents(negativeZero)).resolves.toBe(
      sha256Json({
        sample: { value: { $type: 'number', value: '-0' } },
      }),
    );
    await expect(hashComponents(negativeZero)).resolves.not.toBe(
      await hashComponents(positiveZero),
    );
  });

  it('normalizes Error values with stable diagnostic fields', async () => {
    const error = new TypeError('bad component value');
    error.stack = 'fixture stack';
    const components = {
      sample: { durationMs: 1, status: 'fulfilled', value: error },
    } as HashableComponents;

    await expect(hashComponents(components)).resolves.toBe(
      sha256Json({
        sample: {
          value: {
            message: 'bad component value',
            name: 'TypeError',
            stack: 'fixture stack',
          },
        },
      }),
    );
  });

  it('rejects cyclic and unsupported values instead of hashing collisions', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    await expect(
      hashComponents({
        sample: {
          durationMs: 1,
          status: 'fulfilled',
          value: cyclic,
        },
      }),
    ).rejects.toThrow('Cannot hash cyclic values.');
    await expect(
      hashComponents({
        sample: {
          durationMs: 1,
          status: 'fulfilled',
          value: () => undefined,
        },
      }),
    ).rejects.toThrow('Cannot hash function values.');
    await expect(
      hashComponents({
        sample: {
          durationMs: 1,
          status: 'fulfilled',
          value: new Date(0),
        },
      }),
    ).rejects.toThrow('Cannot hash non-plain object values.');
  });

  it('rejects properties that canonical JSON would otherwise ignore', async () => {
    const withExtraProperty = [1] as number[] & { label?: string };
    withExtraProperty.label = 'ignored';
    const withAccessor = {} as { value?: number };
    Object.defineProperty(withAccessor, 'value', {
      enumerable: true,
      get: () => 1,
    });
    const withHiddenProperty = {} as { hidden?: number };
    Object.defineProperty(withHiddenProperty, 'hidden', { value: 1 });

    const hashValue = (value: unknown) =>
      hashComponents({
        sample: { durationMs: 1, status: 'fulfilled', value },
      });

    await expect(hashValue(withExtraProperty)).rejects.toThrow(
      'Cannot hash extra array properties.',
    );
    await expect(hashValue(withAccessor)).rejects.toThrow(
      'Cannot hash accessor properties.',
    );
    await expect(hashValue(withHiddenProperty)).rejects.toThrow(
      'Cannot hash non-enumerable properties.',
    );
  });

  it('validates the component map at runtime', async () => {
    await expect(
      hashComponents({
        sample: { status: 'unknown' },
      } as unknown as HashableComponents),
    ).rejects.toThrow('Component "sample" has an invalid status.');
    await expect(
      hashComponents({ sample: null } as unknown as HashableComponents),
    ).rejects.toThrow('Component "sample" must be a result object.');
  });

  it('fails clearly when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);

    await expect(hashComponents({})).rejects.toThrow(
      'SHA-256 hashing requires the Web Crypto API.',
    );
  });

  it('fails clearly when Web Crypto has no digest implementation', async () => {
    vi.stubGlobal('crypto', { subtle: {} });

    await expect(hashComponents({})).rejects.toThrow(
      'SHA-256 hashing requires the Web Crypto API.',
    );
  });
});

describe('component diagnostics', () => {
  it('serializes Error objects without losing their useful fields', () => {
    const error = new RangeError('outside range');
    error.stack = 'diagnostic stack';
    const components = {
      sample: { durationMs: 4, status: 'fulfilled', value: { error } },
    } as HashableComponents;

    expect(JSON.parse(componentsToDebugString(components))).toEqual({
      sample: {
        durationMs: 4,
        status: 'fulfilled',
        value: {
          error: {
            message: 'outside range',
            name: 'RangeError',
            stack: 'diagnostic stack',
          },
        },
      },
    });
  });

  it('serializes bigint values instead of throwing', () => {
    const components = {
      sample: { durationMs: 1, status: 'fulfilled', value: 42n },
    } as HashableComponents;

    expect(JSON.parse(componentsToDebugString(components))).toEqual({
      sample: {
        durationMs: 1,
        status: 'fulfilled',
        value: { $type: 'bigint', value: '42' },
      },
    });
  });

  it('preserves non-JSON numeric values in diagnostics', () => {
    const components = {
      sample: {
        durationMs: 1,
        status: 'fulfilled',
        value: [-0, Number.NaN, Infinity, -Infinity],
      },
    } as HashableComponents;

    expect(JSON.parse(componentsToDebugString(components))).toEqual({
      sample: {
        durationMs: 1,
        status: 'fulfilled',
        value: [
          { $type: 'number', value: '-0' },
          { $type: 'number', value: 'NaN' },
          { $type: 'number', value: 'Infinity' },
          { $type: 'number', value: '-Infinity' },
        ],
      },
    });
  });
});
