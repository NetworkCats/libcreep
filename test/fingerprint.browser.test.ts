import { beforeAll, describe, expect, it } from 'vitest';

import {
  ALGORITHM_VERSION,
  componentsToDebugString,
  DETECTION_NAMES,
  hashComponents,
  isSupported,
  load,
  VERSION,
  type FingerprintResult,
} from '../src/index.js';

let result: FingerprintResult;
let webRTCResult: FingerprintResult;

beforeAll(async () => {
  const agent = await load({
    worker: { strategy: 'auto', url: '/dist/worker.js' },
  });
  result = await agent.get();
  webRTCResult = await agent.get({ includeWebRTC: true });
});

describe('frontend API', () => {
  it('collects stable, raw, fuzzy, and bot fingerprints', () => {
    expect(isSupported()).toBe(true);
    expect(result.visitorId).toMatch(/^[a-f\d]{64}$/);
    expect(result.rawVisitorId).toMatch(/^[a-f\d]{64}$/);
    expect(result.fuzzyHash).toMatch(/^[a-f\d0]{64}$/);
    expect(result.bot.botHash).toMatch(/^[01]{8}$/);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.version).toBe(ALGORITHM_VERSION);
    expect(result.libraryVersion).toBe(VERSION);
  });

  it('settles every upstream detection independently', () => {
    expect(Object.keys(result.components).sort()).toEqual(
      [...DETECTION_NAMES].sort(),
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
    expect(result.auxiliary.webRTC.status).toBe('skipped');
  });

  it('collects network-revealing WebRTC signals only when requested', () => {
    expect(webRTCResult.auxiliary.webRTC.status).not.toBe('skipped');
  });

  it('keeps navigator signals when the worker is unavailable', async () => {
    const agent = await load({
      worker: {
        strategy: 'dedicated',
        url: '/missing-libcreep-worker.js',
      },
    });
    const noWorkerResult = await agent.get();

    expect(noWorkerResult.components.workerScope.status).toBe('unsupported');
    expect(noWorkerResult.values.navigator?.platform).toBe(navigator.platform);
    expect(noWorkerResult.values.navigator?.userAgent).toBe(
      navigator.userAgent.trim().replace(/\s{2,}/, ' '),
    );
  });

  it('isolates detector AbortErrors that are not collection cancellation', async () => {
    const createOffer = RTCPeerConnection.prototype.createOffer;
    RTCPeerConnection.prototype.createOffer = (() =>
      Promise.reject(
        new DOMException('WebRTC offer was unavailable.', 'AbortError'),
      )) as unknown as typeof createOffer;

    try {
      const agent = await load({
        worker: { strategy: 'auto', url: '/dist/worker.js' },
      });
      const isolatedResult = await agent.get({ includeWebRTC: true });
      expect(isolatedResult.auxiliary.webRTC.status).toBe('rejected');
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
      const agent = await load({
        worker: {
          strategy: 'service-first',
          url: '/dist/worker.js',
        },
      });
      const serviceWorkerResult = await agent.get({ timeoutMs: 10_000 });
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
    expect(webRTCResult.values.capturedErrors).toEqual(
      result.values.capturedErrors,
    );
    expect(webRTCResult.values.lies).toEqual(result.values.lies);
    expect(webRTCResult.values.trash).toEqual(result.values.trash);
  });

  it('cancels queued and active collection', async () => {
    const agent = await load({
      worker: { strategy: 'auto', url: '/dist/worker.js' },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      agent.get({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      agent.get({ includeWebRTC: true, timeoutMs: 1 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('enforces timeout when an auxiliary browser promise never settles', async () => {
    const nativeFetch = window.fetch;
    window.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    const agent = await load({
      worker: { strategy: 'auto', url: '/dist/worker.js' },
    });

    try {
      await expect(agent.get({ timeoutMs: 25 })).rejects.toMatchObject({
        name: 'TimeoutError',
      });
    } finally {
      window.fetch = nativeFetch;
    }

    await expect(agent.get({ timeoutMs: 10_000 })).resolves.toMatchObject({
      visitorId: expect.stringMatching(/^[a-f\d]{64}$/),
    });
  });
});

const upstreamCoverage: ReadonlyArray<
  readonly [string, ReadonlyArray<(typeof DETECTION_NAMES)[number]>]
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

describe('ported upstream browser test coverage', () => {
  it.each(upstreamCoverage)('%s probes produce a usable result', (_, names) => {
    for (const name of names) {
      expect(result.components[name].status).toBe('fulfilled');
      expect(result.values[name]?.$hash).toMatch(/^[a-f\d]{64}$/);
    }
  });
});
