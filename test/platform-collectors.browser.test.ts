import { afterEach, describe, expect, it, vi } from 'vitest';

import getFonts from '../src/internal/fonts/index.js';
import getPlatformEstimate from '../src/internal/headless/getPlatformEstimate.js';
import getMedia from '../src/internal/media/index.js';
import { IS_BLINK } from '../src/internal/utils/helpers.js';
import getWindowFeatures from '../src/internal/window/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('platform collector failure boundaries', () => {
  it('contains individual media capability failures', async () => {
    const nativeCanPlayType = HTMLMediaElement.prototype.canPlayType;
    let calls = 0;
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      function (this: HTMLMediaElement, type: string) {
        calls += 1;
        if (calls === 1) throw new TypeError('one MIME probe is blocked');
        return nativeCanPlayType.call(this, type);
      },
    );

    await expect(getMedia()).resolves.toEqual({
      mimeTypes: expect.any(Array),
    });
    expect(calls).toBeGreaterThan(2);
  });

  it('rethrows unexpected collector failures', () => {
    const failure = new TypeError('window reflection is blocked');
    vi.spyOn(Object, 'getOwnPropertyNames').mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => getWindowFeatures()).toThrow(failure);
  });

  it('bounds FontFace loads that never settle', async () => {
    vi.useFakeTimers();
    vi.spyOn(FontFace.prototype, 'load').mockImplementation(
      () => new Promise<FontFace>(() => undefined),
    );

    const result = getFonts();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual(
      expect.objectContaining({ fontFaceLoadFonts: expect.any(Array) }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tolerates hostile optional platform constructors', () => {
    if (!IS_BLINK) return;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Crypto');
    if (descriptor && !descriptor.configurable) return;
    Object.defineProperty(globalThis, 'Crypto', {
      configurable: true,
      get() {
        throw new TypeError('constructor access blocked');
      },
    });

    try {
      expect(() => getPlatformEstimate()).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'Crypto', descriptor);
      else Reflect.deleteProperty(globalThis, 'Crypto');
    }
  });
});
