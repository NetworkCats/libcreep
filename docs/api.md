# API reference

## Loading and collection

`load(options?)` initializes the browser runtime and returns a reusable agent.
Calls through one agent are serialized because several Creep.js probes share
temporary state.

```ts
import { load } from 'libcreep';

const agent = await load();
const result = await agent.get();
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
    strategy?: 'auto' | 'shared-first' | 'dedicated' | 'service-first';
    url?: string | URL;
  };
}
```

`debug` prints the algorithm/package versions and formatted component results
after successful collection. Development/test builds also print ranked core,
auxiliary, and aggregate speed tables. The detailed profiler is compile-time
disabled and absent from production output. Debug output is disabled by
default.

The default `auto` worker strategy tries a shared worker and then a dedicated
worker. `shared-first` currently has the same order but explicitly fixes that
preference. `dedicated` uses only a dedicated worker. `service-first` tries a
service worker before shared and dedicated workers; it is opt-in because
registration mutates origin state.

## Get options

```ts
interface GetOptions {
  includeWebRTC?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}
```

WebRTC SDP, STUN, and address collection is disabled by default. `signal` and
`timeoutMs` cancel collection and release active worker, WebRTC, audio, and DOM
resources. A timeout rejects with `TimeoutError`; an aborted signal rejects
with its abort reason.

```ts
const controller = new AbortController();
const result = await agent.get({
  includeWebRTC: true,
  signal: controller.signal,
  timeoutMs: 5_000,
});
```

## Result model

`result.components` contains every core detection. `result.auxiliary` contains
all supplemental detections, including a `skipped` WebRTC result when it was
not enabled. Both maps use the same discriminated union:

```ts
type ComponentResult<T> =
  | { status: 'fulfilled'; value: T; duration: number }
  | { status: 'unsupported'; duration: number }
  | { status: 'rejected'; error: DetectionError; duration: number }
  | { status: 'skipped'; duration: number };
```

`result.values` is a convenience map containing successful core values only.
Each value includes its Creep.js component `$hash`.

Other result fields are:

- `visitorId`: SHA-256 of the hardened stable fingerprint.
- `rawVisitorId`: canonical SHA-256 of `components`.
- `stableComponents`: strongly typed values selected by trust and stability
  rules.
- `fuzzyHash`, `hashes`, and `bot`: Creep.js comparison and bot signals.
- `duration`: total collection duration.
- `version`: fingerprint algorithm version.
- `libraryVersion`: installed package version.

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

## Environment and versions

- `isBrowserEnvironment()` checks only for a browser window and document.
- `isSupported()` checks the minimum browser and Web Crypto requirements.
- `getBrowserSupport()` returns browser, secure-context, Web Crypto, and worker
  capability flags.
- `VERSION` is the package version.
- `ALGORITHM_VERSION` is the fingerprint/canonical-hash version.
- Detection-name constants expose the core, default auxiliary, opt-in, and
  combined auxiliary manifests.
