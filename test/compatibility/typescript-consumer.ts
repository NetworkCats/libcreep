import {
  collect,
  LibCreepError,
  load,
  type BotRule,
  type CollectorCollectOptions,
  type FingerprintCollector,
  type FingerprintResult,
  type LibCreepErrorCode,
  type UnsupportedReason,
} from 'libcreep';

const options: CollectorCollectOptions = { optIn: ['webRtc'] };
// @ts-expect-error WebRTC is enabled through `optIn`.
const legacyOptions: CollectorCollectOptions = { includeWebRtc: true };
// @ts-expect-error Only opt-in auxiliary component names are accepted.
const invalidOptIn: CollectorCollectOptions = { optIn: ['status'] };
void legacyOptions;
void invalidOptIn;
const collector: Promise<FingerprintCollector> = load();
const cancelledLoad: Promise<FingerprintCollector> = load({
  signal: new AbortController().signal,
  timeoutMs: 1_000,
});
const result: Promise<FingerprintResult> = collect(options);
void cancelledLoad;

void result.then((fingerprint) => {
  const durationMs: number = fingerprint.durationMs;
  const version: string = fingerprint.algorithmVersion;
  const navigatorResult = fingerprint.components.navigator;
  if (navigatorResult.status === 'fulfilled') {
    const platform: string | undefined = navigatorResult.value.platform;
    const languages: ReadonlyArray<string> | undefined =
      navigatorResult.value.languages;
    void languages;
    void platform;
  }
  const canvasResult = fingerprint.components.canvas2d;
  if (canvasResult.status === 'fulfilled') {
    const componentHash: string = canvasResult.value.$hash;
    const emojiSet: ReadonlyArray<string> = canvasResult.value.emojiSet;
    // @ts-expect-error Public component interfaces must not degrade to `any`.
    const invalid: string = canvasResult.value.notAComponentField;
    void componentHash;
    void emojiSet;
    void invalid;
  }
  const fontsResult = fingerprint.components.fonts;
  if (fontsResult.status === 'fulfilled') {
    const apps: ReadonlyArray<string> = fontsResult.value.apps;
    void apps;
  }
  const featuresResult = fingerprint.components.engineFeatures;
  if (featuresResult.status === 'fulfilled') {
    const keys: ReadonlyArray<string> = featuresResult.value.jsFeaturesKeys;
    const features: ReadonlyArray<string> = featuresResult.value.jsFeatures;
    void features;
    void keys;
  }
  const resistanceResult = fingerprint.components.privacyResistance;
  if (resistanceResult.status === 'fulfilled') {
    const hashes: Readonly<Record<string, string>> | undefined =
      resistanceResult.value.extensionHashPattern;
    void hashes;
  }
  const stableMedia = fingerprint.stableComponents.media;
  if (stableMedia) {
    const mimeTypes = stableMedia.mimeTypes;
    // @ts-expect-error Stable components exclude their enrichment hash.
    const stableMediaHash: string = stableMedia.$hash;
    void mimeTypes;
    void stableMediaHash;
  }
  const stableAudio = fingerprint.stableComponents.offlineAudioContext;
  if (stableAudio) {
    const sampleSum: number = stableAudio.sampleSum;
    // @ts-expect-error Stable components exclude their enrichment hash.
    const stableAudioHash: string = stableAudio.$hash;
    void sampleSum;
    void stableAudioHash;
  }
  const stableCssMedia = fingerprint.stableComponents.cssMedia;
  if (stableCssMedia) {
    const anyHover: string | undefined = stableCssMedia.anyHover;
    const screenQuery: Readonly<{ height: number; width: number }> | undefined =
      stableCssMedia.screenQuery;
    // @ts-expect-error Stable CSS media uses flattened trust-filtered fields.
    void stableCssMedia.matchMediaCSS;
    void anyHover;
    void screenQuery;
  }
  const workerResult = fingerprint.components.workerScope;
  if (workerResult.status === 'fulfilled') {
    const engineLocale: string | undefined =
      workerResult.value.engineCurrencyLocale;
    const reduced: boolean | undefined = workerResult.value.uaPostReduction;
    const languages: ReadonlyArray<string> | undefined =
      workerResult.value.languages;
    const confidence: 'high' | 'moderate' | 'low' | undefined =
      workerResult.value.gpu?.confidence;
    void confidence;
    void engineLocale;
    void languages;
    void reduced;
  }
  if (navigatorResult.status === 'fulfilled') {
    const parsed: string | undefined = navigatorResult.value.userAgentParsed;
    const permissions:
      Readonly<Record<string, ReadonlyArray<string>>> | undefined =
      navigatorResult.value.permissions;
    const plugins = navigatorResult.value.plugins;
    const webgpu = navigatorResult.value.webgpu;
    const lied: boolean = navigatorResult.value.lied;
    // @ts-expect-error Navigator fields are closed, so typos do not type-check.
    void navigatorResult.value.userAgnet;
    // @ts-expect-error User-Agent Client Hints fields are closed as well.
    void navigatorResult.value.userAgentData?.platfrom;
    void lied;
    void parsed;
    void permissions;
    void plugins;
    void webgpu;
  }
  const webglResult = fingerprint.components.canvasWebgl;
  if (webglResult.status === 'unsupported') {
    const reason: UnsupportedReason | undefined = webglResult.reason;
    void reason;
  }
  const workerScopeLies = fingerprint.values.workerScope?.lies.proto;
  const matchedRules: ReadonlyArray<BotRule> = fingerprint.bot.matchedRules;
  const systemFonts = fingerprint.stableComponents.cssSystemFonts;
  const fontFaceFonts: ReadonlyArray<string> | undefined =
    fingerprint.stableComponents.fontFaceLoadFonts;
  const browserStatus = fingerprint.auxiliary.browserStatus;
  if (browserStatus.status === 'fulfilled') {
    const stackSize: number = browserStatus.value.stackSize;
    void stackSize;
  }
  const webRtc = fingerprint.auxiliary.webRtc;
  if (webRtc.status === 'fulfilled') {
    const address: string | undefined = webRtc.value.address;
    void address;
  }
  // @ts-expect-error Component keys use descriptive names, not Creep.js names.
  void fingerprint.components.lies;
  void fontFaceFonts;
  void matchedRules;
  void systemFonts;
  void workerScopeLies;
  // @ts-expect-error The ambiguous pre-v4 result field was removed.
  void fingerprint.version;
  void durationMs;
  void version;
});

void collector.then((loadedCollector) => {
  const version: string = loadedCollector.libraryVersion;
  // @ts-expect-error Collectors expose `collect()`, not the ambiguous `get()`.
  void loadedCollector.get();
  void version;
});

void result.catch((error: unknown) => {
  if (error instanceof LibCreepError) {
    const code: LibCreepErrorCode = error.code;
    void code;
  }
});

void collector;
void result;
