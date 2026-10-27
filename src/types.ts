/** Names of the core components collected for every fingerprint. */
export const CORE_COMPONENT_NAMES = [
  'workerScope',
  'navigator',
  'windowFeatures',
  'headless',
  'htmlElementProperties',
  'cssMedia',
  'css',
  'screen',
  'voices',
  'media',
  'canvas2d',
  'canvasWebgl',
  'math',
  'consoleErrors',
  'timezone',
  'clientRects',
  'offlineAudioContext',
  'fonts',
  'apiTampering',
  'anomalies',
  'capturedErrors',
  'svg',
  'privacyResistance',
  'intl',
  'engineFeatures',
] as const;

/** Names of the auxiliary components collected by default. */
export const DEFAULT_AUXILIARY_COMPONENT_NAMES = [
  'mediaCapabilities',
  'mediaDevices',
  'browserStatus',
] as const;

/** Names of auxiliary components that require explicit opt-in. */
export const OPT_IN_AUXILIARY_COMPONENT_NAMES = ['webRtc'] as const;

/** Names of every auxiliary component, including opt-in components. */
export const AUXILIARY_COMPONENT_NAMES = [
  ...DEFAULT_AUXILIARY_COMPONENT_NAMES,
  ...OPT_IN_AUXILIARY_COMPONENT_NAMES,
] as const;

export type CoreComponentName = (typeof CORE_COMPONENT_NAMES)[number];
export type AuxiliaryComponentName = (typeof AUXILIARY_COMPONENT_NAMES)[number];
export type OptInAuxiliaryComponentName =
  (typeof OPT_IN_AUXILIARY_COMPONENT_NAMES)[number];

export interface ComponentHash {
  readonly $hash: string;
}

/** Low- and high-entropy User-Agent Client Hints, with compressed brands. */
export interface UserAgentData {
  readonly architecture?: string;
  readonly bitness?: string;
  readonly brands?: ReadonlyArray<string>;
  readonly brandsVersion?: ReadonlyArray<string>;
  readonly mobile?: boolean;
  readonly model?: string;
  readonly platform?: string;
  readonly platformVersion?: string;
  readonly uaFullVersion?: string;
}

export interface GPUInfo {
  readonly compressedGPU?: string;
  readonly confidence?: 'high' | 'moderate' | 'low';
  readonly gibbers?: string;
  readonly grade?: 'A' | 'C' | 'F';
  readonly parts?: string;
  readonly warnings?: ReadonlyArray<string>;
}

export interface NavigatorPlugin {
  readonly description: string;
  readonly filename: string;
  readonly name: string;
  readonly version?: string;
}

export interface WebGPUInfo {
  readonly adapterInfo: ReadonlyArray<string | undefined>;
  readonly limits: Readonly<Record<string, number>>;
}

/** Lies detected inside the worker scope, keyed by the inconsistency found. */
export interface WorkerScopeLies {
  /** Prototype lies by API, or `false` when none were found. */
  readonly proto: false | Readonly<Record<string, ReadonlyArray<string>>>;
  readonly engine?: string;
  readonly os?: string;
  readonly platformVersion?: string;
  readonly version?: string;
}

export interface WorkerScopeComponent extends ComponentHash {
  readonly device?: string;
  readonly deviceMemory?: number;
  readonly gpu?: GPUInfo;
  readonly hardwareConcurrency?: number;
  readonly language?: string;
  readonly languages?: ReadonlyArray<string>;
  readonly lied: boolean;
  readonly lies: WorkerScopeLies;
  readonly locale?: string;
  readonly localeEntropyIsTrusty?: boolean;
  readonly localeIntlEntropyIsTrusty?: boolean;
  readonly platform?: string;
  readonly system?: string;
  readonly engineCurrencyLocale?: string;
  readonly systemCurrencyLocale?: string;
  readonly timezoneOffset?: number;
  readonly timezoneLocation?: string;
  readonly uaPostReduction?: boolean;
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentData;
  readonly userAgentDataVersion?: string;
  readonly userAgentEngine?: string;
  readonly userAgentVersion?: string;
  readonly webglRenderer?: string;
  readonly webglVendor?: string;
}

export interface NavigatorComponent extends ComponentHash {
  readonly appVersion?: string;
  readonly bluetoothAvailability?: boolean;
  readonly device?: string;
  readonly deviceMemory?: number;
  readonly doNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
  readonly hardwareConcurrency?: number;
  readonly language?: string;
  readonly languages?: ReadonlyArray<string>;
  readonly lied: boolean;
  readonly maxTouchPoints?: number | null;
  readonly mimeTypes?: ReadonlyArray<string>;
  readonly oscpu?: string;
  readonly platform?: string;
  readonly plugins?: ReadonlyArray<NavigatorPlugin>;
  readonly permissions?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly properties?: ReadonlyArray<string>;
  readonly system?: string;
  readonly uaPostReduction?: boolean;
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentData;
  readonly userAgentParsed?: string;
  readonly vendor?: string;
  readonly webgpu?: WebGPUInfo;
}

export interface WindowFeaturesComponent extends ComponentHash {
  readonly apple: number;
  readonly keys: ReadonlyArray<string>;
  readonly moz: number;
  readonly webkit: number;
}

export interface HeadlessComponent extends ComponentHash {
  readonly chromium: boolean;
  readonly headless: Readonly<Record<string, boolean>>;
  readonly headlessRating: number;
  readonly likeHeadless: Readonly<Record<string, boolean>>;
  readonly likeHeadlessRating: number;
  /** Blink-only platform scores and the highest score; empty elsewhere. */
  readonly platformEstimate:
    | readonly []
    | readonly [scores: Readonly<Record<string, number>>, highestScore: number];
  readonly stealth: Readonly<Record<string, boolean>>;
  readonly stealthRating: number;
  readonly systemFonts: string;
}

export interface HTMLElementPropertiesComponent extends ComponentHash {
  readonly keys: ReadonlyArray<string>;
}

export type CSSMediaValues = Readonly<Record<string, string | undefined>>;

export interface CSSMediaComponent extends ComponentHash {
  readonly matchMediaCSS: CSSMediaValues;
  readonly mediaCSS: CSSMediaValues;
  readonly screenQuery: Readonly<{ height: number; width: number }>;
}

export type CSSSystemValues = ReadonlyArray<Readonly<Record<string, string>>>;

export interface CSSComponent extends ComponentHash {
  readonly computedStyle?: Readonly<{
    interfaceName?: string;
    keys: ReadonlyArray<string>;
  }>;
  readonly system?: Readonly<{
    colors: CSSSystemValues;
    fonts: CSSSystemValues;
  }>;
}

export interface ScreenComponent extends ComponentHash {
  readonly availHeight: number;
  readonly availWidth: number;
  readonly colorDepth: number;
  readonly height: number;
  readonly lied: boolean;
  readonly pixelDepth: number;
  readonly touch: boolean;
  readonly width: number;
}

export interface VoicesComponent extends ComponentHash {
  readonly defaultVoiceLang: string;
  readonly defaultVoiceName: string;
  readonly languages: ReadonlyArray<string>;
  readonly lied: boolean;
  readonly local: ReadonlyArray<string>;
  readonly remote: ReadonlyArray<string>;
}

export interface MediaMimeTypeSupport {
  readonly audioPlayType: CanPlayTypeResult;
  readonly mediaRecorder: boolean;
  readonly mediaSource: boolean;
  readonly mimeType: string;
  readonly videoPlayType: CanPlayTypeResult;
}

export interface MediaComponent extends ComponentHash {
  readonly mimeTypes?: ReadonlyArray<MediaMimeTypeSupport>;
}

export interface Canvas2DComponent extends ComponentHash {
  readonly dataURI: string;
  readonly emojiSet: ReadonlyArray<string>;
  readonly emojiURI: string;
  readonly lied: boolean;
  readonly liedTextMetrics?: boolean;
  readonly mods?: Readonly<{
    pixelImage: string;
    pixels?: number;
    rgba?: string;
  }>;
  readonly paintCpuURI: string;
  readonly paintURI: string;
  readonly textMetricsSystemSum: number;
  readonly textURI: string;
}

/** A serialized `getParameter()`, context-attribute, or precision value. */
export type WebGLParameterValue =
  boolean | number | string | null | undefined | ReadonlyArray<number>;

export interface CanvasWebGLComponent extends ComponentHash {
  readonly dataURI?: string;
  readonly dataURI2?: string;
  readonly extensions: ReadonlyArray<string>;
  readonly gpu: GPUInfo;
  readonly lied: boolean;
  readonly parameterOrExtensionLie?: boolean;
  readonly parameters: Readonly<Record<string, WebGLParameterValue>>;
  readonly pixels?: string;
  readonly pixels2?: string;
}

/** One Math expression result and the engines whose output it matches. */
export interface MathExpressionResult {
  readonly chrome: boolean;
  readonly firefox: boolean;
  readonly result: number | ReadonlyArray<number>;
  readonly safari: boolean;
  readonly torBrowser: boolean;
}

export interface MathComponent extends ComponentHash {
  /** Results keyed by expression; `undefined` when an expression threw. */
  readonly data: Readonly<Record<string, MathExpressionResult | undefined>>;
  readonly lied: boolean;
}

export interface ConsoleErrorsComponent extends ComponentHash {
  readonly errors: ReadonlyArray<string>;
}

export interface TimezoneComponent extends ComponentHash {
  readonly lied: boolean;
  readonly location?: string;
  readonly locationEpoch: number;
  readonly locationMeasured?: string;
  readonly offset: number;
  readonly offsetComputed: number;
  readonly zone: string;
}

export interface ClientRectsComponent extends ComponentHash {
  readonly domrectSystemSum: number;
  readonly elementBoundingClientRect: ReadonlyArray<
    Readonly<Record<string, number>>
  >;
  readonly elementClientRects: ReadonlyArray<Readonly<Record<string, number>>>;
  readonly emojiSet: ReadonlyArray<string>;
  readonly lied: boolean;
  readonly rangeBoundingClientRect: ReadonlyArray<
    Readonly<Record<string, number>>
  >;
  readonly rangeClientRects: ReadonlyArray<Readonly<Record<string, number>>>;
}

export interface OfflineAudioContextComponent extends ComponentHash {
  readonly binsSample: ReadonlyArray<number | undefined>;
  readonly compressorGainReduction?: number;
  readonly copySample: ReadonlyArray<number | undefined>;
  readonly floatFrequencyDataSum: number;
  readonly floatTimeDomainDataSum: number;
  readonly lied: boolean;
  readonly noise: number;
  readonly sampleSum: number;
  readonly totalUniqueSamples: number;
  /** Audio node properties keyed by `Interface.property` path. */
  readonly values: Readonly<Record<string, number | string | undefined>>;
}

export interface FontsComponent extends ComponentHash {
  readonly apps: ReadonlyArray<string>;
  readonly emojiSet: ReadonlyArray<string>;
  readonly fontFaceLoadFonts: ReadonlyArray<string>;
  readonly lied: boolean;
  readonly pixelSizeSystemSum: number;
  readonly platformVersion?: string;
}

export interface ApiTamperingComponent extends ComponentHash {
  readonly data: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly totalLies: number;
}

export interface AnomalyEntry {
  /** API or signal in which the anomaly was found. */
  readonly name: string;
  /** Description of the anomaly, or the untrusted value that caused it. */
  readonly value: unknown;
}

export interface AnomaliesComponent extends ComponentHash {
  readonly trashBin: ReadonlyArray<AnomalyEntry>;
}

/** A detector error, reduced to fields that are stable across engines. */
export interface CapturedError {
  readonly trustedMessage?: string;
  readonly trustedName?: string;
}

export interface CapturedErrorsComponent extends ComponentHash {
  readonly data: ReadonlyArray<CapturedError>;
}

export interface SVGComponent extends ComponentHash {
  readonly bBox: number;
  readonly computedTextLength: number;
  readonly emojiSet: ReadonlyArray<string>;
  readonly extentOfChar: number;
  readonly lied: boolean;
  readonly subStringLength: number;
  readonly svgrectSystemSum: number;
}

export interface PrivacyResistanceComponent extends ComponentHash {
  readonly engine: string;
  readonly extension?: string;
  readonly extensionHashPattern?: Readonly<Record<string, string>>;
  readonly mode?: string;
  readonly privacy?: string;
  readonly security?: Readonly<Record<string, boolean>>;
}

export interface IntlComponent extends ComponentHash {
  readonly dateTimeFormat?: string;
  readonly displayNames?: string;
  readonly lied: boolean;
  readonly listFormat?: string;
  readonly locale: string;
  readonly numberFormat?: string;
  readonly pluralRules?: string;
  readonly relativeTimeFormat?: string;
}

export interface EngineFeaturesComponent extends ComponentHash {
  readonly cssFeatures: ReadonlyArray<string>;
  /** Pinned feature-map estimate; terminal values can be lower bounds like `115+`. */
  readonly cssVersion?: string;
  readonly jsFeatures: ReadonlyArray<string>;
  readonly jsFeaturesKeys: ReadonlyArray<string>;
  /** Pinned feature-map estimate; terminal values can be lower bounds like `115+`. */
  readonly jsVersion?: string;
  /** Pinned feature-map estimate; terminal values can be lower bounds like `115+`. */
  readonly version?: string;
  /** Minimum-known range represented by the pinned feature maps. */
  readonly versionRange: ReadonlyArray<string>;
  readonly windowFeatures: ReadonlyArray<string>;
  /** Pinned feature-map estimate; terminal values can be lower bounds like `115+`. */
  readonly windowVersion?: string;
}

export interface CoreComponentValues {
  readonly workerScope?: WorkerScopeComponent;
  readonly navigator?: NavigatorComponent;
  readonly windowFeatures?: WindowFeaturesComponent;
  readonly headless?: HeadlessComponent;
  readonly htmlElementProperties?: HTMLElementPropertiesComponent;
  readonly cssMedia?: CSSMediaComponent;
  readonly css?: CSSComponent;
  readonly screen?: ScreenComponent;
  readonly voices?: VoicesComponent;
  readonly media?: MediaComponent;
  readonly canvas2d?: Canvas2DComponent;
  readonly canvasWebgl?: CanvasWebGLComponent;
  readonly math?: MathComponent;
  readonly consoleErrors?: ConsoleErrorsComponent;
  readonly timezone?: TimezoneComponent;
  readonly clientRects?: ClientRectsComponent;
  readonly offlineAudioContext?: OfflineAudioContextComponent;
  readonly fonts?: FontsComponent;
  readonly apiTampering?: ApiTamperingComponent;
  readonly anomalies?: AnomaliesComponent;
  readonly capturedErrors?: CapturedErrorsComponent;
  readonly svg?: SVGComponent;
  readonly privacyResistance?: PrivacyResistanceComponent;
  readonly intl?: IntlComponent;
  readonly engineFeatures?: EngineFeaturesComponent;
}

export interface ComponentError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

/**
 * Known cause of an `unsupported` result. It is absent when a detector
 * produced no value without reporting why.
 */
export type UnsupportedReason =
  /** A browser API that the detector requires is missing. */
  | 'api-unavailable'
  /** No selected worker transport produced a usable worker scope. */
  | 'worker-unavailable';

export type ComponentResult<T> =
  | {
      readonly durationMs: number;
      readonly status: 'fulfilled';
      readonly value: T;
    }
  | {
      readonly durationMs: number;
      readonly reason?: UnsupportedReason;
      readonly status: 'unsupported';
    }
  | {
      readonly durationMs: number;
      readonly error: ComponentError;
      readonly status: 'rejected';
    }
  | {
      readonly durationMs: number;
      readonly status: 'skipped';
    };

export type CoreComponentResults = {
  readonly [K in CoreComponentName]: ComponentResult<
    NonNullable<CoreComponentValues[K]>
  >;
};

/** Trust-filtered CSS media fields used by the stable visitor identifier. */
export interface StableCSSMediaComponent {
  readonly anyHover?: string;
  readonly anyPointer?: string;
  readonly colorGamut?: string;
  readonly colorScheme?: string;
  readonly forcedColors?: string;
  readonly hover?: string;
  readonly invertedColors?: string;
  readonly monochrome?: string;
  readonly pointer?: string;
  readonly reducedMotion?: string;
  readonly screenQuery?: CSSMediaComponent['screenQuery'];
}

export interface StableComponentValues {
  readonly navigator: Partial<Omit<NavigatorComponent, '$hash'>>;
  readonly screen: Partial<Omit<ScreenComponent, '$hash'>>;
  readonly workerScope: Partial<Omit<WorkerScopeComponent, '$hash'>>;
  readonly media: Omit<MediaComponent, '$hash'>;
  readonly canvas2d: Partial<Omit<Canvas2DComponent, '$hash'>>;
  readonly canvasWebgl: Partial<Omit<CanvasWebGLComponent, '$hash'>>;
  readonly cssMedia: StableCSSMediaComponent;
  /** CSS system fonts (`css.system.fonts`). */
  readonly cssSystemFonts: CSSSystemValues;
  readonly timezone: Partial<Omit<TimezoneComponent, '$hash'>>;
  readonly offlineAudioContext: Omit<OfflineAudioContextComponent, '$hash'>;
  /** Fonts confirmed through `FontFace` loading (`fonts.fontFaceLoadFonts`). */
  readonly fontFaceLoadFonts: FontsComponent['fontFaceLoadFonts'];
}

export type StableComponentName = keyof StableComponentValues;
export type StableFingerprint = Readonly<Partial<StableComponentValues>>;

export interface FocusedHashes {
  readonly canvas2dEmoji?: string;
  readonly canvas2dImage?: string;
  readonly canvas2dPaint?: string;
  readonly canvas2dText?: string;
  readonly canvasWebglImage?: string;
  readonly canvasWebglParameters?: string;
  readonly clientRects?: string;
  readonly cssComputedStyle?: string;
  readonly cssSystem?: string;
  readonly deviceAndTimezone?: string;
  readonly mediaMimeTypes?: string;
}

/** Bot-rule order used by {@link BotDetectionResult.botMask}. */
export const BOT_RULE_NAMES = [
  'liedWorkerScope',
  'liedPlatformVersion',
  'functionToStringHasProxy',
  'outsideFeaturesVersion',
  'extremeLieCount',
  'excessiveLooseFingerprints',
  'workerScopeIsBlocked',
  'crowdBlendingScoreIsLow',
] as const;

export type BotRule = (typeof BOT_RULE_NAMES)[number];

export interface BotDetectionResult {
  /** Eight binary flags in the documented bot-rule order. */
  readonly botMask: string;
  /** First matching client-side rule, if any. */
  readonly firstMatchedRule?: BotRule;
  /** Every matching client-side rule, in bot-mask order. */
  readonly matchedRules: ReadonlyArray<BotRule>;
}

export interface BrowserStatus {
  readonly charging?: boolean;
  readonly chargingTime?: number;
  readonly clientLitter: ReadonlyArray<string>;
  readonly dischargingTime?: number;
  readonly downlink?: number;
  readonly downlinkMax?: number;
  readonly effectiveType?: string;
  readonly level?: number;
  readonly memory: number | null;
  readonly memoryInGigabytes: number | null;
  readonly quota: number | null;
  readonly quotaInGigabytes: number | null;
  readonly quotaIsInsecure: boolean | null;
  readonly rtt?: number;
  readonly saveData?: boolean;
  readonly scriptSize: number | null;
  readonly scripts: ReadonlyArray<string>;
  readonly stackSize: number;
  readonly timingRes: readonly [number, number];
  readonly type?: string;
}

/** Decoding support flags keyed by media MIME type and codec. */
export type MediaCapabilitiesComponent = Readonly<
  Record<string, ReadonlyArray<'efficient' | 'smooth'>>
>;

/** Sorted kinds of the available media input and output devices. */
export type MediaDevicesComponent = ReadonlyArray<MediaDeviceKind>;

/** One codec parsed from the WebRTC offer SDP. */
export interface WebRTCCodec {
  readonly channels?: number;
  readonly clockRates?: ReadonlyArray<number>;
  readonly feedbackSupport?: ReadonlyArray<string>;
  readonly mimeType?: string;
  readonly sdpFmtpLine?: ReadonlyArray<string>;
}

/** WebRTC SDP and ICE signals; address fields need a STUN candidate. */
export interface WebRTCComponent {
  readonly address?: string;
  readonly codecsSdp?: Readonly<{
    audio?: ReadonlyArray<WebRTCCodec>;
    video?: ReadonlyArray<WebRTCCodec>;
  }>;
  readonly extensions?: ReadonlyArray<string>;
  readonly foundation: string;
  readonly foundationProp?: string | null;
  readonly iceCandidate: string;
  readonly stunConnection?: string;
}

export interface AuxiliaryComponentValues {
  readonly mediaCapabilities: MediaCapabilitiesComponent;
  readonly mediaDevices: MediaDevicesComponent;
  readonly browserStatus: BrowserStatus;
  readonly webRtc: WebRTCComponent;
}

export type AuxiliaryComponentResults = {
  readonly [K in AuxiliaryComponentName]: ComponentResult<
    AuxiliaryComponentValues[K]
  >;
};

export interface FingerprintResult {
  /** Hash of the hardened, stable component set. */
  readonly visitorId: string;
  /** Hash of all raw Creep.js components, including unstable entropy. */
  readonly rawVisitorId: string;
  /** 64-character similarity signature; not a cryptographic identifier. */
  readonly fuzzyHash: string;
  /** Client-side bot rules that matched this collection. */
  readonly bot: BotDetectionResult;
  /** Status, timing, and value or error for every core detection. */
  readonly components: CoreComponentResults;
  /** Successful core detection values, provided for convenient data access. */
  readonly values: CoreComponentValues;
  /** The exact trust-filtered values hashed into `visitorId`. */
  readonly stableComponents: StableFingerprint;
  /** SHA-256 hashes of narrower signal groups that were available. */
  readonly focusedHashes: FocusedHashes;
  /** Probes excluded from `visitorId` and `rawVisitorId`. */
  readonly auxiliary: AuxiliaryComponentResults;
  /** Total collection time in milliseconds. */
  readonly durationMs: number;
  /** Fingerprinting algorithm version. */
  readonly algorithmVersion: string;
  /** Installed package version. */
  readonly libraryVersion: string;
}

export type WorkerStrategy = 'auto' | 'dedicated-only' | 'service-first';

export interface WorkerOptions {
  /** Worker asset URL. Override when a bundler or CDN relocates assets. */
  readonly url?: string | URL;
  /** Worker selection order. Defaults to the non-mutating `auto` strategy. */
  readonly strategy?: WorkerStrategy;
}

/** Settings fixed when a collector is created and applied to every call. */
export interface CollectorConfig {
  /** Print a structured collection report after each successful call. */
  readonly debug?: boolean;
  /** Configure the isolated worker used by the worker-scope detection. */
  readonly worker?: WorkerOptions;
}

export interface LoadOptions extends CollectorConfig {
  /** Cancels document readiness and runtime loading only, not later calls. */
  readonly signal?: AbortSignal;
  /** Cancels loading only, after up to 2,147,483,647ms. */
  readonly timeoutMs?: number;
}

export interface CollectorCollectOptions {
  /**
   * Opt-in auxiliary probes to run. `webRtc` uses STUN to collect SDP and
   * address signals; it can disclose network information and add up to
   * several seconds.
   */
  readonly optIn?: ReadonlyArray<OptInAuxiliaryComponentName>;
  /** Cancels a queued or active collection and its detector resources. */
  readonly signal?: AbortSignal;
  /** Cancels queueing or active collection after up to 2,147,483,647ms. */
  readonly timeoutMs?: number;
}

export interface CollectOptions
  extends CollectorConfig, CollectorCollectOptions {
  /** Cancels one-shot loading, queueing, and active detector resources. */
  readonly signal?: AbortSignal;
  /** Cancels the full one-shot operation after up to 2,147,483,647ms. */
  readonly timeoutMs?: number;
}

export interface FingerprintCollector {
  readonly algorithmVersion: string;
  readonly libraryVersion: string;
  collect(options?: CollectorCollectOptions): Promise<FingerprintResult>;
}

export interface BrowserCapabilities {
  readonly hasDedicatedWorker: boolean;
  readonly hasServiceWorker: boolean;
  readonly hasSharedWorker: boolean;
  readonly hasTextEncoder: boolean;
  readonly hasWebCrypto: boolean;
  readonly isBrowser: boolean;
  readonly isSecureContext: boolean;
}
