# API reference

For task-oriented snippets, see [Examples](./examples.md).

## Imports and runtime boundary

`libcreep` is ESM-only and provides named exports only:

```ts
import { collect, getBrowserCapabilities, load } from 'libcreep';
```

Importing the module does not read browser globals, so it is safe in SSR and
Node-based build tools. Fingerprint collection itself requires a browser
window.

The value exports are `load`, `collect`, `hashComponents`,
`componentsToDebugString`, `getBrowserCapabilities`,
`isFingerprintingSupported`, `LibCreepError`, `ALGORITHM_VERSION`,
`LIBRARY_VERSION`, and the component and bot-rule manifests described under
[Versions, manifests, and types](#versions-manifests-and-types).

## `load(options?)`

```ts
function load(options?: LoadOptions): Promise<FingerprintCollector>;
```

`load()` verifies the minimum browser APIs, waits until `document.body` exists,
dynamically loads the detector runtime, and returns a reusable collector.

`LoadOptions` combines two kinds of settings. The `CollectorConfig` fields,
`debug` and `worker`, are fixed for the collector and apply to every later
call. `signal` and `timeoutMs` cover only the readiness/import phase of
`load()` itself; pass them to `collector.collect()` to govern a collection.

```ts
import { load } from 'libcreep';

const collector = await load();
const result = await collector.collect();
```

The collector exposes `algorithmVersion`, `libraryVersion`, and
`collect(options?)`. Reuse a collector when an application collects more than
once.

All collections in one loaded module instance are serialized, including calls
made through different collectors and the one-shot `collect()` function. Some
detectors share temporary DOM and module state, so only one collection runs at
a time. A result's `durationMs` measures its active collection, not time spent
waiting in this queue.

### Load options

```ts
interface CollectorConfig {
  debug?: boolean;
  worker?: {
    strategy?: 'auto' | 'dedicated-only' | 'service-first';
    url?: string | URL;
  };
}

interface LoadOptions extends CollectorConfig {
  signal?: AbortSignal;
  timeoutMs?: number;
}
```

| Option            | Default                                | Behavior                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`           | `false`                                | After each successful collection, logs package/algorithm versions and formatted core component results. Development and test transforms also print detector timing tables; the production package excludes that profiler. Failed collections are not logged. |
| `signal`          | none                                   | Cancels document readiness and dynamic runtime loading. It does not govern later `collector.collect()` calls.                                                                                                                                                |
| `timeoutMs`       | none                                   | Applies a 0 to 2,147,483,647 millisecond deadline to `load()` only. Invalid values reject with a `LibCreepError` (`INVALID_OPTION`).                                                                                                                         |
| `worker.url`      | `./worker.js` beside the package entry | Overrides the module-worker asset location. Use this when a bundler or CDN relocates package assets.                                                                                                                                                         |
| `worker.strategy` | `'auto'`                               | Controls the worker-scope fallback order described below.                                                                                                                                                                                                    |

Worker strategies are:

- `'auto'`: try a shared module worker, then a dedicated module worker.
- `'dedicated-only'`: use only a dedicated module worker.
- `'service-first'`: try a temporary service worker, then shared and dedicated
  module workers.

Service-worker-first mode is opt-in because registration changes origin state
temporarily. It creates a unique scope and unregisters only the registration it
created. An unknown strategy causes `load()` to reject with a `LibCreepError`
whose code is `INVALID_OPTION`.

A worker is not a minimum requirement for the rest of the fingerprint. If all
selected worker transports fail, `components.workerScope` is `unsupported` with
`reason: 'worker-unavailable'`, and collection continues. See [Browser runtime and workers](./browser-runtime.md)
for hosting, CSP, secure-context, and fallback details.

## `collect(options?)`

```ts
function collect(options?: CollectOptions): Promise<FingerprintResult>;

interface CollectOptions extends CollectorConfig, CollectorCollectOptions {}
```

`collect()` is the one-shot convenience API. It takes the collector
configuration and the collection options together, creates a collector, and
performs one collection. Its `signal` and `timeoutMs` cover the whole
operation, including loading:

```ts
import { collect } from 'libcreep';

const result = await collect({
  debug: true,
  timeoutMs: 10_000,
  worker: { strategy: 'auto' },
});
```

## `collector.collect(options?)`

```ts
interface CollectorCollectOptions {
  optIn?: ReadonlyArray<'webRtc'>;
  signal?: AbortSignal;
  timeoutMs?: number;
}
```

| Option      | Default | Behavior                                                                                                                                                                                                                      |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `optIn`     | `[]`    | Opt-in auxiliary probes to run, drawn from `OPT_IN_AUXILIARY_COMPONENT_NAMES`. `'webRtc'` enables SDP, STUN, ICE-candidate, and address collection, which can disclose network information and contact external STUN servers. |
| `signal`    | none    | Rejects a queued or active call when aborted. An active abort also triggers cleanup for worker, WebRTC, audio, and temporary DOM resources.                                                                                   |
| `timeoutMs` | none    | Aborts the entire operation after 0 to 2,147,483,647 milliseconds. Invalid values reject immediately with a `LibCreepError` (`INVALID_OPTION`).                                                                               |

An unknown `optIn` name, or an `optIn` value that is not an array, rejects
immediately with a `LibCreepError` (`INVALID_OPTION`). Duplicate names are
ignored.

For `collector.collect()`, the deadline includes its queue wait and active
detectors. For the one-shot `collect()` function, it additionally includes
waiting for `document.body` and dynamically loading the runtime. A timeout
rejects with a `DOMException` whose name is `TimeoutError`. A signal rejects
with `signal.reason`, or an `AbortError` DOM exception when no explicit reason
is available.

```ts
const controller = new AbortController();

try {
  const result = await collector.collect({
    signal: controller.signal,
    timeoutMs: 5_000,
  });
  console.log(result.visitorId);
} catch (error) {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    console.warn('Fingerprint collection timed out');
  } else {
    throw error;
  }
}
```

## Failure model

Environment and orchestration failures reject the collection promise.
Failures detected by libcreep's own checks reject with a `LibCreepError`:

```ts
class LibCreepError extends Error {
  name: 'LibCreepError';
  code: 'NOT_BROWSER' | 'UNSUPPORTED_ENVIRONMENT' | 'INVALID_OPTION';
}
```

| Code                      | Cause                                                       |
| ------------------------- | ----------------------------------------------------------- |
| `NOT_BROWSER`             | `load()` or `collect()` ran outside a browser window.       |
| `UNSUPPORTED_ENVIRONMENT` | Web Crypto SHA-256 or `TextEncoder` is unavailable.         |
| `INVALID_OPTION`          | An unknown worker strategy or `optIn` name, or a bad value. |

Cancellation and timeouts keep their platform errors, as described above.
Other failures, such as an error while calculating final hashes, reject with
the underlying error.

Detector-level failures are isolated. Every core and auxiliary entry uses the
same discriminated union:

```ts
type ComponentResult<T> =
  | { status: 'fulfilled'; value: T; durationMs: number }
  | {
      status: 'unsupported';
      durationMs: number;
      reason?: 'api-unavailable' | 'worker-unavailable';
    }
  | { status: 'rejected'; error: ComponentError; durationMs: number }
  | { status: 'skipped'; durationMs: number };

interface ComponentError {
  message: string;
  name: string;
  stack?: string;
}
```

- `fulfilled` contains a successful value.
- `unsupported` means the detector returned no usable value, commonly because
  its browser API or worker was unavailable. `reason` is set when the detector
  knows the cause: `'api-unavailable'` for a missing required API (WebGL,
  `OfflineAudioContext`, `enumerateDevices()`, Media Capabilities, or
  `RTCPeerConnection`) and `'worker-unavailable'` when no worker transport
  produced a worker scope. It is absent when the cause is unknown.
- `rejected` captures the detector's error without discarding other results.
- `skipped` means policy intentionally did not run an opt-in detector. WebRTC
  has this status by default.

Check `status` before accessing `value` or `error`:

```ts
const navigatorResult = result.components.navigator;

switch (navigatorResult.status) {
  case 'fulfilled':
    console.log(navigatorResult.value.platform);
    break;
  case 'rejected':
    console.warn(navigatorResult.error.name, navigatorResult.error.message);
    break;
  case 'unsupported':
  case 'skipped':
    console.log(`Navigator result: ${navigatorResult.status}`);
}
```

## `FingerprintResult`

| Field              | Meaning                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visitorId`        | SHA-256 of an envelope containing `algorithmVersion` and the hardened stable component set. This is the preferred whole-fingerprint identifier.    |
| `rawVisitorId`     | Canonical SHA-256 of all core component statuses and fulfilled values. It intentionally includes unstable, high-entropy signals.                   |
| `fuzzyHash`        | A 64-character Creep.js similarity signature. It is not a cryptographic identifier.                                                                |
| `bot`              | Client-side bot-rule bit mask, every matching rule, and the first matching rule, when any.                                                         |
| `components`       | A result entry for every name in `CORE_COMPONENT_NAMES`.                                                                                           |
| `values`           | Successful core values only, keyed by component name. Each value includes its component `$hash`.                                                   |
| `stableComponents` | A detached snapshot of the exact trust-filtered values hashed into `visitorId`; untrusted or unavailable groups may be absent or `undefined`.      |
| `focusedHashes`    | SHA-256 hashes for available narrower signal groups, such as Canvas image/text, WebGL, DOM rectangles, CSS, media types, and device/timezone data. |
| `auxiliary`        | Results for `mediaCapabilities`, `mediaDevices`, `browserStatus`, and `webRtc`. They are not included in `visitorId` or `rawVisitorId`.            |
| `durationMs`       | Active collection duration in milliseconds. Detector durations can overlap because many probes run concurrently.                                   |
| `algorithmVersion` | Version of the stable-ID inputs and canonical fingerprint algorithm.                                                                               |
| `libraryVersion`   | Installed npm package version.                                                                                                                     |

For fulfilled core entries, `components[name].value` and `values[name]` may
reference the same per-result snapshot; treat result data as immutable.
`stableComponents` is independently snapshotted, so mutating raw values cannot
change the data represented by the already-computed `visitorId`. Stable signal
groups omit the per-component `$hash`; those enrichment hashes are outputs, not
inputs to the stable identifier.

`visitorId` is hardened against known unstable or untrusted signals, but it is
not guaranteed to remain unchanged. Browser upgrades, privacy modes,
extensions, hardware changes, and detector availability can all affect it.
Persist `algorithmVersion` with identifiers so an application can make upgrade
decisions explicitly. Neither identifier should be used as authentication or
identity proof.

`BOT_RULE_NAMES` defines the eight-character `bot.botMask` order.
`bot.matchedRules` lists the rules whose bit is set, in that order, and
`bot.firstMatchedRule` is its first entry. The
`excessiveLooseFingerprints` and `crowdBlendingScoreIsLow` rules require
server-side history or crowd data and therefore remain unset in this
client-only package.

| Bit | Rule                         | Client-side meaning                                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 0   | `liedWorkerScope`            | The worker scope reported a detected lie.                                                      |
| 1   | `liedPlatformVersion`        | Worker UA platform data conflicts with font-derived OS information.                            |
| 2   | `functionToStringHasProxy`   | `Function.prototype.toString` exposes invalid or proxy-like behavior.                          |
| 3   | `outsideFeaturesVersion`     | Engine features fall outside the detected version range.                                       |
| 4   | `extremeLieCount`            | Severe stealth signals, an unusual font/OS pairing, or more than 100 recorded lies were found. |
| 5   | `excessiveLooseFingerprints` | Reserved for server-side history; always `0` here.                                             |
| 6   | `workerScopeIsBlocked`       | No usable worker scope was collected.                                                          |
| 7   | `crowdBlendingScoreIsLow`    | Reserved for server-side crowd analysis; always `0` here.                                      |

The stable component groups are `navigator`, `screen`, `workerScope`, `media`,
`canvas2d`, `canvasWebgl`, `cssMedia`, `cssSystemFonts`, `timezone`,
`offlineAudioContext`, and `fontFaceLoadFonts`. `cssSystemFonts` holds the
`css.system.fonts` list and `fontFaceLoadFonts` holds the fonts confirmed by
`FontFace` loading; the other groups are filtered copies of the core component
of the same name. Each is independently filtered, so do not assume that all
keys hold usable values.

Focused hash fields are:

```ts
interface FocusedHashes {
  canvas2dEmoji?: string;
  canvas2dImage?: string;
  canvas2dPaint?: string;
  canvas2dText?: string;
  canvasWebglImage?: string;
  canvasWebglParameters?: string;
  clientRects?: string;
  cssComputedStyle?: string;
  cssSystem?: string;
  deviceAndTimezone?: string;
  mediaMimeTypes?: string;
}
```

A focused hash is present only when its underlying signal is non-null and
usable. A fulfilled but partial component does not receive hashes for optional
fields it did not actually report.

## `hashComponents(components)`

```ts
function hashComponents(components: HashableComponents): Promise<string>;
```

Hashes a custom component selection with the same canonical format used by
`rawVisitorId`:

```ts
import { hashComponents } from 'libcreep';

const customId = await hashComponents({
  canvas2d: result.components.canvas2d,
  canvasWebgl: result.components.canvasWebgl,
  navigator: result.components.navigator,
});
```

Component names and plain-object keys are sorted by UTF-16 code units, without
locale-sensitive collation. Fulfilled values are hashed;
non-fulfilled statuses are hashed by status. `durationMs`, rejected error text,
and stacks are ignored, so timing and browser-specific wording do not
destabilize the hash.

Fulfilled values may contain plain objects (including objects from another
window realm and objects whose keys use libcreep's reserved canonical `$type`
tag), arrays (including sparse arrays), JSON primitives, `undefined`, `bigint`,
non-finite numbers, negative zero, and genuine cross-realm `Error` objects.
Functions, symbols, cycles, symbol-keyed properties,
accessors, non-enumerable or extra array properties, and non-plain objects such
as `Date` are rejected
instead of being silently converted to lossy JSON. SHA-256 requires Web Crypto.

## `componentsToDebugString(components)`

Returns indented JSON for diagnostics. Unlike `hashComponents()`, this output
retains statuses, durations, and captured error details. It also serializes
`Error`, `bigint`, negative zero, and non-finite numbers without the usual JSON
loss. It represents `undefined` object fields and array entries as
`{ "$type": "undefined" }` instead of dropping them or converting them to
`null`.

```ts
import { componentsToDebugString } from 'libcreep';

console.debug(componentsToDebugString(result.components));
```

Debug output can contain detailed fingerprint and environment information.
Redact it before sharing and do not log it by default in production.

## Environment helpers

```ts
interface BrowserCapabilities {
  hasDedicatedWorker: boolean;
  hasServiceWorker: boolean;
  hasSharedWorker: boolean;
  hasTextEncoder: boolean;
  hasWebCrypto: boolean;
  isBrowser: boolean;
  isSecureContext: boolean;
}
```

- `isFingerprintingSupported()` checks the minimum collection requirements:
  a browser window, `TextEncoder`, and Web Crypto SHA-256.
- `getBrowserCapabilities()` reports those requirements, including whether a
  browser `window` and `document` exist (`isBrowser`), plus secure-context and
  worker API availability. Capability flags report API presence, not a
  guarantee that CSP, permissions, origin rules, or asset loading will allow a
  particular detector to succeed.

A secure context is reported but is not itself a minimum check; it matters for
service workers and several optional browser APIs.

## Versions, manifests, and types

- `LIBRARY_VERSION` is the installed package version.
- `ALGORITHM_VERSION` is the fingerprint/canonical-hash version.
- `CORE_COMPONENT_NAMES` lists the 25 always-attempted core components.
- `DEFAULT_AUXILIARY_COMPONENT_NAMES` lists the three auxiliary probes run by
  default.
- `OPT_IN_AUXILIARY_COMPONENT_NAMES` lists `webRtc`.
- `AUXILIARY_COMPONENT_NAMES` combines both auxiliary manifests.
- `BOT_RULE_NAMES` defines the bot-mask bit order.

The package exports its public TypeScript interfaces and type aliases,
including `FingerprintResult`, `FingerprintCollector`, component value types,
component result maps, `UnsupportedReason`, options (`CollectorConfig`,
`LoadOptions`, `CollectorCollectOptions`, `CollectOptions`), capability types,
bot types, `LibCreepErrorCode`, and `HashableComponents`. The generated declarations shipped in `dist` are the
authoritative field-level reference for detector values.
