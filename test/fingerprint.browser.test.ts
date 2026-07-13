import { beforeAll, describe, expect, it } from 'vitest';

import {
  ALGORITHM_VERSION,
  componentsToDebugString,
  CORE_COMPONENT_NAMES,
  hashComponents,
  isFingerprintingSupported,
  load,
  LIBRARY_VERSION,
  type FingerprintResult,
} from '../src/index.js';
import { buildFocusedHashes } from '../src/runtime.js';

let result: FingerprintResult;
let webRtcResult: FingerprintResult;

beforeAll(async () => {
  const collector = await load({
    worker: { strategy: 'auto', url: '/dist/worker.js' },
  });
  result = await collector.collect();
  webRtcResult = await collector.collect({ includeWebRtc: true });
});

describe('frontend API', () => {
  it('collects stable, raw, fuzzy, and bot fingerprints', () => {
    expect(isFingerprintingSupported()).toBe(true);
    expect(result.visitorId).toMatch(/^[a-f\d]{64}$/);
    expect(result.rawVisitorId).toMatch(/^[a-f\d]{64}$/);
    expect(result.fuzzyHash).toMatch(/^[a-f\d0]{64}$/);
    expect(result.bot.botMask).toMatch(/^[01]{8}$/);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result.libraryVersion).toBe(LIBRARY_VERSION);
    expect(result.stableComponents).not.toHaveProperty('forceRenew');
    expect(Object.keys(result.focusedHashes)).toEqual(
      expect.arrayContaining([
        'canvas2dEmoji',
        'canvas2dImage',
        'canvas2dPaint',
        'canvas2dText',
        'clientRects',
        'cssComputedStyle',
        'cssSystem',
        'deviceAndTimezone',
        'mediaMimeTypes',
      ]),
    );
    expect(
      Object.values(result.focusedHashes).every(
        (hash) => typeof hash === 'string' && /^[a-f\d]{64}$/.test(hash),
      ),
    ).toBe(true);
  });

  it('settles every upstream detection independently', () => {
    expect(Object.keys(result.components).sort()).toEqual(
      [...CORE_COMPONENT_NAMES].sort(),
    );
    const rejected = Object.entries(result.components).filter(
      ([, component]) => component.status === 'rejected',
    );
    expect(rejected).toEqual([]);
  });

  it('collects passive auxiliary detections without configuration', () => {
    expect(result.auxiliary.mediaDevices.status).not.toBe('skipped');
    expect(result.auxiliary.mediaCapabilities.status).not.toBe('skipped');
    expect(result.auxiliary.status.status).not.toBe('skipped');
    expect(result.auxiliary.webRtc.status).toBe('skipped');
  });

  it('collects network-revealing WebRTC signals only when requested', () => {
    expect(webRtcResult.auxiliary.webRtc.status).not.toBe('skipped');
  });

  it('keeps navigator signals when the worker is unavailable', async () => {
    const collector = await load({
      worker: {
        strategy: 'dedicated-only',
        url: '/missing-libcreep-worker.js',
      },
    });
    const noWorkerResult = await collector.collect();

    expect(noWorkerResult.components.workerScope.status).toBe('unsupported');
    expect(noWorkerResult.values.navigator?.platform).toBe(navigator.platform);
    expect(noWorkerResult.values.navigator?.userAgent).toBe(
      navigator.userAgent.trim().replace(/\s{2,}/, ' '),
    );
  });

  it('omits focused hashes whose source component is unavailable', async () => {
    await expect(buildFocusedHashes({})).resolves.toEqual({});

    const presentUndefined = await buildFocusedHashes({
      media: { mimeTypes: undefined },
    });
    expect(presentUndefined.mediaMimeTypes).toMatch(/^[a-f\d]{64}$/);
    expect(presentUndefined).not.toHaveProperty('cssSystem');
  });

  it('loads the packaged worker without a URL override', async () => {
    const productionEntry = '/dist/index.js';
    const productionModule = (await import(
      /* @vite-ignore */ productionEntry
    )) as typeof import('../src/index.js');
    const collector = await productionModule.load();
    const defaultWorkerResult = await collector.collect({ timeoutMs: 10_000 });

    expect(defaultWorkerResult.components.workerScope.status).toBe('fulfilled');
  });

  it('isolates detector AbortErrors that are not collection cancellation', async () => {
    const createOffer = RTCPeerConnection.prototype.createOffer;
    RTCPeerConnection.prototype.createOffer = (() =>
      Promise.reject(
        new DOMException('WebRTC offer was unavailable.', 'AbortError'),
      )) as unknown as typeof createOffer;

    try {
      const collector = await load({
        worker: { strategy: 'auto', url: '/dist/worker.js' },
      });
      const isolatedResult = await collector.collect({ includeWebRtc: true });
      expect(isolatedResult.auxiliary.webRtc.status).toBe('rejected');
    } finally {
      RTCPeerConnection.prototype.createOffer = createOffer;
    }
  });

  it('does not unregister an existing service worker', async () => {
    if (!('serviceWorker' in navigator)) return;
    const sentinel = await navigator.serviceWorker.register('/dist/worker.js', {
      scope: '/dist/',
      type: 'module',
    });

    try {
      const collector = await load({
        worker: {
          strategy: 'service-first',
          url: '/dist/worker.js',
        },
      });
      const serviceWorkerResult = await collector.collect({
        timeoutMs: 10_000,
      });
      expect(serviceWorkerResult.components.workerScope.status).toBe(
        'fulfilled',
      );
      const registrations = await navigator.serviceWorker.getRegistrations();
      expect(
        registrations.some(
          (registration) => registration.scope === sentinel.scope,
        ),
      ).toBe(true);
    } finally {
      await sentinel.unregister();
    }
  });

  it('supports canonical hashing and debug serialization', async () => {
    await expect(hashComponents(result.components)).resolves.toBe(
      result.rawVisitorId,
    );
    expect(componentsToDebugString(result.components)).toContain('workerScope');
  });

  it('does not accumulate detector records across repeated collection', () => {
    expect(webRtcResult.values.capturedErrors).toEqual(
      result.values.capturedErrors,
    );
    expect(webRtcResult.values.lies).toEqual(result.values.lies);
    expect(webRtcResult.values.trash).toEqual(result.values.trash);
  });

  it('cancels queued and active collection', async () => {
    const collector = await load({
      worker: { strategy: 'auto', url: '/dist/worker.js' },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      collector.collect({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      collector.collect({ includeWebRtc: true, timeoutMs: 1 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('enforces timeout when an auxiliary browser promise never settles', async () => {
    const nativeFetch = window.fetch;
    window.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    const collector = await load({
      worker: { strategy: 'auto', url: '/dist/worker.js' },
    });

    try {
      await expect(collector.collect({ timeoutMs: 25 })).rejects.toMatchObject({
        name: 'TimeoutError',
      });
    } finally {
      window.fetch = nativeFetch;
    }

    await expect(
      collector.collect({ timeoutMs: 10_000 }),
    ).resolves.toMatchObject({
      visitorId: expect.stringMatching(/^[a-f\d]{64}$/),
    });
  });
});

const upstreamCoverage: ReadonlyArray<
  readonly [string, ReadonlyArray<(typeof CORE_COMPONENT_NAMES)[number]>]
> = [
  ['workers', ['workerScope']],
  ['iframes', ['lies', 'headless']],
  ['fonts', ['fonts']],
  ['timezone', ['timezone', 'intl']],
  ['window', ['windowFeatures', 'htmlElementVersion']],
  ['screen', ['screen', 'cssMedia']],
  ['prototype and proxy', ['lies']],
  ['DOMRect and emojis', ['clientRects', 'svg', 'canvas2d']],
  ['math', ['maths', 'consoleErrors']],
  ['machine', ['navigator', 'canvasWebgl']],
  ['extensions', ['resistance', 'features']],
];

const optionallyUnsupported = new Set<(typeof CORE_COMPONENT_NAMES)[number]>([
  'canvasWebgl',
]);

describe('ported upstream browser test coverage', () => {
  it.each(upstreamCoverage)('%s probes produce a usable result', (_, names) => {
    for (const name of names) {
      const component = result.components[name];
      if (component.status === 'unsupported') {
        expect(optionallyUnsupported.has(name), name).toBe(true);
        expect(result.values[name]).toBeUndefined();
        continue;
      }
      expect(component.status, name).toBe('fulfilled');
      expect(result.values[name]?.$hash).toMatch(/^[a-f\d]{64}$/);
    }
  });
});
