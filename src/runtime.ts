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
  initializePrototypeLies,
  lieRecords,
  removePhantom,
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
import { getBotDetection, getFuzzyHash } from './internal/utils/crypto.js';
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
import {
  createOperationCancellation,
  rejectWhenAborted,
  throwIfAborted,
} from './cancellation.js';
import { hashComponents, hashValue, normalizeError } from './hash.js';
import { ALGORITHM_VERSION, LIBRARY_VERSION } from './version.js';
import {
  CORE_COMPONENT_NAMES,
  type AuxiliaryComponentResults,
  type BotDetectionResult,
  type ComponentResult,
  type CollectionOptions,
  type CoreComponentName,
  type CoreComponentResults,
  type CoreComponentValues,
  type FingerprintResult,
  type FocusedHashes,
  type StableFingerprint,
  type WorkerStrategy,
} from './types.js';

type UnknownRecord = Record<string, unknown>;
type ProbeResults = Partial<
  Record<CoreComponentName, ComponentResult<unknown>>
>;
type FeaturesInput = Parameters<typeof getEngineFeatures>[0];
type HeadlessInput = Parameters<typeof getHeadlessFeatures>[0];
type NavigatorInput = Parameters<typeof getNavigator>[0];

interface RuntimeOptions extends CollectionOptions {
  readonly workerStrategy: WorkerStrategy;
  readonly workerUrl: string;
}

/** @internal Tracks detector work that may outlive its abort-facing wrapper. */
export interface DetectorActivity {
  readonly pending: Set<Promise<unknown>>;
}

function now(): number {
  return performance.now();
}

/** @internal Keeps the underlying detector visible after its wrapper aborts. */
export function trackDetectorOperation<T>(
  operation: Promise<T>,
  activity: DetectorActivity,
): Promise<T> {
  activity.pending.add(operation);
  void operation.then(
    () => activity.pending.delete(operation),
    () => activity.pending.delete(operation),
  );
  return operation;
}

/** @internal Waits for every detector started by the current collection. */
export async function drainDetectorActivity(
  activity: DetectorActivity,
): Promise<void> {
  while (activity.pending.size > 0) {
    await Promise.allSettled(activity.pending);
  }
}

function isCancellation(_error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

/** @internal Runs a probe while retaining its underlying lifetime. */
export async function runProbe(
  results: ProbeResults,
  name: CoreComponentName,
  detector: () => unknown | Promise<unknown>,
  signal?: AbortSignal,
  activity?: DetectorActivity,
): Promise<void> {
  const start = now();
  try {
    throwIfAborted(signal);
    const detectorOperation = Promise.resolve().then(detector);
    const value = await rejectWhenAborted(
      activity === undefined
        ? detectorOperation
        : trackDetectorOperation(detectorOperation, activity),
      signal,
    );
    throwIfAborted(signal);
    const durationMs = now() - start;
    results[name] =
      value === undefined || value === null
        ? { durationMs, status: 'unsupported' }
        : { durationMs, status: 'fulfilled', value };
  } catch (error) {
    if (isCancellation(error, signal)) throw error;
    results[name] = {
      durationMs: now() - start,
      error: normalizeError(error),
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

function readProbe<T = unknown>(
  results: ProbeResults,
  name: CoreComponentName,
): T | undefined {
  const result = results[name];
  return result?.status === 'fulfilled' ? (result.value as T) : undefined;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object'
    ? (value as UnknownRecord)
    : {};
}

function stripComponentHash(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const signals = { ...(value as UnknownRecord) };
  delete signals.$hash;
  return signals;
}

function hashRecordValue(
  record: UnknownRecord,
  key: string,
): Promise<string | undefined> {
  return Object.hasOwn(record, key) &&
    record[key] !== undefined &&
    record[key] !== null
    ? hashValue(record[key])
    : Promise.resolve(undefined);
}

function clonePlainData(
  value: unknown,
  clones: Map<object, unknown> = new Map(),
): unknown {
  if (value === null || typeof value !== 'object') return value;
  const existing = clones.get(value);
  if (existing !== undefined) return existing;

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (!isArray && prototype !== null && prototype !== Object.prototype) {
    throw new TypeError(
      'Cannot snapshot non-plain detector data without structuredClone.',
    );
  }

  const clone: object = isArray ? [] : Object.create(prototype);
  clones.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if (!('value' in descriptor)) {
      throw new TypeError(
        'Cannot snapshot accessor-based detector data without structuredClone.',
      );
    }
    Object.defineProperty(clone, key, {
      ...descriptor,
      value: clonePlainData(descriptor.value, clones),
    });
  }
  if (isArray) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (lengthDescriptor !== undefined) {
      Object.defineProperty(clone, 'length', lengthDescriptor);
    }
  }
  return clone;
}

/** @internal Clones detector data without a lossy JSON fallback. */
export function snapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return clonePlainData(value) as T;
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

function resetDetectorState(): number {
  errorsCaptured.resetErrors(snapshot(detectorStateBaseline.errors));
  lieRecords.resetRecords(snapshot(detectorStateBaseline.lies));
  trashBin.resetBin(snapshot(detectorStateBaseline.trash));
  resetRecord(Analysis, detectorStateBaseline.analysis);
  resetRecord(LowerEntropy, detectorStateBaseline.lowerEntropy);
  return initializePrototypeLies();
}

async function runAuxiliary<T>(
  detector: () => Promise<T>,
  signal?: AbortSignal,
): Promise<ComponentResult<NonNullable<T>>> {
  const start = now();
  try {
    throwIfAborted(signal);
    const detectorOperation = Promise.resolve().then(detector);
    const value = await rejectWhenAborted(detectorOperation, signal);
    throwIfAborted(signal);
    const durationMs = now() - start;
    return value === undefined || value === null
      ? { durationMs, status: 'unsupported' }
      : { durationMs, status: 'fulfilled', value };
  } catch (error) {
    if (isCancellation(error, signal)) throw error;
    return {
      durationMs: now() - start,
      error: normalizeError(error),
      status: 'rejected',
    };
  }
}

async function collectAuxiliary(
  includeWebRtc: boolean,
  signal?: AbortSignal,
): Promise<AuxiliaryComponentResults> {
  const [mediaDevices, status, mediaCapabilities, webRtc] = await Promise.all([
    runAuxiliary(getWebRTCDevices, signal),
    runAuxiliary(() => getStatus(signal), signal),
    runAuxiliary(getMediaCapabilities, signal),
    includeWebRtc
      ? runAuxiliary(() => getWebRTCData(signal), signal)
      : Promise.resolve({
          durationMs: 0,
          status: 'skipped',
        } as const),
  ]);

  return {
    mediaCapabilities:
      mediaCapabilities as AuxiliaryComponentResults['mediaCapabilities'],
    mediaDevices,
    status,
    webRtc,
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

/** @internal Builds hashes only for focused signal groups that are present. */
export async function buildFocusedHashes(
  raw: Readonly<Partial<Record<CoreComponentName, unknown>>>,
  braveFingerprintingBlocking = false,
): Promise<FocusedHashes> {
  const canvas2d = asRecord(raw.canvas2d);
  const webgl = asRecord(raw.canvasWebgl);
  const css = asRecord(raw.css);
  const rects = asRecord(raw.clientRects);
  const media = asRecord(raw.media);
  const screen = asRecord(raw.screen);
  const timezone = asRecord(raw.timezone);
  const navigatorData = asRecord(raw.navigator);
  const worker = asRecord(raw.workerScope);
  const webglParameters = asRecord(webgl.parameters);
  const hasWebglParameters = Object.values(webglParameters).some(
    (value) => value !== undefined && value !== null,
  );
  const clientRectValues = [
    rects.elementBoundingClientRect,
    rects.elementClientRects,
    rects.rangeBoundingClientRect,
    rects.rangeClientRects,
  ];
  const deviceAndTimezoneData = getDeviceOfTimezoneData({
    cssMedia: asRecord(raw.cssMedia),
    navigatorData,
    screen,
    timezone,
    worker,
  });
  const focusedHashCandidates: Record<
    keyof FocusedHashes,
    Promise<string | undefined> | undefined
  > = {
    canvas2dEmoji: hashRecordValue(canvas2d, 'emojiURI'),
    canvas2dImage: hashRecordValue(canvas2d, 'dataURI'),
    canvas2dPaint: hashRecordValue(canvas2d, 'paintURI'),
    canvas2dText: hashRecordValue(canvas2d, 'textURI'),
    canvasWebglImage: hashRecordValue(webgl, 'dataURI'),
    canvasWebglParameters: hasWebglParameters
      ? hashValue(getReducedGpuParameters(webgl, braveFingerprintingBlocking))
      : undefined,
    deviceAndTimezone: deviceAndTimezoneData.every(
      (value) => value === undefined || value === null,
    )
      ? undefined
      : hashValue(deviceAndTimezoneData),
    clientRects: clientRectValues.some(
      (value) => value === undefined || value === null,
    )
      ? undefined
      : hashValue(clientRectValues),
    mediaMimeTypes: hashRecordValue(media, 'mimeTypes'),
    cssComputedStyle: hashRecordValue(css, 'computedStyle'),
    cssSystem: hashRecordValue(css, 'system'),
  };
  const focusedHashEntries = await Promise.all(
    Object.entries(focusedHashCandidates).map(
      async ([name, hash]) => [name, await hash] as const,
    ),
  );
  return Object.fromEntries(
    focusedHashEntries.filter(([, hash]) => hash !== undefined),
  ) as FocusedHashes;
}

async function enrichComponents(
  results: ProbeResults,
  braveFingerprintingBlocking: boolean,
): Promise<{
  components: CoreComponentValues;
  focusedHashes: FocusedHashes;
}> {
  const raw = Object.fromEntries(
    CORE_COMPONENT_NAMES.map((name) => [name, readProbe(results, name)]),
  ) as Record<CoreComponentName, unknown>;
  const webgl = asRecord(raw.canvasWebgl);

  const hashTargets: Partial<Record<CoreComponentName, unknown>> = {
    ...raw,
    htmlElementVersion: asRecord(raw.htmlElementVersion).keys,
    maths: asRecord(raw.maths).data,
    consoleErrors: asRecord(raw.consoleErrors).errors,
  };
  const componentHashEntries = await Promise.all(
    CORE_COMPONENT_NAMES.map(async (name) => {
      const value = raw[name];
      return [
        name,
        value == null ? undefined : await hashValue(hashTargets[name]),
      ] as const;
    }),
  );
  const componentHashes = Object.fromEntries(componentHashEntries) as Record<
    CoreComponentName,
    string | undefined
  >;

  const hashPixels = (value: unknown): Promise<string | undefined> =>
    Array.isArray(value) && value.length > 0
      ? hashValue(value)
      : Promise.resolve(undefined);
  const [pixels, pixels2] = await Promise.all([
    hashPixels(webgl.pixels),
    hashPixels(webgl.pixels2),
  ]);

  const components = Object.fromEntries(
    CORE_COMPONENT_NAMES.flatMap((name) => {
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
  ) as CoreComponentValues;

  const focusedHashes = await buildFocusedHashes(
    raw,
    braveFingerprintingBlocking,
  );

  return { components, focusedHashes };
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

/** @internal Builds the trust-filtered input to the stable visitor ID. */
export function buildStableFingerprint(
  components: CoreComponentValues,
  braveFingerprintingBlocking: boolean,
  entropy: Readonly<Record<string, boolean>> = LowerEntropy,
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
  const audio = asRecord(stripComponentHash(fp.offlineAudioContext));
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
      ? {
          UNMASKED_RENDERER_WEBGL: undefined,
          UNMASKED_VENDOR_WEBGL: undefined,
        }
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
    if (Object.keys(webgl).length === 0 || webgl.lied || entropy.WEBGL) {
      return undefined;
    }
    const parameters = asRecord(webgl.parameters);
    const gpu = asRecord(webgl.gpu);
    const stableGpu =
      webgl.gpu === undefined || gpu.confidence === 'low'
        ? {}
        : { gpu: webgl.gpu };
    const stableWebglSignals = Object.fromEntries(
      Object.entries(webgl).filter(
        ([key]) => key !== '$hash' && key !== 'gpu' && key !== 'parameters',
      ),
    );
    if (braveFingerprintingBlocking) {
      return {
        parameters: {
          ...getBraveUnprotectedParameters(parameters),
          ...hardenGpu(),
        },
      };
    }
    const canvasIsUntrusted = canvas2d.lied || entropy.CANVAS;
    return {
      ...(canvasIsUntrusted
        ? {
            extensions: webgl.extensions,
            lied: webgl.lied,
            parameterOrExtensionLie: webgl.parameterOrExtensionLie,
          }
        : stableWebglSignals),
      ...stableGpu,
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
      entropy.SCREEN
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
            language: !entropy.TIME_ZONE ? worker.language : undefined,
            platform: worker.platform,
            system: worker.system,
            timezoneLocation: !entropy.TIME_ZONE
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
    media: stripComponentHash(fp.media),
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
              entropy.SCREEN ||
              entropy.IFRAME_SCREEN
                ? undefined
                : hardenEntropy(cssMedia.screenQuery),
          },
    css: asRecord(css.system).fonts,
    timezone:
      Object.keys(timezone).length === 0 || timezone.lied || entropy.TIME_ZONE
        ? undefined
        : {
            lied: timezone.lied,
            locationMeasured: hardenEntropy(timezone.locationMeasured),
          },
    offlineAudioContext:
      Object.keys(audio).length === 0 || audio.lied || entropy.AUDIO
        ? undefined
        : audio,
    fonts:
      Object.keys(fonts).length === 0 || fonts.lied || entropy.FONTS
        ? undefined
        : fonts.fontFaceLoadFonts,
  };

  return stable as StableFingerprint;
}

function completeResults(results: ProbeResults): CoreComponentResults {
  for (const name of CORE_COMPONENT_NAMES) {
    results[name] ??= { durationMs: 0, status: 'unsupported' };
  }
  return results as CoreComponentResults;
}

export async function collectFingerprint(
  options: RuntimeOptions,
): Promise<FingerprintResult> {
  const start = now();
  const results: ProbeResults = {};
  const detectorActivity: DetectorActivity = { pending: new Set() };
  const cancellation = createOperationCancellation(
    options.signal,
    options.timeoutMs,
  );
  const { signal } = cancellation;
  let auxiliaryPromise: Promise<AuxiliaryComponentResults> | undefined;
  let liesInitializationDurationMs = 0;
  const probe = (
    name: CoreComponentName,
    detector: () => unknown | Promise<unknown>,
  ): Promise<void> =>
    runProbe(results, name, detector, signal, detectorActivity);

  try {
    throwIfAborted(signal);
    liesInitializationDurationMs = resetDetectorState();
    throwIfAborted(signal);
    auxiliaryPromise = collectAuxiliary(options.includeWebRtc ?? false, signal);
    void auxiliaryPromise.catch(() => undefined);
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
        probe('voices', () => getVoices(signal)),
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
      getNavigator(readProbe<NavigatorInput>(results, 'workerScope')),
    );
    await waitForProbes(
      [
        probe('headless', () =>
          getHeadlessFeatures({
            webgl: readProbe<HeadlessInput['webgl']>(results, 'canvasWebgl'),
            workerScope: readProbe<HeadlessInput['workerScope']>(
              results,
              'workerScope',
            ),
          }),
        ),
        probe('features', () =>
          getEngineFeatures({
            cssComputed: readProbe<FeaturesInput['cssComputed']>(
              results,
              'css',
            ),
            navigatorComputed: readProbe<FeaturesInput['navigatorComputed']>(
              results,
              'navigator',
            ),
            windowFeaturesComputed: readProbe<
              FeaturesInput['windowFeaturesComputed']
            >(results, 'windowFeatures'),
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
    const liesResult = results.lies;
    if (liesResult !== undefined) {
      results.lies = {
        ...liesResult,
        durationMs: liesResult.durationMs + liesInitializationDurationMs,
      };
    }

    const { components: collectedValues, focusedHashes } =
      await rejectWhenAborted(
        enrichComponents(results, braveFingerprintingBlocking),
        signal,
      );
    throwIfAborted(signal);
    const values = snapshot(collectedValues);
    for (const name of CORE_COMPONENT_NAMES) {
      const component = results[name];
      const value = values[name];
      if (component?.status === 'fulfilled' && value !== undefined) {
        results[name] = { ...component, value };
      }
    }
    const components = completeResults(results);
    const stableComponents = snapshot(
      buildStableFingerprint(values, braveFingerprintingBlocking),
    );
    const auxiliary = snapshot(await auxiliaryPromise);
    const [rawVisitorId, visitorId, fuzzyHash, bot] = await rejectWhenAborted(
      Promise.all([
        hashComponents(
          components as unknown as Readonly<
            Record<string, ComponentResult<unknown>>
          >,
        ),
        hashValue({
          algorithmVersion: ALGORITHM_VERSION,
          components: stableComponents,
        }),
        getFuzzyHash(values),
        Promise.resolve(
          getBotDetection(values, { computeWindowsRelease, getFeaturesLie }),
        ),
      ]),
      signal,
    );
    throwIfAborted(signal);

    return {
      auxiliary,
      algorithmVersion: ALGORITHM_VERSION,
      bot: bot as BotDetectionResult,
      components,
      durationMs: now() - start,
      focusedHashes,
      fuzzyHash,
      libraryVersion: LIBRARY_VERSION,
      rawVisitorId,
      stableComponents,
      values,
      visitorId,
    };
  } catch (error) {
    await auxiliaryPromise?.catch(() => undefined);
    await drainDetectorActivity(detectorActivity);
    throwIfAborted(signal);
    throw error;
  } finally {
    cancellation.dispose();
    removePhantom();
  }
}
