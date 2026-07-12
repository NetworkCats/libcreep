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
        duration: 12,
        error: { message: 'private detail', name: 'TypeError' },
        status: 'rejected',
      },
      value: {
        duration: 7,
        status: 'fulfilled',
        value: {
          z: undefined,
          a: [1, Number.NaN, Infinity, -Infinity, 2n],
        },
      },
      unsupported: { duration: 3, status: 'unsupported' },
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
        duration: 1,
        error: { message: 'first failure', name: 'Error' },
        status: 'rejected',
      },
    } as HashableComponents;
    const second = {
      sample: {
        duration: 999,
        error: { message: 'different failure', name: 'RangeError' },
        status: 'rejected',
      },
    } as HashableComponents;
    const skipped = {
      sample: { duration: 1, status: 'skipped' },
    } as HashableComponents;

    await expect(hashComponents(first)).resolves.toBe(
      await hashComponents(second),
    );
    await expect(hashComponents(first)).resolves.not.toBe(
      await hashComponents(skipped),
    );
  });

  it('normalizes Error values with stable diagnostic fields', async () => {
    const error = new TypeError('bad component value');
    error.stack = 'fixture stack';
    const components = {
      sample: { duration: 1, status: 'fulfilled', value: error },
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

  it('fails clearly when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);

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
      sample: { duration: 4, status: 'fulfilled', value: { error } },
    } as HashableComponents;

    expect(JSON.parse(componentsToDebugString(components))).toEqual({
      sample: {
        duration: 4,
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
      sample: { duration: 1, status: 'fulfilled', value: 42n },
    } as HashableComponents;

    expect(JSON.parse(componentsToDebugString(components))).toEqual({
      sample: {
        duration: 1,
        status: 'fulfilled',
        value: { $type: 'bigint', value: '42' },
      },
    });
  });
});
