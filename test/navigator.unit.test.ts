import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('settles blocked permission queries and fully normalizes whitespace', async () => {
  vi.useFakeTimers();
  class PluginArrayStub extends Array {}
  const query = vi.fn(() => new Promise<never>(() => undefined));
  const plugins = new PluginArrayStub();
  const navigatorStub = {
    appVersion: 'Mozilla/5.0  A  B',
    hardwareConcurrency: 8,
    language: 'en-US',
    languages: ['en-US'],
    maxTouchPoints: 0,
    mimeTypes: [],
    permissions: { query },
    platform: 'Test',
    plugins,
    userAgent: 'Mozilla/5.0  A  B',
    vendor: 'Test',
  };
  vi.stubGlobal('navigator', navigatorStub);
  vi.stubGlobal('self', { document: {}, navigator: navigatorStub });
  vi.stubGlobal('window', {});
  vi.stubGlobal('PluginArray', PluginArrayStub);
  vi.stubGlobal('speechSynthesis', { getVoices: vi.fn(() => []) });
  vi.resetModules();
  const { default: getNavigator } =
    await import('../src/internal/navigator/index.js');

  const pendingResult = getNavigator(undefined);
  await vi.runAllTimersAsync();
  const result = (await pendingResult) as
    | {
        appVersion?: string;
        language?: string;
        languages?: ReadonlyArray<string>;
        permissions?: Readonly<Record<string, ReadonlyArray<string>>>;
        userAgent?: string;
      }
    | undefined;

  expect(result?.userAgent).toBe('Mozilla/5.0 A B');
  expect(result?.appVersion).toBe('Mozilla/5.0 A B');
  expect(result?.language).toBe('en-US');
  expect(result?.languages).toEqual(['en-US']);
  expect(result?.permissions).toEqual({
    unknown: expect.arrayContaining(['camera', 'microphone', 'notifications']),
  });
  expect(query).toHaveBeenCalledTimes(22);
});

it('ignores WebGPU results that arrive after the signal timeout', async () => {
  vi.useFakeTimers();
  class PluginArrayStub extends Array {}
  let resolveAdapter!: (adapter: object) => void;
  const requestAdapter = vi.fn(
    () =>
      new Promise<object>((resolve) => {
        resolveAdapter = resolve;
      }),
  );
  const plugins = new PluginArrayStub();
  const navigatorStub = {
    appVersion: 'test-agent',
    gpu: { requestAdapter },
    hardwareConcurrency: 8,
    language: 'en-US',
    languages: ['en-US'],
    maxTouchPoints: 0,
    mimeTypes: [],
    platform: 'Test',
    plugins,
    userAgent: 'test-agent',
    vendor: 'Test',
  };
  vi.stubGlobal('navigator', navigatorStub);
  vi.stubGlobal('self', { document: {}, navigator: navigatorStub });
  vi.stubGlobal('window', {});
  vi.stubGlobal('PluginArray', PluginArrayStub);
  vi.stubGlobal('speechSynthesis', { getVoices: vi.fn(() => []) });
  vi.resetModules();
  const [{ default: getNavigator }, { Analysis }] = await Promise.all([
    import('../src/internal/navigator/index.js'),
    import('../src/internal/utils/helpers.js'),
  ]);

  const pendingResult = getNavigator(undefined);
  await vi.runAllTimersAsync();
  const result = (await pendingResult) as { webgpu?: unknown } | undefined;
  expect(result?.webgpu).toBeUndefined();
  expect(Analysis).not.toHaveProperty('webGpuAdapter');

  resolveAdapter({
    features: new Set(['late-feature']),
    info: { vendor: 'late-vendor' },
    limits: { maxTextureDimension2D: 8192 },
  });
  await Promise.resolve();
  await Promise.resolve();

  expect(Analysis).not.toHaveProperty('webGpuAdapter');
  expect(Analysis).not.toHaveProperty('webGpuFeatures');
  expect(Analysis).not.toHaveProperty('webGpuLimits');
});
