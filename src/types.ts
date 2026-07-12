import type getOfflineAudioContext from './internal/audio/index.js';
import type getCanvas2d from './internal/canvas/index.js';
import type getCSS from './internal/css/index.js';
import type getCSSMedia from './internal/cssmedia/index.js';
import type getHTMLElementVersion from './internal/document/index.js';
import type getClientRects from './internal/domrect/index.js';
import type getConsoleErrors from './internal/engine/index.js';
import type { getCapturedErrors } from './internal/errors/index.js';
import type getEngineFeatures from './internal/features/index.js';
import type getFonts from './internal/fonts/index.js';
import type getHeadlessFeatures from './internal/headless/index.js';
import type getIntl from './internal/intl/index.js';
import type { getLies } from './internal/lies/index.js';
import type getMaths from './internal/math/index.js';
import type getMedia from './internal/media/index.js';
import type getNavigator from './internal/navigator/index.js';
import type getResistance from './internal/resistance/index.js';
import type getScreen from './internal/screen/index.js';
import type getVoices from './internal/speech/index.js';
import type { getStatus } from './internal/status/index.js';
import type getSVG from './internal/svg/index.js';
import type getTimezone from './internal/timezone/index.js';
import type { getTrash } from './internal/trash/index.js';
import type getCanvasWebgl from './internal/webgl/index.js';
import type getWebRTCData from './internal/webrtc/index.js';
import type {
  getMediaCapabilities,
  getWebRTCDevices,
} from './internal/webrtc/index.js';
import type getWindowFeatures from './internal/window/index.js';
import type getBestWorkerScope from './internal/worker/index.js';

export const DETECTION_NAMES = [
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

export const DEFAULT_AUXILIARY_DETECTION_NAMES = [
  'mediaCapabilities',
  'mediaDevices',
  'status',
] as const;

export const OPT_IN_DETECTION_NAMES = ['webRTC'] as const;

export const AUXILIARY_DETECTION_NAMES = [
  ...DEFAULT_AUXILIARY_DETECTION_NAMES,
  ...OPT_IN_DETECTION_NAMES,
] as const;

export type DetectionName = (typeof DETECTION_NAMES)[number];
export type AuxiliaryDetectionName = (typeof AUXILIARY_DETECTION_NAMES)[number];

export interface ComponentHash {
  readonly $hash: string;
}

type Hashed<T> = NonNullable<Awaited<T>> & ComponentHash;

export type WorkerScopeComponent = Hashed<
  ReturnType<typeof getBestWorkerScope>
>;
export type NavigatorComponent = Hashed<ReturnType<typeof getNavigator>>;
export type WindowFeaturesComponent = Hashed<
  ReturnType<typeof getWindowFeatures>
>;
export type HeadlessComponent = Hashed<ReturnType<typeof getHeadlessFeatures>>;
export type HtmlElementVersionComponent = Hashed<
  ReturnType<typeof getHTMLElementVersion>
>;
export type CssMediaComponent = Hashed<ReturnType<typeof getCSSMedia>>;
export type CssComponent = Hashed<ReturnType<typeof getCSS>>;
export type ScreenComponent = Hashed<ReturnType<typeof getScreen>>;
export type VoicesComponent = Hashed<ReturnType<typeof getVoices>>;
export type MediaComponent = Hashed<ReturnType<typeof getMedia>>;
export type Canvas2dComponent = Hashed<ReturnType<typeof getCanvas2d>>;
export type CanvasWebglComponent = Hashed<ReturnType<typeof getCanvasWebgl>>;
export type MathsComponent = Hashed<ReturnType<typeof getMaths>>;
export type ConsoleErrorsComponent = Hashed<
  ReturnType<typeof getConsoleErrors>
>;
export type TimezoneComponent = Hashed<ReturnType<typeof getTimezone>>;
export type ClientRectsComponent = Hashed<ReturnType<typeof getClientRects>>;
export type OfflineAudioContextComponent = Hashed<
  ReturnType<typeof getOfflineAudioContext>
>;
export type FontsComponent = Hashed<ReturnType<typeof getFonts>>;
export type LiesComponent = Hashed<ReturnType<typeof getLies>>;
export type TrashComponent = Hashed<ReturnType<typeof getTrash>>;
export type CapturedErrorsComponent = Hashed<
  ReturnType<typeof getCapturedErrors>
>;
export type SvgComponent = Hashed<ReturnType<typeof getSVG>>;
export type ResistanceComponent = Hashed<ReturnType<typeof getResistance>>;
export type IntlComponent = Hashed<ReturnType<typeof getIntl>>;
export type FeaturesComponent = Hashed<ReturnType<typeof getEngineFeatures>>;

export interface FingerprintComponentValues {
  readonly workerScope?: WorkerScopeComponent;
  readonly navigator?: NavigatorComponent;
  readonly windowFeatures?: WindowFeaturesComponent;
  readonly headless?: HeadlessComponent;
  readonly htmlElementVersion?: HtmlElementVersionComponent;
  readonly cssMedia?: CssMediaComponent;
  readonly css?: CssComponent;
  readonly screen?: ScreenComponent;
  readonly voices?: VoicesComponent;
  readonly media?: MediaComponent;
  readonly canvas2d?: Canvas2dComponent;
  readonly canvasWebgl?: CanvasWebglComponent;
  readonly maths?: MathsComponent;
  readonly consoleErrors?: ConsoleErrorsComponent;
  readonly timezone?: TimezoneComponent;
  readonly clientRects?: ClientRectsComponent;
  readonly offlineAudioContext?: OfflineAudioContextComponent;
  readonly fonts?: FontsComponent;
  readonly lies?: LiesComponent;
  readonly trash?: TrashComponent;
  readonly capturedErrors?: CapturedErrorsComponent;
  readonly svg?: SvgComponent;
  readonly resistance?: ResistanceComponent;
  readonly intl?: IntlComponent;
  readonly features?: FeaturesComponent;
}

export interface DetectionError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

export type ComponentResult<T> =
  | {
      readonly duration: number;
      readonly status: 'fulfilled';
      readonly value: T;
    }
  | {
      readonly duration: number;
      readonly status: 'unsupported';
    }
  | {
      readonly duration: number;
      readonly error: DetectionError;
      readonly status: 'rejected';
    }
  | {
      readonly duration: number;
      readonly status: 'skipped';
    };

export type ComponentResults = {
  readonly [K in DetectionName]: ComponentResult<
    NonNullable<FingerprintComponentValues[K]>
  >;
};

export interface StableComponentValues {
  readonly navigator: Partial<NavigatorComponent>;
  readonly screen: Partial<ScreenComponent>;
  readonly workerScope: Partial<WorkerScopeComponent>;
  readonly media: MediaComponent;
  readonly canvas2d: Partial<Canvas2dComponent>;
  readonly canvasWebgl: Partial<CanvasWebglComponent>;
  readonly cssMedia: Partial<CssMediaComponent>;
  readonly css: NonNullable<NonNullable<CssComponent['system']>['fonts']>;
  readonly timezone: Partial<TimezoneComponent>;
  readonly offlineAudioContext: OfflineAudioContextComponent;
  readonly fonts: FontsComponent['fontFaceLoadFonts'];
  readonly forceRenew: number;
}

export type StableComponentName = keyof StableComponentValues;
export type StableFingerprint = Readonly<Partial<StableComponentValues>>;

export interface FingerprintHashes {
  readonly canvas2dEmoji?: string;
  readonly canvas2dImage?: string;
  readonly canvas2dPaint?: string;
  readonly canvas2dText?: string;
  readonly canvasWebglImage?: string;
  readonly canvasWebglParameters?: string;
  readonly deviceOfTimezone?: string;
  readonly domRect?: string;
  readonly mimeTypes?: string;
  readonly style?: string;
  readonly styleSystem?: string;
}

export interface BotResult {
  readonly badBot?: string;
  readonly botHash: string;
}

export interface AuxiliaryComponentValues {
  readonly mediaCapabilities: NonNullable<
    Awaited<ReturnType<typeof getMediaCapabilities>>
  >;
  readonly mediaDevices: NonNullable<
    Awaited<ReturnType<typeof getWebRTCDevices>>
  >;
  readonly status: NonNullable<Awaited<ReturnType<typeof getStatus>>>;
  readonly webRTC: NonNullable<Awaited<ReturnType<typeof getWebRTCData>>>;
}

export type AuxiliaryResults = {
  readonly [K in AuxiliaryDetectionName]: ComponentResult<
    AuxiliaryComponentValues[K]
  >;
};

export interface FingerprintResult {
  /** Hash of the hardened, stable component set. */
  readonly visitorId: string;
  /** Hash of all raw Creep.js components, including unstable entropy. */
  readonly rawVisitorId: string;
  readonly fuzzyHash: string;
  readonly bot: BotResult;
  /** Status, timing, and value or error for every core detection. */
  readonly components: ComponentResults;
  /** Successful core detection values, provided for convenient data access. */
  readonly values: FingerprintComponentValues;
  readonly stableComponents: StableFingerprint;
  readonly hashes: FingerprintHashes;
  readonly auxiliary: AuxiliaryResults;
  readonly duration: number;
  /** Fingerprinting algorithm version. */
  readonly version: string;
  /** Installed package version. */
  readonly libraryVersion: string;
}

export type WorkerStrategy =
  'auto' | 'dedicated' | 'service-first' | 'shared-first';

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

export interface GetOptions {
  /**
   * Use STUN to collect WebRTC SDP and address signals. This can disclose
   * network information and add up to several seconds, so it is opt-in.
   */
  readonly includeWebRTC?: boolean;
  /** Cancels collection and detector resources when aborted. */
  readonly signal?: AbortSignal;
  /** Cancels collection after this many milliseconds. */
  readonly timeoutMs?: number;
}

export interface FingerprintAgent {
  readonly algorithmVersion: string;
  readonly version: string;
  get(options?: GetOptions): Promise<FingerprintResult>;
}

export interface BrowserSupport {
  readonly browserEnvironment: boolean;
  readonly secureContext: boolean;
  readonly webCrypto: boolean;
  readonly workers: boolean;
}
