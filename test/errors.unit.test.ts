import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('detector error utilities', () => {
  it('captures trusted error names and messages with probe context', async () => {
    const { captureError, getCapturedErrors } =
      await import('../src/internal/errors/index.js');

    expect(
      captureError(new TypeError('invalid detector state'), 'canvas'),
    ).toBe(undefined);
    captureError({ message: 'single-token', name: 'ThirdPartyError' });

    expect(getCapturedErrors()).toEqual({
      data: [
        {
          trustedMessage: 'invalid detector state [canvas]',
          trustedName: 'TypeError',
        },
        { trustedMessage: undefined, trustedName: undefined },
      ],
    });
  });

  it('returns successful attempts and records failures', async () => {
    const { attempt, getCapturedErrors } =
      await import('../src/internal/errors/index.js');

    expect(attempt(() => 42)).toBe(42);
    expect(
      attempt(() => {
        throw new RangeError('measurement outside range');
      }, 'audio'),
    ).toBeUndefined();
    expect(getCapturedErrors().data).toEqual([
      {
        trustedMessage: 'measurement outside range [audio]',
        trustedName: 'RangeError',
      },
    ]);
  });

  it('reads nested APIs and safely invokes optional methods', async () => {
    const { caniuse } = await import('../src/internal/errors/index.js');
    const use = caniuse as (
      fn: () => unknown,
      chain?: string[],
      args?: unknown[],
      method?: boolean,
    ) => unknown;
    const api = {
      nested: { value: 'available' },
      scale(value: number) {
        return value * 3;
      },
      status() {
        return 'ready';
      },
    };

    expect(use(() => api, ['nested', 'value'])).toBe('available');
    expect(use(() => api, ['scale'], [4], true)).toBe(12);
    expect(use(() => api, ['status'], [], true)).toBe('ready');
    expect(use(() => api, ['missing', 'value'])).toBeUndefined();
    expect(
      use(() => {
        throw new Error('unavailable');
      }),
    ).toBeUndefined();
  });

  it('measures elapsed probe time and emits optional labels', async () => {
    const { timer } = await import('../src/internal/errors/index.js');
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(350);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const stop = timer('probe start');

    expect(stop('probe end')).toBe(250);
    expect(log).toHaveBeenNthCalledWith(1, 'probe start');
    expect(log).toHaveBeenNthCalledWith(2, 'probe end: 0.25 seconds');
    now.mockRestore();
    log.mockRestore();
  });
});
