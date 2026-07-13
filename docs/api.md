# API reference

## Loading and collection

`load(options?)` initializes the browser runtime and returns a reusable
`FingerprintCollector`. All collections from the loaded module are serialized,
including calls through separate collectors and the one-shot `collect()`
function, because several Creep.js probes share temporary browser state.

```ts
import { load } from 'libcreep';

const collector = await load();
const result = await collector.collect();
```

`collect(options?)` is the equivalent one-shot convenience function.

```ts
import { collect } from 'libcreep';

const result = await collect();
```

## Load options

```ts
interface LoadOptions {
  debug?: boolean;
  worker?: {
    strategy?: 'auto' | 'dedicated-only' | 'service-first';
    url?: string | URL;
  };
}
```

`debug` prints the algorithm/package versions and formatted component results
after successful collection. Development/test builds also print ranked core,
auxiliary, and aggregate speed tables. The detailed profiler is compile-time
disabled and absent from production output. Debug output is disabled by
default.

The default `auto` strategy tries a shared worker and then a dedicated worker.
`dedicated-only` skips the shared-worker attempt. `service-first` tries a
service worker before shared and dedicated workers; it is opt-in because
registration temporarily mutates origin state. It uses an isolated scope and
removes only the registration it created, leaving existing application service
workers intact. Unknown strategy values throw a `TypeError` at runtime.

## Collection options

```ts
interface CollectionOptions {
  includeWebRtc?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}
```

WebRTC SDP, STUN, and address collection is disabled by default. `signal` and
`timeoutMs` cancel collection and release active worker, WebRTC, audio, and DOM
resources. A timeout rejects with `TimeoutError`; an aborted signal rejects
with its abort reason. A queued call rejects promptly if its signal is aborted
and is removed without starting another collection.

```ts
const controller = new AbortController();
const result = await collector.collect({
  includeWebRtc: true,
  signal: controller.signal,
  timeoutMs: 5_000,
});
```

## Result model

`result.components` contains every core detection. `result.auxiliary` contains
all auxiliary detections, including a `skipped` WebRTC result when it was
not enabled. Both maps use the same discriminated union:

```ts
type ComponentResult<T> =
  | { status: 'fulfilled'; value: T; durationMs: number }
  | { status: 'unsupported'; durationMs: number }
  | { status: 'rejected'; error: ComponentError; durationMs: number }
  | { status: 'skipped'; durationMs: number };
```

`result.values` is a convenience map containing successful core values only.
Each value includes its Creep.js component `$hash`.

Other result fields are:

- `visitorId`: SHA-256 of the hardened stable fingerprint.
- `rawVisitorId`: canonical SHA-256 of `components`.
- `stableComponents`: strongly typed values selected by trust and stability
  rules.
- `focusedHashes`: hashes of available narrower signal groups such as Canvas,
  WebGL, client rectangles, CSS, media types, and device/timezone signals.
  A field is absent when its source component is unavailable.
- `fuzzyHash` and `bot`: Creep.js similarity and bot signals. `bot.botMask` is
  an eight-bit rule mask, not a cryptographic hash.
- `durationMs`: total collection duration in milliseconds.
- `algorithmVersion`: fingerprint algorithm version.
- `libraryVersion`: installed package version.

The stable identifier hashes an envelope containing `algorithmVersion` and
`stableComponents`. Algorithm changes therefore cannot silently share an
identifier namespace.

`BOT_RULE_NAMES` defines the `botMask` bit order. `firstMatchedRule` names the
first set bit. The two rules that require server-side history remain unset in
this client-only library.

## Hashing and diagnostics

`hashComponents(components)` hashes a custom component selection with the same
canonical format used by `rawVisitorId`. Durations and error details are not
hashed, so timing and browser wording do not destabilize the identifier.

```ts
import { hashComponents } from 'libcreep';

const { canvas2d, canvasWebgl, navigator } = result.components;
const customId = await hashComponents({ canvas2d, canvasWebgl, navigator });
```

`componentsToDebugString(components)` returns formatted, serializable JSON for
diagnostics.

Custom fulfilled values passed to `hashComponents()` may contain plain objects,
arrays, JSON primitives, `undefined`, `bigint`, non-finite numbers, and `Error`
objects. Functions, symbols, cyclic structures, symbol-keyed properties,
accessors, non-enumerable or extra array properties, and non-plain objects are
rejected instead of being silently hashed as lossy JSON.

## Environment and versions

- `isBrowserEnvironment()` checks only for a browser window and document.
- `isFingerprintingSupported()` checks for a browser window, `TextEncoder`, and
  Web Crypto SHA-256 support.
- `getBrowserCapabilities()` reports those requirements plus secure-context,
  dedicated-worker, shared-worker, and service-worker availability.
- `LIBRARY_VERSION` is the package version.
- `ALGORITHM_VERSION` is the fingerprint/canonical-hash version.
- Component-name constants expose the core, default auxiliary, opt-in, and
  combined auxiliary manifests.

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
