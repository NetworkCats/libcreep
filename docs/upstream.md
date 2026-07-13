# Upstream adaptation

The detector port is audited against Creep.js commit
[`10aa6724cd33a1015db1574211890518cd04f0cc`](https://github.com/abrahamjuliot/creepjs/commit/10aa6724cd33a1015db1574211890518cd04f0cc)
from [abrahamjuliot/CreepJS](https://github.com/abrahamjuliot/creepjs). The
pinned commit, dated June 11, 2026, makes the detector baseline reviewable even
as upstream development continues.

Upstream describes CreepJS as a research and education project rather than a
fingerprinting library. `libcreep` is an independent adaptation that supplies a
library-oriented package and API; it is not an official CreepJS distribution.

## Retained detector scope

The port retains the client-side detector families invoked by the pinned
upstream fingerprint orchestration:

- worker, navigator, window, HTML, CSS/media-query, and screen surfaces;
- headless, engine-feature, privacy-resistance, prototype-lie, anomaly, and
  captured-error signals;
- Canvas 2D, WebGL, DOMRect, SVG, audio, font, voice, media, math, timezone, and
  `Intl` signals;
- upstream component hashes and narrower Canvas, WebGL, CSS, DOMRect, media,
  and device/timezone groupings;
- stable/loose trust decisions, fuzzy similarity hashing, and client-side bot
  patterns;
- WebRTC, media-device, and status probes that upstream runs after its main
  report render;
- the Media Capabilities probe exported by the upstream WebRTC module, although
  the pinned upstream page does not invoke it in its main orchestration.

The complete component manifest is in [Detection coverage](./detections.md).
Automated tests map the upstream exploratory areas—workers, iframes, fonts,
timezone, window, screen, prototype/proxy, DOMRect/emojis, math, machine, and
extensions—to unit and cross-browser assertions.

## Library-level changes

The adaptation deliberately changes orchestration and packaging while keeping
the detector logic recognizable:

- upstream's page-level, one-shot execution becomes `load()` plus a reusable,
  serialized `FingerprintCollector`;
- every core and auxiliary probe receives an isolated status, duration, value,
  or captured error instead of one rejected `Promise.all` discarding a group;
- module-level detector records are reset between collections;
- long-lived worker, WebRTC, audio, status, and DOM work participates in public
  abort/timeout cleanup;
- WebRTC/STUN is opt-in instead of running automatically after rendering;
- service-worker scope is opt-in, uniquely scoped, and unregistered after use;
- shared and dedicated module workers form the non-mutating default fallback;
- the worker is shipped as a separate package entry with its required chunks;
- public component values and results have maintained TypeScript interfaces;
- canonical raw and algorithm-namespaced stable identifiers are exposed
  separately, together with focused, fuzzy, and bot signals;
- debug serialization replaces the upstream report UI.

These changes mean `libcreep` is not API- or output-envelope-compatible with
upstream's `window.Fingerprint` or `window.Creep` objects. Consumers should use
the documented public result and version fields rather than assuming the
upstream demonstration-page shape.

## Intentionally omitted scope

The package does not retain:

- the demonstration page's HTML renderers, CSS, animation, prediction/sample
  views, or globals;
- public mirror/deployment behavior;
- server submission, visit history, crowd analysis, IP intelligence, or other
  server-derived mechanisms;
- the two bot rules that require excessive-fingerprint history or a crowd
  blending score;
- exploratory pages as production runtime code.

Relevant exploratory assertions are represented in the automated tests instead
of shipping presentation-heavy pages in the package.

## Updating the pinned revision

An upstream refresh should be treated as a detector and algorithm review, not
as a blind source sync. At minimum it requires:

1. comparing every upstream core import and post-render probe with the local
   manifests;
2. reviewing new or removed fields used by stable, focused, fuzzy, and bot
   calculations;
3. preserving cancellation, cleanup, failure isolation, and repeatable state
   reset around changed detectors;
4. updating public component types and cross-browser assertions;
5. deciding whether canonical or stable identifier inputs changed and, if so,
   incrementing `fingerprintAlgorithmVersion`;
6. updating this document and the detection manifest to the new exact commit.

Package releases that do not change identifier inputs or canonical behavior do
not automatically require an algorithm-version increment.

## Licensing and name

Original Creep.js portions are copyright (c) 2021 abrahamjuliot. The libcreep
adaptation and modifications are copyright (c) 2026 Networkcats. Both are
distributed under the MIT License in the repository-level [LICENSE](../LICENSE);
the upstream notice is preserved in [NOTICE](../NOTICE).

The CreepJS name and logos are governed by the
[upstream trademark policy at the pinned revision](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/TRADEMARKS.md).
That policy permits truthful attribution while requiring distinct public
derivatives to avoid source confusion. `libcreep` uses a distinct name,
describes CreepJS only as its source, and does not claim endorsement or official
status.
