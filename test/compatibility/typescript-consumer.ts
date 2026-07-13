import libcreep, {
  collect,
  load,
  type CollectionOptions,
  type FingerprintCollector,
  type FingerprintResult,
} from 'libcreep';

const options: CollectionOptions = { includeWebRtc: false };
const collector: Promise<FingerprintCollector> = load();
const result: Promise<FingerprintResult> = collect(options);

void result.then((fingerprint) => {
  const durationMs: number = fingerprint.durationMs;
  const version: string = fingerprint.algorithmVersion;
  const navigatorResult = fingerprint.components.navigator;
  if (navigatorResult.status === 'fulfilled') {
    const platform: string | undefined = navigatorResult.value.platform;
    void platform;
  }
  const canvasResult = fingerprint.components.canvas2d;
  if (canvasResult.status === 'fulfilled') {
    const componentHash: string = canvasResult.value.$hash;
    // @ts-expect-error Public component interfaces must not degrade to `any`.
    const invalid: string = canvasResult.value.notAComponentField;
    void componentHash;
    void invalid;
  }
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

void libcreep;
void collector;
void result;
