# Architecture

## Package boundary

The public entry is safe to import in SSR and Node-based build tools. Browser
detectors are loaded dynamically only after `load()` verifies a window and
waits for `document.body`.

The package is ESM and ships separate entries for the public API and module
worker. A custom `worker.url` is needed only when build tooling moves the worker
away from the other distribution files.

## Collection lifecycle

1. `load()` initializes the browser runtime and returns a collector.
2. `collector.collect()` starts the core and passive auxiliary probes.
3. Independent core probes run concurrently.
4. Navigator collection follows worker collection because it compares values
   across scopes.
5. Headless and engine-feature probes run after their dependencies.
6. Lie, inconsistency, and captured-error records are finalized.
7. Raw, stable, focused, fuzzy, and bot hashes are calculated.
8. Temporary phantom DOM is removed and the structured result is returned.

Failures are isolated per core or auxiliary component, so one blocked browser
API doesn't discard the remaining fingerprint. Cancellation is propagated to
long-lived worker, WebRTC, and audio resources; DOM cleanup runs in a `finally`
path.

## Fingerprints and hashes

The raw component set retains high-entropy and potentially unstable values. The
stable component set applies Creep.js trust rules for detected lies, privacy
resistance, Brave fingerprint blocking, locale mismatches, and lower-entropy
conditions.

`rawVisitorId` hashes the raw components, while `visitorId` hashes an envelope
containing the algorithm version and hardened stable components. Explicitly
namespacing the stable hash prevents different algorithm revisions from
silently sharing identifiers. Focused hashes let consumers compare narrower
signal groups without reconstructing them. The fuzzy hash divides known metrics
into bins to support similarity comparison.

The bot bitset contains client-side patterns only. Patterns that require
server-side history or crowd analysis remain unset because this project has no
server component.

The package version and fingerprint algorithm version are separate. Package
releases that don't change canonical fingerprint output can retain the same
algorithm version. Changing canonical serialization or identifier inputs
requires an algorithm-version increment.

## Upstream internals

Detector algorithms remain separated by signal family under `src/internal`.
The reusable orchestration and public types are maintained outside those
modules. Presentation renderers from the upstream demonstration page aren't
part of the runtime.
