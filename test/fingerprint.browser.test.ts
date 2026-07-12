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

  it('supports canonical hashing and debug serialization', async () => {
    await expect(hashComponents(result.components)).resolves.toBe(
      result.rawVisitorId,
    );
    expect(componentsToDebugString(result.components)).toContain('workerScope');
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
