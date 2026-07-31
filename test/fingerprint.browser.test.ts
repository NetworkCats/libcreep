import { beforeAll, describe, expect, it, vi } from 'vitest';

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
import { hashValue } from '../src/hash.js';
import {
  buildFocusedHashes,
  buildStableFingerprint,
  snapshot,
} from '../src/runtime.js';

let result: FingerprintResult;
let webRtcResult: FingerprintResult;

function containsComponentHash(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, nested]) => key === '$hash' || containsComponentHash(nested),
  );
}

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

  it('keeps core identifiers stable when only auxiliary policy changes', () => {
    expect(webRtcResult.visitorId).toBe(result.visitorId);
    expect(webRtcResult.rawVisitorId).toBe(result.rawVisitorId);
    expect(webRtcResult.fuzzyHash).toBe(result.fuzzyHash);
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

    const partialComponents = await buildFocusedHashes({
      canvasWebgl: {
        lied: false,
        parameters: { UNMASKED_VENDOR_WEBGL: undefined },
      },
      clientRects: { lied: false },
      css: { computedStyle: null, system: undefined },
      media: { mimeTypes: undefined },
    });
    expect(partialComponents).toEqual({});

    const presentEmptyValue = await buildFocusedHashes({
      media: { mimeTypes: [] },
    });
    expect(presentEmptyValue.mediaMimeTypes).toMatch(/^[a-f\d]{64}$/);
  });

  it('uses canonical hashing for focused signal values', async () => {
    const first = await buildFocusedHashes({
      media: {
        mimeTypes: { missing: undefined, notANumber: Number.NaN },
      },
    });
    const reordered = await buildFocusedHashes({
      media: {
        mimeTypes: { notANumber: Number.NaN, missing: undefined },
      },
    });
    const sparse: unknown[] = [];
    sparse.length = 1;
    const sparseValue = await buildFocusedHashes({
      media: { mimeTypes: sparse },
    });
    const undefinedValue = await buildFocusedHashes({
      media: { mimeTypes: [undefined] },
    });

    expect(first.mediaMimeTypes).toBe(reordered.mediaMimeTypes);
    expect(sparseValue.mediaMimeTypes).not.toBe(undefinedValue.mediaMimeTypes);
  });

  it('preserves detector data when structuredClone is unavailable', () => {
    const nativeStructuredClone = globalThis.structuredClone;
    const sparse: unknown[] = [];
    sparse.length = 1;
    const source: {
      bigint: bigint;
      negativeZero: number;
      notANumber: number;
      self?: unknown;
      sparse: unknown[];
      undefinedValue: undefined;
    } = {
      bigint: 2n,
      negativeZero: -0,
      notANumber: Number.NaN,
      sparse,
      undefinedValue: undefined,
    };
    source.self = source;
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      const copy = snapshot(source);
      expect(copy).not.toBe(source);
      expect(copy.self).toBe(copy);
      expect(copy.bigint).toBe(2n);
      expect(Object.is(copy.negativeZero, -0)).toBe(true);
      expect(Number.isNaN(copy.notANumber)).toBe(true);
      expect(copy).toHaveProperty('undefinedValue', undefined);
      expect(copy.sparse).toHaveLength(1);
      expect(0 in copy.sparse).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'structuredClone', {
        configurable: true,
        value: nativeStructuredClone,
        writable: true,
      });
    }
  });

  it('normalizes Error values created in another window realm', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);

    try {
      const realm = iframe.contentWindow as Window & typeof globalThis;
      const error = new realm.TypeError('iframe failure');
      error.stack = 'iframe stack';
      const components = {
        sample: { durationMs: 1, status: 'fulfilled', value: error },
      } as const;

      await expect(hashComponents(components)).resolves.toMatch(
        /^[a-f\d]{64}$/,
      );
      expect(JSON.parse(componentsToDebugString(components))).toEqual({
        sample: {
          durationMs: 1,
          status: 'fulfilled',
          value: {
            message: 'iframe failure',
            name: 'TypeError',
            stack: 'iframe stack',
          },
        },
      });
    } finally {
      iframe.remove();
    }
  });

  it('hashes plain objects created in another window realm', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);

    try {
      const realm = iframe.contentWindow as Window & typeof globalThis;
      const value = new realm.Object() as Record<string, unknown>;
      value.z = 1;
      value.a = { nested: true };
      const crossRealmHash = await hashComponents({
        sample: { durationMs: 1, status: 'fulfilled', value },
      });
      const localHash = await hashComponents({
        sample: {
          durationMs: 1,
          status: 'fulfilled',
          value: { a: { nested: true }, z: 1 },
        },
      });

      expect(crossRealmHash).toBe(localHash);
    } finally {
      iframe.remove();
    }
  });

  it('excludes low-confidence GPU entropy from the stable fingerprint', () => {
    const stable = buildStableFingerprint(
      {
        canvas2d: { lied: false },
        canvasWebgl: {
          $hash: 'hash-containing-raw-gpu-entropy',
          extensions: [],
          gpu: {
            compressedGPU: 'secret-compressed-gpu',
            confidence: 'low',
          },
          lied: false,
          parameters: {
            UNMASKED_RENDERER_WEBGL: 'secret-renderer',
            UNMASKED_VENDOR_WEBGL: 'secret-vendor',
          },
        },
      } as never,
      false,
      {},
    );

    expect(stable.canvasWebgl).not.toHaveProperty('$hash');
    expect(stable.canvasWebgl).not.toHaveProperty('gpu');
    expect(stable.canvasWebgl?.parameters).toHaveProperty(
      'UNMASKED_RENDERER_WEBGL',
      undefined,
    );
    expect(stable.canvasWebgl?.parameters).toHaveProperty(
      'UNMASKED_VENDOR_WEBGL',
      undefined,
    );
    expect(JSON.stringify(stable.canvasWebgl)).not.toContain('secret');
  });

  it('excludes enrichment hashes from every stable signal', () => {
    const stable = buildStableFingerprint(
      {
        media: {
          $hash: 'legacy-media-hash',
          mimeTypes: [{ mimeType: 'audio/test' }],
        },
        offlineAudioContext: {
          $hash: 'legacy-audio-hash',
          lied: false,
          sampleSum: 42,
        },
      } as never,
      false,
      {},
    );

    expect(containsComponentHash(stable)).toBe(false);
    expect(containsComponentHash(result.stableComponents)).toBe(false);
    expect(stable.media).toEqual({
      mimeTypes: [{ mimeType: 'audio/test' }],
    });
    expect(stable.offlineAudioContext).toEqual({
      lied: false,
      sampleSum: 42,
    });
  });

  it('keeps stable components independent from mutable result values', async () => {
    const mediaType = result.values.media?.mimeTypes?.[0] as
      { mimeType: string } | undefined;
    expect(mediaType).toBeDefined();
    const originalMimeType = mediaType?.mimeType;
    const stableBeforeMutation = structuredClone(result.stableComponents);

    try {
      if (mediaType !== undefined) mediaType.mimeType = 'mutated-after-hash';
      expect(result.stableComponents).toEqual(stableBeforeMutation);
      await expect(
        hashValue({
          algorithmVersion: result.algorithmVersion,
          components: result.stableComponents,
        }),
      ).resolves.toBe(result.visitorId);
    } finally {
      if (mediaType !== undefined && originalMimeType !== undefined) {
        mediaType.mimeType = originalMimeType;
      }
    }
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

  it('does not let a stalled auxiliary promise hold cancellation or the queue', async () => {
    const nativeStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
    let estimateCalls = 0;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: () => {
          estimateCalls += 1;
          return new Promise<StorageEstimate>(() => undefined);
        },
      },
    });
    const collector = await load({
      worker: { strategy: 'auto', url: '/dist/worker.js' },
    });
    const controller = new AbortController();
    const reason = new DOMException('cancel stalled auxiliary', 'AbortError');
    const pending = collector.collect({ signal: controller.signal });

    try {
      await vi.waitFor(() => expect(estimateCalls).toBeGreaterThan(0));
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
    } finally {
      controller.abort(reason);
      if (nativeStorage === undefined) {
        Reflect.deleteProperty(navigator, 'storage');
      } else {
        Object.defineProperty(navigator, 'storage', nativeStorage);
      }
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
