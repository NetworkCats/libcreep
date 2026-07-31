import { describe, expect, it, vi } from 'vitest';

interface LiesModule {
  readonly PHANTOM_DARKNESS: Window;
  readonly PARENT_PHANTOM?: HTMLDivElement;
  readonly lieProps: Readonly<Record<string, number>>;
  initializePrototypeLies(): number;
  removePhantom(): void;
  renewPhantom(): void;
  createLieDetector(scope: Window & typeof globalThis): {
    searchLies(
      fn: () => unknown,
      config?: { target?: readonly string[] },
    ): void;
  };
  documentLie(name: string, lie: string | readonly string[]): void;
  getLies(): { data: Record<string, string[]>; totalLies: number };
  lieRecords: {
    getRecords(): Record<string, string[]>;
    resetRecords(baseline?: Readonly<Record<string, readonly string[]>>): void;
  };
}

describe('prototype lie detector lifecycle', () => {
  it('defers browser probing until explicit collection initialization', async () => {
    const frame = document.createElement('iframe');
    const frameLoaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
    });
    frame.src = 'about:blank';
    document.body.appendChild(frame);
    await frameLoaded;
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument?.body) {
      frame.remove();
      throw new Error('Test iframe is unavailable.');
    }

    const mutations: MutationRecord[] = [];
    const frameGlobal = frameWindow as unknown as typeof globalThis;
    const observer = new frameGlobal.MutationObserver(
      (records: MutationRecord[]) => mutations.push(...records),
    );
    observer.observe(frameDocument.body, { childList: true });
    const nativeGetVoices = frameWindow.speechSynthesis.getVoices;
    const getVoices = vi
      .spyOn(frameWindow.speechSynthesis, 'getVoices')
      .mockImplementation(function (this: SpeechSynthesis) {
        return nativeGetVoices.call(this);
      });
    const importInFrame = (
      frameGlobal as typeof globalThis & {
        eval(source: string): unknown;
      }
    ).eval('(url) => import(url)') as (url: string) => Promise<unknown>;
    let lies: LiesModule | undefined;

    try {
      await importInFrame('/dist/runtime.js');
      lies = (await importInFrame('/src/internal/lies/index.ts')) as LiesModule;
      await Promise.resolve();

      expect(getVoices).not.toHaveBeenCalled();
      expect(mutations.some((record) => record.addedNodes.length > 0)).toBe(
        false,
      );
      expect(lies.PARENT_PHANTOM).toBeUndefined();
      expect(lies.lieProps).toEqual({});

      mutations.length = 0;
      const unloadedLieProps = lies.lieProps;
      lies.renewPhantom();

      expect(lies.initializePrototypeLies()).toBeGreaterThanOrEqual(0);
      expect(getVoices).toHaveBeenCalled();
      expect(lies.PARENT_PHANTOM?.isConnected).toBe(true);
      expect(lies.lieProps).not.toBe(unloadedLieProps);

      const phantomStyle = lies.PARENT_PHANTOM?.getAttribute('style');
      const { default: getHeadlessFeatures } = (await importInFrame(
        '/src/internal/headless/index.ts',
      )) as {
        default(input: {
          webgl?: unknown;
          workerScope?: unknown;
        }): Promise<unknown>;
      };
      const headless = (await getHeadlessFeatures({})) as {
        chromium: boolean;
        headless: Readonly<Record<string, boolean>>;
        likeHeadless: Readonly<Record<string, boolean>>;
        platformEstimate: ReadonlyArray<unknown>;
        stealth: Readonly<Record<string, boolean>>;
      };
      expect(lies.PARENT_PHANTOM?.getAttribute('style')).toBe(phantomStyle);
      expect(headless.platformEstimate).toHaveLength(headless.chromium ? 2 : 0);
      for (const flags of [
        headless.likeHeadless,
        headless.headless,
        headless.stealth,
      ]) {
        expect(
          Object.values(flags).every((value) => typeof value === 'boolean'),
        ).toBe(true);
      }

      lies.removePhantom();
      expect(lies.PARENT_PHANTOM).toBeUndefined();
      expect(lies.PHANTOM_DARKNESS).toBe(frameWindow);
    } finally {
      lies?.removePhantom();
      getVoices.mockRestore();
      observer.disconnect();
      frame.remove();
    }
  });

  it('restores probed function prototypes even when coercion succeeds', async () => {
    const lies = (await import('../src/internal/lies/index.js')) as LiesModule;
    const detector = lies.createLieDetector(
      window as Window & typeof globalThis,
    );
    const toString = function toString() {};
    Object.defineProperty(toString, Symbol.toPrimitive, {
      configurable: true,
      value: () => 1,
    });
    const originalPrototype = Object.getPrototypeOf(toString);
    const api = { name: 'TestApi', prototype: { toString } };

    try {
      detector.searchLies(() => api, { target: ['toString'] });
      expect(Object.getPrototypeOf(toString)).toBe(originalPrototype);
    } finally {
      lies.lieRecords.resetRecords();
    }
  });

  it('does not expose mutable lie-record state', async () => {
    const lies = (await import('../src/internal/lies/index.js')) as LiesModule;
    lies.lieRecords.resetRecords();
    try {
      lies.documentLie('Example.value', ['first']);
      const records = lies.lieRecords.getRecords();
      records['Example.value']?.push('external mutation');

      expect(lies.getLies()).toEqual({
        data: { 'Example.value': ['first'] },
        totalLies: 1,
      });
    } finally {
      lies.lieRecords.resetRecords();
    }
  });

  it('cleans the phantom and rethrows unexpected initialization failures', async () => {
    const lies = (await import('../src/internal/lies/index.js')) as LiesModule;
    const failure = new Error('performance clock failed');
    const now = vi.spyOn(performance, 'now').mockImplementationOnce(() => {
      throw failure;
    });

    try {
      expect(() => lies.initializePrototypeLies()).toThrow(failure);
      expect(lies.PARENT_PHANTOM).toBeUndefined();
      expect(lies.PHANTOM_DARKNESS).toBe(window);
    } finally {
      now.mockRestore();
      lies.removePhantom();
      lies.lieRecords.resetRecords();
    }
  });
});
