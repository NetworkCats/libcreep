# Architecture

## Package boundary

The public entry is safe to import in SSR and Node-based build tools. It does
not import browser detectors until `load()` confirms that collection is running
in a browser, verifies `TextEncoder` and Web Crypto SHA-256, and waits for
`document.body`.

The package is ESM-only and targets ES2022. Its built output has a public API
entry, a dynamically loaded detector runtime, a module-worker entry, and
supporting chunks. The default worker URL is resolved next to the public entry.
A custom `worker.url` is needed only when build tooling or a CDN moves the
worker; relocating it also requires deploying the chunks it imports.

The `src/internal` modules retain the detector algorithms by signal family.
The reusable orchestration, cancellation, public hashing, versioning, and
public TypeScript types are maintained outside those modules. Upstream report
renderers, page CSS, sample/prediction views, and server behavior are not part
of the runtime.

## Loading and serialization

`load()` returns a lightweight collector configured with a worker strategy,
worker URL, and optional debug behavior. Runtime imports are cached by the
JavaScript module system, but applications should normally keep and reuse one
collector.

Collections share a module-level promise queue. Calls through one collector,
different collectors, and the one-shot `collect()` API therefore execute one
at a time. Serialization protects temporary detector DOM and mutable upstream
records from overlapping runs.

A queued call with an aborted signal is rejected and removed before its runtime
work starts. `timeoutMs` is created inside the active runtime, so it measures
only the call's own collection and not its queue wait. `result.durationMs` has
the same active-only boundary.

## Collection lifecycle

1. The runtime resets captured errors, lie records, anomaly records, entropy
   flags, analysis state, and the hidden phantom DOM to a clean baseline.
2. Passive auxiliary probes start concurrently with the core collection.
   WebRTC joins them only when `includeWebRtc` is true; otherwise its result is
   immediately marked `skipped`.
3. Brave privacy mode is detected when applicable.
4. Nineteen independent core probes start concurrently, including the worker,
   rendering, media, geometry, font, locale, and engine probes.
5. Navigator collection follows worker collection because it compares values
   between the window and worker scopes.
6. Headless and engine-feature probes run concurrently after their required
   inputs are available.
7. Lie, anomaly (`trash`), and captured-error records are finalized.
8. Successful core values receive component `$hash` fields, and focused hashes
   are calculated from the available raw values.
9. Trust and stability rules build `stableComponents`; auxiliary results are
   snapshotted.
10. Raw, stable, fuzzy, and bot outputs are calculated and the structured
    result is returned.
11. Cancellation listeners/timers and temporary phantom DOM are removed in a
    final cleanup path.

Many detector durations overlap, so adding individual `durationMs` values does
not produce the whole collection duration. Development/test speed profiles
report this overlap explicitly.

## Failure isolation

Core and auxiliary detectors run through wrappers that convert a normal probe
exception into a `rejected` component result and convert `null`/`undefined`
into `unsupported`. This lets the remaining fingerprint survive a blocked or
missing browser API.

Collection-level failures still reject the promise. These include unsupported
minimum runtime requirements, cancellation, timeout, and failures in
orchestration or final hashing. Abort-related errors thrown by a detector are
treated as component failures unless the collection's own signal is actually
aborted.

Active cancellation is propagated to worker, WebRTC, audio, and status work.
Auxiliary completion is observed even on an error path, and DOM cleanup always
runs.

## Component hashes and the raw identifier

Each fulfilled core value includes a `$hash` based on its upstream component
data. A few components preserve upstream-specific hash targets: for example,
the HTML component hashes its property keys, math hashes its data record, and
console errors hash their error list. WebGL pixel arrays are replaced with
their own hashes in the public component value.

`rawVisitorId` uses the public canonical `hashComponents()` format over the
entire core result map:

- component and plain-object keys are sorted;
- fulfilled component values are included;
- `unsupported`, `rejected`, and `skipped` remain distinct statuses;
- detector durations and rejected error details are excluded.

The raw identifier therefore reacts to high-entropy and potentially unstable
data, but not timing noise or browser-specific error wording. Auxiliary probes
are outside this hash.

## Stable identifier

`stableComponents` is built from successful core values using Creep.js-derived
trust and stability rules. Inputs may be set to `undefined` or reduced in
response to:

- detected lies or prototype tampering;
- Brave fingerprinting protection;
- Tor or Firefox resist-fingerprinting patterns;
- lower-entropy Canvas, WebGL, audio, font, screen, or timezone conditions;
- untrustworthy cross-scope locale entropy;
- low-confidence GPU information.

`visitorId` is canonical SHA-256 over this envelope:

```ts
{
  algorithmVersion,
  components: stableComponents,
}
```

Including `algorithmVersion` creates a new identifier namespace whenever the
project changes canonical behavior or stable identifier inputs. Package and
algorithm versions are intentionally separate: a package release can fix docs,
types, tests, or non-identifier behavior without changing the algorithm
version.

The stable identifier is the preferred whole-fingerprint comparison, not a
guarantee. Browser/OS updates, extensions, privacy settings, hardware changes,
and newly unavailable detectors can still change it. It is unsuitable as
authentication or identity proof.

## Focused, fuzzy, and bot outputs

Focused hashes expose narrower comparisons without requiring consumers to
rebuild upstream groupings. They cover available Canvas image/paint/text/emoji,
WebGL image/parameters, DOMRect, CSS, media MIME, and device/timezone signals.
A property is absent when the necessary source component or field is not
available.

`fuzzyHash` is a 64-character similarity signature derived from many known
metrics. It is designed for approximate comparison and is not a cryptographic
hash or stable visitor identifier.

The bot mask is an eight-rule ordered bitset. Six rules use client-side data;
the excessive-loose-fingerprint and low-crowd-blending rules remain `0` because
they require server history or crowd analysis. Dedicated or unavailable worker
scope is one of the client-side heuristics, so applications must treat the bot
output as a signal rather than a verdict.

## State ownership

Several adapted upstream detectors record lies, captured errors, anomalies,
and lower-entropy findings in module-level objects. The runtime snapshots an
initial baseline and resets these records before every collection. Returned
successful values are cloned before result assembly so later collections do
not mutate earlier results.

This reset-plus-serialization model is what makes repeated collection safe
without rewriting every upstream detector around isolated state containers.
It also explains why callers should use the public collector rather than
importing internal detector modules.
