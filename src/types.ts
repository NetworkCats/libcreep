/** Names of the core components collected for every fingerprint. */
export const CORE_COMPONENT_NAMES = [
  'workerScope',
  'navigator',
  'windowFeatures',
  'headless',
  'htmlElementVersion',
  'cssMedia',
  'css',
  'screen',
  'voices',
  'media',
  'canvas2d',
  'canvasWebgl',
  'maths',
  'consoleErrors',
  'timezone',
  'clientRects',
  'offlineAudioContext',
  'fonts',
  'lies',
  'trash',
  'capturedErrors',
  'svg',
  'resistance',
  'intl',
  'features',
] as const;

/** Names of the auxiliary components collected by default. */
export const DEFAULT_AUXILIARY_COMPONENT_NAMES = [
  'mediaCapabilities',
  'mediaDevices',
  'status',
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

export interface ComponentHash {
  readonly $hash: string;
}

export type LieFlag = boolean | number;

export interface UserAgentData {
  readonly [key: string]: unknown;
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
  readonly [key: string]: unknown;
  readonly compressedGPU?: string;
  readonly confidence?: string;
  readonly grade?: string;
}

export interface WorkerScopeComponent extends ComponentHash {
  readonly [key: string]: unknown;
  readonly device?: string;
  readonly deviceMemory?: number;
  readonly gpu?: GPUInfo;
  readonly hardwareConcurrency?: number;
  readonly language?: string;
  readonly languages?: string;
  readonly lied?: LieFlag;
  readonly localeEntropyIsTrusty?: boolean;
  readonly localeIntlEntropyIsTrusty?: boolean;
  readonly platform?: string;
  readonly system?: string;
  readonly timezoneLocation?: string;
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentData;
  readonly webglRenderer?: string;
  readonly webglVendor?: string;
}

export interface NavigatorComponent extends ComponentHash {
  readonly [key: string]: unknown;
  readonly appVersion?: string;
  readonly bluetoothAvailability?: boolean;
  readonly device?: string;
  readonly deviceMemory?: number;
  readonly doNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
  readonly hardwareConcurrency?: number;
  readonly language?: string;
  readonly lied: LieFlag;
  readonly maxTouchPoints?: number | null;
  readonly mimeTypes?: ReadonlyArray<string>;
  readonly oscpu?: string;
  readonly platform?: string;
  readonly properties?: ReadonlyArray<string>;
  readonly system?: string;
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentData;
  readonly vendor?: string;
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
  readonly platformEstimate: ReadonlyArray<unknown>;
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
  readonly lied: LieFlag;
  readonly pixelDepth: number;
  readonly touch: boolean;
  readonly width: number;
}

export interface VoicesComponent extends ComponentHash {
  readonly defaultVoiceLang: string;
  readonly defaultVoiceName: string;
  readonly languages: ReadonlyArray<string>;
  readonly lied: LieFlag;
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
  readonly emojiSet: ReadonlyArray<unknown>;
  readonly emojiURI: string;
  readonly lied: LieFlag;
  readonly liedTextMetrics?: LieFlag;
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

export interface CanvasWebGLComponent extends ComponentHash {
  readonly dataURI?: string;
  readonly dataURI2?: string;
  readonly extensions: ReadonlyArray<string>;
  readonly gpu: GPUInfo;
  readonly lied: LieFlag;
  readonly parameterOrExtensionLie?: LieFlag;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly pixels?: string;
  readonly pixels2?: string;
}

export interface MathComponent extends ComponentHash {
  readonly data: Readonly<Record<string, unknown>>;
  readonly lied: boolean;
}

export interface ConsoleErrorsComponent extends ComponentHash {
  readonly errors: ReadonlyArray<unknown>;
}

export interface TimezoneComponent extends ComponentHash {
  readonly lied: LieFlag;
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
  readonly lied: LieFlag;
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
  readonly lied: LieFlag;
  readonly noise: number;
  readonly sampleSum: number;
  readonly totalUniqueSamples: number;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface FontsComponent extends ComponentHash {
  readonly apps: string;
  readonly emojiSet: ReadonlyArray<unknown>;
  readonly fontFaceLoadFonts: ReadonlyArray<string>;
  readonly lied: LieFlag;
  readonly pixelSizeSystemSum: number;
  readonly platformVersion?: string;
}

export interface ApiTamperingComponent extends ComponentHash {
  readonly data: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly totalLies: number;
}

export interface AnomaliesComponent extends ComponentHash {
  readonly trashBin: ReadonlyArray<unknown>;
}

export interface CapturedErrorsComponent extends ComponentHash {
  readonly data: ReadonlyArray<unknown>;
}

export interface SVGComponent extends ComponentHash {
  readonly bBox: number;
  readonly computedTextLength: number;
  readonly emojiSet: ReadonlyArray<unknown>;
  readonly extentOfChar: number;
  readonly lied: LieFlag;
  readonly subStringLength: number;
  readonly svgrectSystemSum: number;
}

export interface PrivacyResistanceComponent extends ComponentHash {
  readonly engine: string;
  readonly extension?: string;
  readonly mode?: string;
  readonly privacy?: string;
  readonly security?: Readonly<Record<string, boolean>>;
}

export interface IntlComponent extends ComponentHash {
  readonly dateTimeFormat?: string;
  readonly displayNames?: string;
  readonly lied: LieFlag;
  readonly listFormat?: string;
  readonly locale: string;
  readonly numberFormat?: string;
  readonly pluralRules?: string;
  readonly relativeTimeFormat?: string;
}

export interface EngineFeaturesComponent extends ComponentHash {
  readonly cssFeatures: ReadonlyArray<unknown>;
  readonly cssVersion?: string;
  readonly jsFeatures: ReadonlyArray<unknown>;
  readonly jsFeaturesKeys: string | ReadonlyArray<never>;
  readonly jsVersion?: string;
  readonly version?: string;
  readonly versionRange: ReadonlyArray<string>;
  readonly windowFeatures: ReadonlyArray<unknown>;
  readonly windowVersion?: string;
}

export interface CoreComponentValues {
  readonly workerScope?: WorkerScopeComponent;
  readonly navigator?: NavigatorComponent;
  readonly windowFeatures?: WindowFeaturesComponent;
  readonly headless?: HeadlessComponent;
  readonly htmlElementVersion?: HTMLElementPropertiesComponent;
  readonly cssMedia?: CSSMediaComponent;
  readonly css?: CSSComponent;
  readonly screen?: ScreenComponent;
  readonly voices?: VoicesComponent;
  readonly media?: MediaComponent;
  readonly canvas2d?: Canvas2DComponent;
  readonly canvasWebgl?: CanvasWebGLComponent;
  readonly maths?: MathComponent;
  readonly consoleErrors?: ConsoleErrorsComponent;
  readonly timezone?: TimezoneComponent;
  readonly clientRects?: ClientRectsComponent;
  readonly offlineAudioContext?: OfflineAudioContextComponent;
  readonly fonts?: FontsComponent;
  readonly lies?: ApiTamperingComponent;
  readonly trash?: AnomaliesComponent;
  readonly capturedErrors?: CapturedErrorsComponent;
  readonly svg?: SVGComponent;
  readonly resistance?: PrivacyResistanceComponent;
  readonly intl?: IntlComponent;
  readonly features?: EngineFeaturesComponent;
}

export interface ComponentError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

export type ComponentResult<T> =
  | {
      readonly durationMs: number;
      readonly status: 'fulfilled';
      readonly value: T;
    }
  | {
      readonly durationMs: number;
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

export interface StableComponentValues {
  readonly navigator: Partial<NavigatorComponent>;
  readonly screen: Partial<ScreenComponent>;
  readonly workerScope: Partial<WorkerScopeComponent>;
  readonly media: MediaComponent;
  readonly canvas2d: Partial<Canvas2DComponent>;
  readonly canvasWebgl: Partial<CanvasWebGLComponent>;
  readonly cssMedia: Partial<CSSMediaComponent>;
  readonly css: NonNullable<NonNullable<CSSComponent['system']>['fonts']>;
  readonly timezone: Partial<TimezoneComponent>;
  readonly offlineAudioContext: OfflineAudioContextComponent;
  readonly fonts: FontsComponent['fontFaceLoadFonts'];
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

export interface AuxiliaryComponentValues {
  readonly mediaCapabilities: Readonly<
    Record<string, ReadonlyArray<'efficient' | 'smooth'>>
  >;
  readonly mediaDevices: ReadonlyArray<MediaDeviceKind>;
  readonly status: BrowserStatus;
  readonly webRtc: Readonly<Record<string, unknown>>;
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
  readonly fuzzyHash: string;
  readonly bot: BotDetectionResult;
  /** Status, timing, and value or error for every core detection. */
  readonly components: CoreComponentResults;
  /** Successful core detection values, provided for convenient data access. */
  readonly values: CoreComponentValues;
  readonly stableComponents: StableFingerprint;
  readonly focusedHashes: FocusedHashes;
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

export interface LoadOptions {
  /** Print a structured collection report after each successful call. */
  readonly debug?: boolean;
  /** Configure the isolated worker used by the worker-scope detection. */
  readonly worker?: WorkerOptions;
}

export interface CollectionOptions {
  /**
   * Use STUN to collect WebRTC SDP and address signals. This can disclose
   * network information and add up to several seconds, so it is opt-in.
   */
  readonly includeWebRtc?: boolean;
  /** Cancels collection and detector resources when aborted. */
  readonly signal?: AbortSignal;
  /** Cancels collection after this many milliseconds. */
  readonly timeoutMs?: number;
}

export interface CollectOptions extends LoadOptions, CollectionOptions {}

export interface FingerprintCollector {
  readonly algorithmVersion: string;
  readonly libraryVersion: string;
  collect(options?: CollectionOptions): Promise<FingerprintResult>;
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
