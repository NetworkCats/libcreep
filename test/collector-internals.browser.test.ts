import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import getCSS from '../src/internal/css/index.js';
import { getPixelMods } from '../src/internal/canvas/index.js';
import getCSSMedia from '../src/internal/cssmedia/index.js';
import getClientRects from '../src/internal/domrect/index.js';
import { errorsCaptured } from '../src/internal/errors/index.js';
import {
  lieRecords,
  PARENT_PHANTOM,
  PHANTOM_DARKNESS,
} from '../src/internal/lies/index.js';
import getVoices from '../src/internal/speech/index.js';
import getSVG from '../src/internal/svg/index.js';
import { trashBin } from '../src/internal/trash/index.js';
import {
  Analysis,
  IS_WEBKIT,
  LowerEntropy,
} from '../src/internal/utils/helpers.js';
import { replaceElement } from '../src/internal/utils/measurement.js';
import getCanvasWebgl from '../src/internal/webgl/index.js';
import {
  drainDetectorActivity,
  runProbe,
  type DetectorActivity,
} from '../src/runtime.js';

let errorsBaseline: unknown[];
let liesBaseline: Record<string, string[]>;
let trashBaseline: unknown[];
let analysisBaseline: Record<string, unknown>;
let lowerEntropyBaseline: Record<string, unknown>;

const resetRecord = (
  record: Record<string, unknown>,
  baseline: Record<string, unknown>,
) => {
  for (const key of Object.keys(record)) delete record[key];
  Object.assign(record, structuredClone(baseline));
};

beforeAll(() => {
  errorsBaseline = structuredClone(errorsCaptured.getErrors());
  liesBaseline = structuredClone(lieRecords.getRecords());
  trashBaseline = structuredClone(trashBin.getBin());
  analysisBaseline = structuredClone(Analysis);
  lowerEntropyBaseline = structuredClone(LowerEntropy);
});

afterEach(() => {
  vi.restoreAllMocks();
  errorsCaptured.resetErrors(structuredClone(errorsBaseline));
  lieRecords.resetRecords(structuredClone(liesBaseline));
  trashBin.resetBin(structuredClone(trashBaseline));
  resetRecord(Analysis, analysisBaseline);
  resetRecord(LowerEntropy, lowerEntropyBaseline);
});

describe('collector lifecycle boundaries', () => {
  it('reports noise read back from the mirrored canvas', () => {
    const prototype = CanvasRenderingContext2D.prototype;
    const nativeGetImageData = prototype.getImageData;
    let reads = 0;
    vi.spyOn(prototype, 'getImageData').mockImplementation(function (
      this: CanvasRenderingContext2D,
      sx,
      sy,
      sw,
      sh,
      settings,
    ) {
      const imageData = nativeGetImageData.call(this, sx, sy, sw, sh, settings);
      reads += 1;
      if (reads % 2 === 0) {
        const red = imageData.data[0] ?? 0;
        imageData.data[0] = red === 255 ? 254 : red + 1;
      }
      return imageData;
    });

    const mods = getPixelMods();

    expect(mods?.pixels).toBe(64);
    expect(mods?.rgba).toContain('r');
  });

  it('classifies an exception from a real detector as rejected', async () => {
    const failure = new TypeError('blocked media query');
    vi.spyOn(PHANTOM_DARKNESS, 'matchMedia').mockImplementation(() => {
      throw failure;
    });
    const results: Record<string, unknown> = {};

    await runProbe(results as never, 'cssMedia', getCSSMedia);

    expect(results.cssMedia).toMatchObject({
      error: { message: failure.message, name: failure.name },
      status: 'rejected',
    });
  });

  it('waits for a cancelled slow detector before allowing later work', async () => {
    const activity: DetectorActivity = { pending: new Set() };
    const controller = new AbortController();
    const reason = false;
    const events: string[] = [];
    let resolveDetector!: () => void;
    const delayedDetector = new Promise<void>((resolve) => {
      resolveDetector = () => {
        events.push('old detector mutation');
        resolve();
      };
    });

    const running = runProbe(
      {},
      'canvas2d',
      () => delayedDetector,
      controller.signal,
      activity,
    );
    controller.abort(reason);

    await expect(running).rejects.toBe(reason);
    const laterWork = drainDetectorActivity(activity).then(() => {
      events.push('next collection');
    });
    await Promise.resolve();
    expect(events).toEqual([]);

    resolveDetector();
    await laterWork;
    expect(events).toEqual(['old detector mutation', 'next collection']);
  });

  it('reports a detached measurement placeholder as unreplaced', () => {
    const placeholder = document.createElement('div');
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement('span'));

    expect(replaceElement(placeholder, fragment)).toBeNull();
    expect(fragment.childElementCount).toBe(1);
  });

  it('measures CSS system values without mutating the shared phantom fixture', () => {
    const style = PARENT_PHANTOM?.getAttribute('style') ?? null;
    const childCount = document.body.children.length;

    expect(getCSS()).toBeDefined();
    expect(document.body.children.length).toBe(childCount);
    expect(PARENT_PHANTOM?.getAttribute('style') ?? null).toBe(style);
  });

  it('preserves existing phantom document content while collecting CSS media', () => {
    const body = PHANTOM_DARKNESS.document.body;
    const sentinel = PHANTOM_DARKNESS.document.createElement('div');
    sentinel.textContent = 'keep this node';
    body.append(sentinel);
    const childCount = body.children.length;

    try {
      expect(getCSSMedia()).toBeDefined();
      expect(sentinel.isConnected).toBe(true);
      expect(sentinel.textContent).toBe('keep this node');
      expect(body.children.length).toBe(childCount);
    } finally {
      sentinel.remove();
    }
  });

  it('does not confuse or remove a pre-existing SVG container', async () => {
    const body = PHANTOM_DARKNESS.document.body;
    const sentinel = PHANTOM_DARKNESS.document.createElement('div');
    sentinel.id = 'svg-container';
    body.prepend(sentinel);

    try {
      expect(await getSVG()).toBeDefined();
      expect(sentinel.isConnected).toBe(true);
      expect(body.querySelectorAll('#svg-container')).toHaveLength(1);
    } finally {
      sentinel.remove();
    }
  });

  it('measures the first SVG character by index', async () => {
    const realm = PHANTOM_DARKNESS as Window & typeof globalThis;
    const prototype = realm.SVGTextContentElement?.prototype;
    if (!prototype) return;
    const getExtentOfChar = vi.spyOn(prototype, 'getExtentOfChar');

    expect(await getSVG()).toBeDefined();
    expect(getExtentOfChar).toHaveBeenCalledWith(0);
  });

  it('uses a range from the same document as DOMRect probe elements', async () => {
    const mainRange = vi.spyOn(document, 'createRange');

    expect(await getClientRects()).toBeDefined();
    if (PHANTOM_DARKNESS.document !== document) {
      expect(mainRange).not.toHaveBeenCalled();
    }
  });

  it('rejects detector failures and removes their placeholders', async () => {
    const body = PHANTOM_DARKNESS.document.body;
    const childCount = body.children.length;
    vi.spyOn(document, 'importNode').mockImplementation(() => {
      throw new TypeError('blocked fragment import');
    });

    await expect(getClientRects()).rejects.toThrow('blocked fragment import');
    await expect(getSVG()).rejects.toThrow('blocked fragment import');
    expect(body.children.length).toBe(childCount);
  });

  it('cancels speech startup without leaving its delay active', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancel speech', 'AbortError');
    const voices = getVoices(controller.signal);
    controller.abort(reason);

    await expect(voices).rejects.toBe(reason);
  });

  it('rejects speech collection with falsy abort reasons', async () => {
    const getVoicesSpy = vi
      .spyOn(window.speechSynthesis, 'getVoices')
      .mockReturnValue([]);

    for (const reason of [false, 0, '']) {
      const controller = new AbortController();
      const voices = getVoices(controller.signal);
      await vi.waitFor(() => expect(getVoicesSpy).toHaveBeenCalled());
      getVoicesSpy.mockClear();
      controller.abort(reason);

      await expect(voices).rejects.toBe(reason);
    }
  });

  it('rejects unexpected speech API failures instead of reporting unsupported', async () => {
    const reason = new TypeError('speech API failed');
    vi.spyOn(window.speechSynthesis, 'getVoices').mockImplementation(() => {
      throw reason;
    });

    await expect(getVoices()).rejects.toBe(reason);
  });
});

describe('WebGL serialization', () => {
  it('enables the attribute location returned by WebGL', async () => {
    if (IS_WEBKIT) return;
    const realm = PHANTOM_DARKNESS as Window & typeof globalThis;
    const prototype = realm.WebGLRenderingContext?.prototype;
    if (!prototype) return;
    const getAttribLocation = vi
      .spyOn(prototype, 'getAttribLocation')
      .mockReturnValue(3);
    const enableVertexAttribArray = vi.spyOn(
      prototype,
      'enableVertexAttribArray',
    );

    const data = await getCanvasWebgl();
    if (!data) return;
    expect(getAttribLocation).toHaveBeenCalled();
    expect(enableVertexAttribArray).toHaveBeenCalledWith(3);
  });

  it('uses deterministic extension and pixel arrays', async () => {
    const data = await getCanvasWebgl();
    if (!data) return;

    expect(data.extensions).toEqual([...data.extensions].sort());
    expect(new Set(data.extensions).size).toBe(data.extensions.length);
    expect(data.pixels).toHaveLength(17 * 42 * 4);
    if (data.pixels2) expect(data.pixels2).toHaveLength(17 * 42 * 4);
  });
});
