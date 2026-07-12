import getOfflineAudioContext from './internal/audio/index.js';
import getCanvas2d from './internal/canvas/index.js';
import getCSS from './internal/css/index.js';
import getCSSMedia from './internal/cssmedia/index.js';
import getHTMLElementVersion from './internal/document/index.js';
import getClientRects from './internal/domrect/index.js';
import getConsoleErrors from './internal/engine/index.js';
import { errorsCaptured, getCapturedErrors } from './internal/errors/index.js';
import getEngineFeatures, {
  getFeaturesLie,
} from './internal/features/index.js';
import getFonts from './internal/fonts/index.js';
import getHeadlessFeatures from './internal/headless/index.js';
import getIntl from './internal/intl/index.js';
import {
  getLies,
  lieRecords,
  removePhantom,
  renewPhantom,
} from './internal/lies/index.js';
import getMaths from './internal/math/index.js';
import getMedia from './internal/media/index.js';
import getNavigator from './internal/navigator/index.js';
import getResistance from './internal/resistance/index.js';
import getScreen from './internal/screen/index.js';
import getVoices from './internal/speech/index.js';
import { getStatus } from './internal/status/index.js';
import getSVG from './internal/svg/index.js';
import getTimezone from './internal/timezone/index.js';
import { getTrash, trashBin } from './internal/trash/index.js';
import { getBotHash, getFuzzyHash, hashify } from './internal/utils/crypto.js';
import {
  braveBrowser,
  computeWindowsRelease,
  getBraveMode,
  getBraveUnprotectedParameters,
  IS_BLINK,
  LowerEntropy,
  Analysis,
} from './internal/utils/helpers.js';
import getCanvasWebgl from './internal/webgl/index.js';
import getWebRTCData, {
  getMediaCapabilities,
  getWebRTCDevices,
} from './internal/webrtc/index.js';
import getWindowFeatures from './internal/window/index.js';
import getBestWorkerScope from './internal/worker/index.js';
import { hashComponents, hashValue } from './hash.js';
import { ALGORITHM_VERSION, VERSION } from './version.js';
import {
  DETECTION_NAMES,
  type AuxiliaryResults,
  type BotResult,
  type ComponentResult,
  type ComponentResults,
  type DetectionError,
  type DetectionName,
  type FingerprintComponentValues,
  type FingerprintHashes,
  type FingerprintResult,
  type GetOptions,
  type StableFingerprint,
  type WorkerStrategy,
} from './types.js';

type UnknownRecord = Record<string, unknown>;
type ProbeResults = Partial<Record<DetectionName, ComponentResult<unknown>>>;

interface RuntimeOptions extends GetOptions {
  readonly workerStrategy: WorkerStrategy;
  readonly workerUrl: string;
}

interface CollectionCancellation {
  readonly dispose: () => void;
  readonly signal?: AbortSignal;
}

function now(): number {
  return performance.now();
}

function serializeError(error: unknown): DetectionError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { message: String(error), name: 'Error' };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException('Fingerprint collection was aborted.', 'AbortError')
  );
}

function rejectWhenAborted<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal === undefined) return operation;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): boolean => {
      if (settled) return false;
      settled = true;
      signal.removeEventListener('abort', abort);
      return true;
    };
    const abort = (): void => {
      if (!cleanup()) return;
      reject(
        signal.reason ??
          new DOMException('Fingerprint collection was aborted.', 'AbortError'),
      );
    };

    void operation.then(
      (value) => {
        if (cleanup()) resolve(value);
      },
      (error: unknown) => {
        if (cleanup()) reject(error);
      },
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function isCancellation(_error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function createCollectionCancellation(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): CollectionCancellation {
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs < 0)
  ) {
    throw new TypeError('timeoutMs must be a finite, non-negative number.');
  }
  if (signal === undefined && timeoutMs === undefined) {
    return { dispose: () => undefined };
  }

  const controller = new AbortController();
  const forwardAbort = (): void => {
    controller.abort(signal?.reason);
  };
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  const timeout =
    timeoutMs === undefined
      ? undefined
      : window.setTimeout(() => {
          controller.abort(
            new DOMException(
              `Fingerprint collection timed out after ${timeoutMs}ms.`,
              'TimeoutError',
            ),
          );
        }, timeoutMs);

  return {
    signal: controller.signal,
    dispose(): void {
      signal?.removeEventListener('abort', forwardAbort);
      if (timeout !== undefined) window.clearTimeout(timeout);
    },
  };
}

async function runProbe(
  results: ProbeResults,
  name: DetectionName,
  detector: () => unknown | Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> {
  const start = now();
  try {
    throwIfAborted(signal);
    const value = await rejectWhenAborted(
      Promise.resolve().then(detector),
      signal,
    );
    throwIfAborted(signal);
    const duration = now() - start;
    results[name] =
      value === undefined || value === null
        ? { duration, status: 'unsupported' }
        : { duration, status: 'fulfilled', value };
  } catch (error) {
    if (isCancellation(error, signal)) throw error;
    results[name] = {
      duration: now() - start,
      error: serializeError(error),
      status: 'rejected',
    };
  }
}

async function waitForProbes(
  probes: ReadonlyArray<Promise<void>>,
  signal?: AbortSignal,
): Promise<void> {
  const settled = await Promise.allSettled(probes);
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected !== undefined) throw rejected.reason;
  throwIfAborted(signal);
}

function readProbe(results: ProbeResults, name: DetectionName): unknown {
  const result = results[name];
  return result?.status === 'fulfilled' ? result.value : undefined;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object'
    ? (value as UnknownRecord)
    : {};
}

function snapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

const detectorStateBaseline = {
  analysis: snapshot(Analysis),
  errors: snapshot(getCapturedErrors().data),
  lies: snapshot(getLies().data),
  lowerEntropy: snapshot(LowerEntropy),
  trash: snapshot(getTrash().trashBin),
};

function resetRecord(
  record: Record<string, unknown>,
  baseline: Record<string, unknown>,
): void {
  for (const key of Object.keys(record)) delete record[key];
  Object.assign(record, snapshot(baseline));
}

function resetDetectorState(): void {
  errorsCaptured.resetErrors(snapshot(detectorStateBaseline.errors));
  lieRecords.resetRecords(snapshot(detectorStateBaseline.lies));
  trashBin.resetBin(snapshot(detectorStateBaseline.trash));
  resetRecord(Analysis, detectorStateBaseline.analysis);
  resetRecord(LowerEntropy, detectorStateBaseline.lowerEntropy);
  renewPhantom();
}

async function runAuxiliary<T>(
  detector: () => Promise<T>,
  signal?: AbortSignal,
): Promise<ComponentResult<NonNullable<T>>> {
  const start = now();
  try {
    throwIfAborted(signal);
    const value = await rejectWhenAborted(
      Promise.resolve().then(detector),
      signal,
    );
    throwIfAborted(signal);
    const duration = now() - start;
    return value === undefined || value === null
      ? { duration, status: 'unsupported' }
      : { duration, status: 'fulfilled', value };
  } catch (error) {
    if (isCancellation(error, signal)) throw error;
    return {
      duration: now() - start,
      error: serializeError(error),
      status: 'rejected',
    };
  }
}

async function collectAuxiliary(
  includeWebRTC: boolean,
  signal?: AbortSignal,
): Promise<AuxiliaryResults> {
  const [mediaDevices, status, mediaCapabilities, webRTC] = await Promise.all([
    runAuxiliary(getWebRTCDevices, signal),
    runAuxiliary(() => getStatus(signal), signal),
    runAuxiliary(getMediaCapabilities, signal),
    includeWebRTC
      ? runAuxiliary(() => getWebRTCData(signal), signal)
      : Promise.resolve({
          duration: 0,
          status: 'skipped',
        } as const),
  ]);

  return {
    mediaCapabilities,
    mediaDevices,
    status,
    webRTC,
  };
}

function getReducedGpuParameters(
  webgl: UnknownRecord,
  braveFingerprintingBlocking: boolean,
): UnknownRecord {
  const parameters = asRecord(webgl.parameters);
  return {
    ...(braveFingerprintingBlocking
      ? getBraveUnprotectedParameters(parameters)
      : parameters),
    RENDERER: undefined,
    SHADING_LANGUAGE_VERSION: undefined,
    UNMASKED_RENDERER_WEBGL: undefined,
    UNMASKED_VENDOR_WEBGL: undefined,
    VERSION: undefined,
    VENDOR: undefined,
  };
}

async function enrichComponents(
  results: ProbeResults,
  braveFingerprintingBlocking: boolean,
): Promise<{
  components: FingerprintComponentValues;
  hashes: FingerprintHashes;
}> {
  const raw = Object.fromEntries(
    DETECTION_NAMES.map((name) => [name, readProbe(results, name)]),
  ) as Record<DetectionName, unknown>;
  const webgl = asRecord(raw.canvasWebgl);
  const canvas2d = asRecord(raw.canvas2d);
  const css = asRecord(raw.css);
  const rects = asRecord(raw.clientRects);
  const media = asRecord(raw.media);
  const screen = asRecord(raw.screen);
  const timezone = asRecord(raw.timezone);
  const navigatorData = asRecord(raw.navigator);
  const worker = asRecord(raw.workerScope);
  const reducedGpuParameters = getReducedGpuParameters(
    webgl,
    braveFingerprintingBlocking,
  );

  const hashTargets: Partial<Record<DetectionName, unknown>> = {
    ...raw,
    htmlElementVersion: asRecord(raw.htmlElementVersion).keys,
    maths: asRecord(raw.maths).data,
    consoleErrors: asRecord(raw.consoleErrors).errors,
  };
  const componentHashEntries = await Promise.all(
    DETECTION_NAMES.map(async (name) => {
      const value = raw[name];
      return [
        name,
        value == null ? undefined : await hashify(hashTargets[name]),
      ] as const;
    }),
  );
  const componentHashes = Object.fromEntries(componentHashEntries) as Record<
    DetectionName,
    string | undefined
  >;

  const pixels =
    Array.isArray(webgl.pixels) && webgl.pixels.length > 0
      ? await hashify(webgl.pixels)
      : undefined;
  const pixels2 =
    Array.isArray(webgl.pixels2) && webgl.pixels2.length > 0
      ? await hashify(webgl.pixels2)
      : undefined;

  const components = Object.fromEntries(
    DETECTION_NAMES.flatMap((name) => {
      const value = raw[name];
      const hash = componentHashes[name];
      if (value == null || hash === undefined) return [];
      const data = asRecord(value);
      return [
        [
          name,
          name === 'canvasWebgl'
            ? { ...data, $hash: hash, pixels, pixels2 }
            : { ...data, $hash: hash },
        ],
      ];
    }),
  ) as FingerprintComponentValues;

  for (const name of DETECTION_NAMES) {
    const result = results[name];
    const component = components[name];
    if (result?.status === 'fulfilled' && component !== undefined) {
      results[name] = { ...result, value: component };
    }
  }

  const hashes: FingerprintHashes = {
    canvas2dEmoji: await hashify(canvas2d.emojiURI),
    canvas2dImage: await hashify(canvas2d.dataURI),
    canvas2dPaint: await hashify(canvas2d.paintURI),
    canvas2dText: await hashify(canvas2d.textURI),
    canvasWebglImage: await hashify(webgl.dataURI),
    canvasWebglParameters: await hashify(reducedGpuParameters),
    deviceOfTimezone: await hashify(
      getDeviceOfTimezoneData({
        cssMedia: asRecord(raw.cssMedia),
        navigatorData,
        screen,
        timezone,
        worker,
      }),
    ),
    domRect: await hashify([
      rects.elementBoundingClientRect,
      rects.elementClientRects,
      rects.rangeBoundingClientRect,
      rects.rangeClientRects,
    ]),
    mimeTypes: await hashify(media.mimeTypes),
    style: await hashify(css.computedStyle),
    styleSystem: await hashify(css.system),
  };

  return { components, hashes };
}

interface DeviceOfTimezoneInput {
  readonly cssMedia: UnknownRecord;
  readonly navigatorData: UnknownRecord;
  readonly screen: UnknownRecord;
  readonly timezone: UnknownRecord;
  readonly worker: UnknownRecord;
}

function getDeviceOfTimezoneData(input: DeviceOfTimezoneInput): unknown[] {
  const { cssMedia, navigatorData, screen, timezone, worker } = input;
  const userAgentData = asRecord(navigatorData.userAgentData);
  const workerUserAgentData = asRecord(worker.userAgentData);
  const gpu = asRecord(worker.gpu);
  const mediaCSS = asRecord(cssMedia.mediaCSS);
  const gpuData =
    gpu.compressedGPU && gpu.confidence !== 'low' ? [gpu.compressedGPU] : [];

  return [
    mediaCSS['any-pointer'],
    userAgentData.architecture,
    workerUserAgentData.architecture,
    userAgentData.bitness,
    workerUserAgentData.bitness,
    navigatorData.bluetoothAvailability,
    screen.colorDepth,
    ...gpuData,
    navigatorData.device,
    navigatorData.deviceMemory,
    worker.deviceMemory,
    navigatorData.hardwareConcurrency,
    worker.hardwareConcurrency,
    screen.height,
    timezone.location,
    worker.timezoneLocation,
    timezone.locationEpoch,
    navigatorData.maxTouchPoints,
    userAgentData.mobile,
    workerUserAgentData.mobile,
    userAgentData.model,
    workerUserAgentData.model,
    navigatorData.oscpu,
    screen.pixelDepth,
    navigatorData.platform,
    worker.platform,
    userAgentData.platformVersion,
    workerUserAgentData.platformVersion,
    navigatorData.system,
    worker.system,
    userAgentData.platform,
    workerUserAgentData.platform,
    screen.width,
    timezone.zone,
  ];
}

function buildStableFingerprint(
  components: FingerprintComponentValues,
  braveFingerprintingBlocking: boolean,
): StableFingerprint {
  const fp = components as Record<string, unknown>;
  const worker = asRecord(fp.workerScope);
  const navigatorData = asRecord(fp.navigator);
  const screen = asRecord(fp.screen);
  const resistance = asRecord(fp.resistance);
  const canvas2d = asRecord(fp.canvas2d);
  const webgl = asRecord(fp.canvasWebgl);
  const cssMedia = asRecord(fp.cssMedia);
  const css = asRecord(fp.css);
  const timezone = asRecord(fp.timezone);
  const audio = asRecord(fp.offlineAudioContext);
  const fonts = asRecord(fp.fonts);
  const privacyResistFingerprinting = /^(tor browser|firefox)$/i.test(
    String(resistance.privacy ?? ''),
  );

  const hardenEntropy = (value: unknown): unknown =>
    Object.keys(worker).length === 0 ||
    (worker.localeEntropyIsTrusty && worker.localeIntlEntropyIsTrusty)
      ? value
      : undefined;
  const hardenGpu = (): UnknownRecord => {
    const gpu = asRecord(webgl.gpu);
    const parameters = asRecord(webgl.parameters);
    return gpu.confidence === 'low'
      ? {}
      : {
          UNMASKED_RENDERER_WEBGL: gpu.compressedGPU,
          UNMASKED_VENDOR_WEBGL: parameters.UNMASKED_VENDOR_WEBGL,
        };
  };

  const stableCanvas2d = (() => {
    if (Object.keys(canvas2d).length === 0) return undefined;
    let data: UnknownRecord | undefined;
    if (!canvas2d.lied) {
      data = {
        dataURI: canvas2d.dataURI,
        emojiURI: canvas2d.emojiURI,
        lied: canvas2d.lied,
        paintURI: canvas2d.paintURI,
        textURI: canvas2d.textURI,
      };
    }
    if (!canvas2d.liedTextMetrics) {
      data = {
        ...data,
        emojiSet: canvas2d.emojiSet,
        textMetricsSystemSum: canvas2d.textMetricsSystemSum,
      };
    }
    return data;
  })();

  const stableWebgl = (() => {
    if (Object.keys(webgl).length === 0 || webgl.lied || LowerEntropy.WEBGL) {
      return undefined;
    }
    const parameters = asRecord(webgl.parameters);
    if (braveFingerprintingBlocking) {
      return {
        parameters: {
          ...getBraveUnprotectedParameters(parameters),
          ...hardenGpu(),
        },
      };
    }
    const canvasIsUntrusted = canvas2d.lied || LowerEntropy.CANVAS;
    return {
      ...(canvasIsUntrusted
        ? {
            extensions: webgl.extensions,
            gpu: webgl.gpu,
            lied: webgl.lied,
            parameterOrExtensionLie: webgl.parameterOrExtensionLie,
          }
        : webgl),
      parameters: { ...parameters, ...hardenGpu() },
    };
  })();

  const mediaCSS = asRecord(cssMedia.mediaCSS);
  const stable: Record<string, unknown> = {
    navigator:
      Object.keys(navigatorData).length === 0 || navigatorData.lied
        ? undefined
        : {
            bluetoothAvailability: navigatorData.bluetoothAvailability,
            device: navigatorData.device,
            deviceMemory: navigatorData.deviceMemory,
            hardwareConcurrency: navigatorData.hardwareConcurrency,
            maxTouchPoints: navigatorData.maxTouchPoints,
            oscpu: navigatorData.oscpu,
            platform: navigatorData.platform,
            system: navigatorData.system,
            userAgentData: {
              ...asRecord(navigatorData.userAgentData),
              brandsVersion: undefined,
              uaFullVersion: undefined,
            },
            vendor: navigatorData.vendor,
          },
    screen:
      Object.keys(screen).length === 0 ||
      screen.lied ||
      privacyResistFingerprinting ||
      LowerEntropy.SCREEN
        ? undefined
        : hardenEntropy({
            colorDepth: screen.colorDepth,
            height: screen.height,
            lied: screen.lied,
            pixelDepth: screen.pixelDepth,
            width: screen.width,
          }),
    workerScope:
      Object.keys(worker).length === 0 || worker.lied
        ? undefined
        : {
            device: worker.device,
            deviceMemory: braveFingerprintingBlocking
              ? undefined
              : worker.deviceMemory,
            hardwareConcurrency: braveFingerprintingBlocking
              ? undefined
              : worker.hardwareConcurrency,
            language: !LowerEntropy.TIME_ZONE ? worker.language : undefined,
            platform: worker.platform,
            system: worker.system,
            timezoneLocation: !LowerEntropy.TIME_ZONE
              ? hardenEntropy(worker.timezoneLocation)
              : undefined,
            userAgentData: {
              ...asRecord(worker.userAgentData),
              brandsVersion: undefined,
              uaFullVersion: undefined,
            },
            webglRenderer:
              asRecord(worker.gpu).confidence !== 'low'
                ? asRecord(worker.gpu).compressedGPU
                : undefined,
            webglVendor:
              asRecord(worker.gpu).confidence !== 'low'
                ? worker.webglVendor
                : undefined,
          },
    media: fp.media,
    canvas2d: stableCanvas2d,
    canvasWebgl: stableWebgl,
    cssMedia:
      Object.keys(cssMedia).length === 0
        ? undefined
        : {
            anyHover: mediaCSS['any-hover'],
            anyPointer: mediaCSS['any-pointer'],
            colorGamut: mediaCSS['color-gamut'],
            colorScheme: braveFingerprintingBlocking
              ? undefined
              : mediaCSS['prefers-color-scheme'],
            forcedColors: mediaCSS['forced-colors'],
            hover: mediaCSS.hover,
            invertedColors: mediaCSS['inverted-colors'],
            monochrome: mediaCSS.monochrome,
            pointer: mediaCSS.pointer,
            reducedMotion: mediaCSS['prefers-reduced-motion'],
            screenQuery:
              privacyResistFingerprinting ||
              LowerEntropy.SCREEN ||
              LowerEntropy.IFRAME_SCREEN
                ? undefined
                : hardenEntropy(cssMedia.screenQuery),
          },
    css: asRecord(css.system).fonts,
    timezone:
      Object.keys(timezone).length === 0 ||
      timezone.lied ||
      LowerEntropy.TIME_ZONE
        ? undefined
        : {
            lied: timezone.lied,
            locationMeasured: hardenEntropy(timezone.locationMeasured),
          },
    offlineAudioContext:
      Object.keys(audio).length === 0 || audio.lied || LowerEntropy.AUDIO
        ? undefined
        : audio,
    fonts:
      Object.keys(fonts).length === 0 || fonts.lied || LowerEntropy.FONTS
        ? undefined
        : fonts.fontFaceLoadFonts,
    forceRenew: 1737085481442,
  };

  return stable as StableFingerprint;
}

function completeResults(results: ProbeResults): ComponentResults {
  for (const name of DETECTION_NAMES) {
    results[name] ??= { duration: 0, status: 'unsupported' };
  }
  return results as ComponentResults;
}

export async function collectFingerprint(
  options: RuntimeOptions,
): Promise<FingerprintResult> {
  const start = now();
  const results: ProbeResults = {};
  const cancellation = createCollectionCancellation(
    options.signal,
    options.timeoutMs,
  );
  resetDetectorState();
  const { signal } = cancellation;
  const auxiliaryPromise = collectAuxiliary(
    options.includeWebRTC ?? false,
    signal,
  );
  void auxiliaryPromise.catch(() => undefined);
  const probe = (
    name: DetectionName,
    detector: () => unknown | Promise<unknown>,
  ): Promise<void> => runProbe(results, name, detector, signal);

  try {
    throwIfAborted(signal);
    const isBrave = IS_BLINK
      ? await rejectWhenAborted(Promise.resolve(braveBrowser()), signal)
      : false;
    throwIfAborted(signal);
    const braveMode: { standard?: boolean; strict?: boolean } = isBrave
      ? getBraveMode()
      : {};
    const braveFingerprintingBlocking = Boolean(
      isBrave && (braveMode.standard || braveMode.strict),
    );

    await waitForProbes(
      [
        probe('workerScope', () =>
          getBestWorkerScope(options.workerUrl, options.workerStrategy, signal),
        ),
        probe('voices', getVoices),
        probe('offlineAudioContext', () => getOfflineAudioContext(signal)),
        probe('canvasWebgl', getCanvasWebgl),
        probe('canvas2d', getCanvas2d),
        probe('windowFeatures', getWindowFeatures),
        probe('htmlElementVersion', getHTMLElementVersion),
        probe('css', getCSS),
        probe('cssMedia', getCSSMedia),
        probe('screen', () => getScreen(false)),
        probe('maths', getMaths),
        probe('consoleErrors', getConsoleErrors),
        probe('timezone', getTimezone),
        probe('clientRects', getClientRects),
        probe('fonts', getFonts),
        probe('media', getMedia),
        probe('svg', getSVG),
        probe('resistance', getResistance),
        probe('intl', getIntl),
      ],
      signal,
    );

    await probe('navigator', () =>
      getNavigator(readProbe(results, 'workerScope')),
    );
    await waitForProbes(
      [
        probe('headless', () =>
          getHeadlessFeatures({
            webgl: readProbe(results, 'canvasWebgl'),
            workerScope: readProbe(results, 'workerScope'),
          }),
        ),
        probe('features', () =>
          getEngineFeatures({
            cssComputed: readProbe(results, 'css'),
            navigatorComputed: readProbe(results, 'navigator'),
            windowFeaturesComputed: readProbe(results, 'windowFeatures'),
          }),
        ),
      ],
      signal,
    );
    await waitForProbes(
      [
        probe('lies', getLies),
        probe('trash', getTrash),
        probe('capturedErrors', getCapturedErrors),
      ],
      signal,
    );

    const { components: collectedValues, hashes } = await rejectWhenAborted(
      enrichComponents(results, braveFingerprintingBlocking),
      signal,
    );
    throwIfAborted(signal);
    const values = snapshot(collectedValues);
    for (const name of DETECTION_NAMES) {
      const component = results[name];
      const value = values[name];
      if (component?.status === 'fulfilled' && value !== undefined) {
        results[name] = { ...component, value };
      }
    }
    const components = completeResults(results);
    const stableComponents = buildStableFingerprint(
      values,
      braveFingerprintingBlocking,
    );
    const auxiliary = snapshot(await auxiliaryPromise);
    const [rawVisitorId, visitorId, fuzzyHash, bot] = await rejectWhenAborted(
      Promise.all([
        hashComponents(
          components as unknown as Readonly<
            Record<string, ComponentResult<unknown>>
          >,
        ),
        hashValue(stableComponents),
        getFuzzyHash(values),
        Promise.resolve(
          getBotHash(values, { computeWindowsRelease, getFeaturesLie }),
        ),
      ]),
      signal,
    );
    throwIfAborted(signal);

    return {
      auxiliary,
      bot: bot as BotResult,
      components,
      duration: now() - start,
      fuzzyHash,
      hashes,
      libraryVersion: VERSION,
      rawVisitorId,
      stableComponents,
      values,
      version: ALGORITHM_VERSION,
      visitorId,
    };
  } catch (error) {
    await auxiliaryPromise.catch(() => undefined);
    throw error;
  } finally {
    cancellation.dispose();
    removePhantom();
  }
}
