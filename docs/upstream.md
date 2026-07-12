# Upstream adaptation

The detector port is audited against Creep.js source revision
`10aa6724cd33a1015db1574211890518cd04f0cc` from
[abrahamjuliot/CreepJS](https://github.com/abrahamjuliot/CreepJS).

## Adaptation scope

The port keeps client-side detector algorithms and removes demonstration-page
rendering, prediction/sample views, CSS, and server behavior. The original
one-shot orchestration is replaced with a reusable typed API, isolated component
results, a packaged module worker, and explicit default versus opt-in policy.

The completeness audit covers:

- every core component invoked by the upstream fingerprint orchestration;
- stable, raw, focused, fuzzy, and bot hashing;
- post-render WebRTC, media-device, and status probes;
- the exported Media Capabilities probe;
- automated equivalents of the original exploratory browser-test areas.

The original presentation-heavy exploratory pages are not retained in the
library repository. Their relevant assertions are represented by the automated
unit and browser suites.

The project intentionally doesn't implement server-derived bot history, crowd
analysis, IP intelligence, or any other server-side mechanism.

## Licensing and name

Original Creep.js portions are copyright (c) 2021 abrahamjuliot. The libcreep
adaptation and modifications are copyright (c) 2026 Networkcats. Both are
distributed under the MIT License in the repository-level `LICENSE`; the
original copyright and permission notice are preserved as required by that
license.

The CreepJS name and logos are governed by the
[upstream trademark policy](https://github.com/abrahamjuliot/CreepJS/blob/master/TRADEMARKS.md).
`libcreep` uses a distinct name, describes its origin only for attribution, and
doesn't claim to be an official CreepJS release.
