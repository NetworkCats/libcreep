import { describe, expect, it, vi } from 'vitest';

import {
  createTimer,
  decryptUserAgent,
  formatEmojiSet,
  getBraveMode,
  getBraveUnprotectedParameters,
  getGpuBrand,
  getOS,
  getPromiseRaceFulfilled,
  getReportedPlatform,
  getUserAgentPlatform,
  getUserAgentRestored,
  hashSlice,
} from '../src/internal/utils/helpers.js';
import { formatTimezoneLocation } from '../src/internal/timezone/index.js';
import { createMeasurementFragment } from '../src/internal/utils/measurement.js';

describe('platform classification utilities', () => {
  it('formats every segment of timezone identifiers', () => {
    expect(formatTimezoneLocation('America/Port_of_Spain')).toBe(
      'America, Port of Spain',
    );
    expect(formatTimezoneLocation(undefined)).toBeUndefined();
  });

  it.each([
    ['Windows Phone 10', 'Windows Phone'],
    ['Mozilla/5.0 (Windows NT 10.0)', 'Windows'],
    ['Mozilla/5.0 (Linux; Android 14)', 'Android'],
    ['Mozilla/5.0 (X11; CrOS x86_64)', 'Chrome OS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'Mac'],
    ['custom-agent', 'Other'],
  ])('classifies %s as %s', (userAgent, expected) => {
    expect(getOS(userAgent)).toBe(expected);
  });

  it('compares user-agent and navigator platform families', () => {
    expect(getReportedPlatform('Windows NT 10.0', 'Win32')).toEqual([
      'Windows',
      'Windows',
    ]);
    expect(getReportedPlatform('Linux x86_64', 'MacIntel')).toEqual([
      'Linux',
      'Apple',
    ]);
    expect(getReportedPlatform('custom-agent')).toEqual(['Other']);
  });

  it('extracts useful device descriptions from common user agents', () => {
    expect(
      getUserAgentPlatform({
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001)',
      }),
    ).toBe('Android 13 Pixel 7');
    expect(
      getUserAgentPlatform({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }),
    ).toContain('Windows 10');
    expect(
      getUserAgentPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4)',
      }),
    ).toContain('macOS Ventura');
    expect(getUserAgentPlatform({ userAgent: 'custom-agent' })).toBe('unknown');
  });
});

describe('user-agent interpretation', () => {
  it.each([
    [
      {
        isBrave: true,
        os: 'Windows',
        ua: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36',
      },
      'Chrome 126 Brave',
    ],
    [
      {
        isBrave: false,
        os: 'Windows',
        ua: 'Mozilla/5.0 Chrome/125.0.0.0 OPR/111.0 Safari/537.36',
      },
      'Chrome 125 Opera',
    ],
    [
      {
        isBrave: false,
        os: 'iOS',
        ua: 'Mozilla/5.0 EdgiOS/124.0 Mobile Safari/605.1.15',
      },
      'EdgiOS 124',
    ],
    [
      {
        isBrave: false,
        os: 'Linux',
        ua: 'Mozilla/5.0 Firefox/128.0',
      },
      'Firefox 128',
    ],
    [
      {
        isBrave: false,
        os: 'macOS',
        ua: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
      },
      'Safari 17',
    ],
    [{ isBrave: false, os: 'Other', ua: 'custom-agent' }, 'unknown'],
  ])('decrypts $expected', (input, expected) => {
    expect(decryptUserAgent(input)).toBe(expected);
  });

  it('restores high-entropy Windows and Chrome versions', () => {
    const reduced =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

    expect(
      getUserAgentRestored({
        fontPlatformVersion: 'Windows 11',
        userAgent: reduced,
        userAgentData: {
          bitness: '64',
          brands: ['Google Chrome'],
          platformVersion: '13.0.0',
          uaFullVersion: '120.1.2.3',
        },
      }),
    ).toBe(
      'Mozilla/5.0 (Windows 11; Win64; x64) Chrome/120.1.2.3 Safari/537.36',
    );
    expect(
      getUserAgentRestored({
        fontPlatformVersion: '',
        userAgent: reduced,
        userAgentData: undefined,
      }),
    ).toBeUndefined();
  });
});

describe('fingerprint value helpers', () => {
  it('does not count the same timer interval more than once', () => {
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(14);
    const timer = createTimer();

    timer.start();
    expect(timer.stop()).toBe(5);
    expect(timer.stop()).toBe(5);
    timer.start();
    expect(timer.stop()).toBe(9);
    expect(now).toHaveBeenCalledTimes(4);
  });

  it('checks Brave audio mode without mutating the window constructor', () => {
    const offlineDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'OfflineAudioContext',
    );
    const webkitDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'webkitOfflineAudioContext',
    );
    if (offlineDescriptor && !offlineDescriptor.configurable) return;
    if (webkitDescriptor && !webkitDescriptor.configurable) return;
    const disconnect = vi.fn();
    const close = vi.fn();
    class FakeOfflineAudioContext {
      createAnalyser() {
        return {
          disconnect,
          frequencyBinCount: 2,
          getFloatFrequencyData(data: Float32Array) {
            data.fill(-Infinity);
          },
        };
      }
      close = close;
    }

    try {
      Object.defineProperty(window, 'OfflineAudioContext', {
        configurable: true,
        value: undefined,
        writable: true,
      });
      Object.defineProperty(window, 'webkitOfflineAudioContext', {
        configurable: true,
        value: FakeOfflineAudioContext,
        writable: true,
      });

      getBraveMode();
      expect(window.OfflineAudioContext).toBeUndefined();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      if (offlineDescriptor) {
        Object.defineProperty(window, 'OfflineAudioContext', offlineDescriptor);
      } else {
        delete (window as unknown as Record<string, unknown>)
          .OfflineAudioContext;
      }
      if (webkitDescriptor) {
        Object.defineProperty(
          window,
          'webkitOfflineAudioContext',
          webkitDescriptor,
        );
      } else {
        delete (window as unknown as Record<string, unknown>)
          .webkitOfflineAudioContext;
      }
    }
  });

  it('preserves false and zero values in measurement templates', () => {
    const fragment = createMeasurementFragment`<div data-zero="${0}" data-false="${false}"></div>`;
    const element = fragment.firstElementChild;
    expect(element?.getAttribute('data-zero')).toBe('0');
    expect(element?.getAttribute('data-false')).toBe('false');
  });

  it('removes Brave-randomized WebGL parameters', () => {
    expect(
      getBraveUnprotectedParameters({
        MAX_TEXTURE_SIZE: 16_384,
        SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 1.0',
        UNMASKED_RENDERER_WEBGL: 'renderer',
      }),
    ).toEqual({ MAX_TEXTURE_SIZE: 16_384 });
  });

  it('returns only promptly fulfilled values of the expected type', async () => {
    await expect(
      getPromiseRaceFulfilled({
        limit: 50,
        promise: Promise.resolve(new Date(0)),
        responseType: Date,
      }),
    ).resolves.toEqual(new Date(0));
    await expect(
      getPromiseRaceFulfilled({
        limit: 50,
        promise: Promise.resolve('wrong type'),
        responseType: Date,
      }),
    ).resolves.toBeUndefined();
    await expect(
      getPromiseRaceFulfilled({
        limit: 50,
        promise: Promise.reject(new Error('failed')),
        responseType: Date,
      }),
    ).resolves.toBeUndefined();
  });

  it('formats compact values used in reports and hashes', () => {
    expect(formatEmojiSet(['a', 'b', 'c'])).toBe('abc');
    expect(formatEmojiSet(['a', 'b', 'c', 'd', 'e', 'f'], 1)).toBe('a...f');
    expect(hashSlice('0123456789abcdef')).toBe('01234567');
    expect(hashSlice(undefined)).toBeUndefined();
    expect(getGpuBrand('ANGLE (NVIDIA GeForce RTX 4090)')).toBe('NVIDIA');
    expect(getGpuBrand('Mesa Intel UHD Graphics')).toBe('INTEL');
    expect(getGpuBrand('Mystery Rasterizer')).toBe('OTHER');
    expect(getGpuBrand('')).toBeNull();
  });

  it('normalizes GPU brands without locale-sensitive casing', () => {
    const localeUpperCase = vi
      .spyOn(String.prototype, 'toLocaleUpperCase')
      .mockImplementation(() => {
        throw new Error('locale-dependent');
      });
    expect(getGpuBrand('Mesa Intel UHD Graphics')).toBe('INTEL');
    expect(localeUpperCase).not.toHaveBeenCalled();
  });
});
