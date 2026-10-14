# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-14

First public release. The resource was extracted from a private monorepo, where it
was called `hcrp-audio`.

### Added

- `config.json` with validated, documented settings — debug logging, tick rate,
  sound directory, per-argument defaults, volume/range/concurrency limits, the Web
  Audio panner curve, and an opt-in routing bucket verification. Every default
  reproduces the value that was previously hardcoded, so the file can be deleted
  without changing behaviour.
- `debug` flag gating all informational logging. It was previously unconditional
  and logged once per sound per tick.
- `security.verifyRoutingBucket` (default `false`): verifies a client's claimed
  routing bucket against `GetPlayerRoutingBucket()` before replaying
  dimension-scoped sounds to it.
- `limits.maxConcurrentSounds`, `limits.maxVolume` and `limits.maxRange`, enforced
  on the server, the client and in the NUI.
- Full documentation at <https://heartc-o-r-e.github.io/3D-Audio-Subsystem/>,
  including an API reference, an architecture write-up and an honest
  [Known Limitations](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/)
  page.
- GitHub Actions: a build workflow that typechecks, builds and publishes a
  ready-to-drop-in release archive on `v*` tags, and a docs workflow that deploys
  the site to GitHub Pages.
- `npm run check:config`, which fails the build if `config.json`,
  `src/shared/config.ts` and the NUI's copy of the defaults disagree.
- `npm run package`, which stages exactly what a server needs into
  `package/3d-audio/`.

### Changed

- **Renamed from `hcrp-audio` to `3d-audio`.** This is a breaking change: the
  resource folder must be named `3d-audio` and all calls become
  `exports['3d-audio']`. Event names moved from `hcrp-audio:*` to `3d-audio:*`.
- The NUI resolves the resource name at runtime via `GetParentResourceName()`
  instead of hardcoding it, so renaming the folder no longer silently breaks
  one-shot cleanup.
- Event and NUI message names now derive from a single `EVENT_PREFIX` constant in
  `src/shared/events.ts`.
- All references to the originating framework were removed from the manifest,
  source and documentation. The resource has no framework dependency; the only
  integration point is the `setDimension` client export.
- `build/deploy.js`, which copied into a hardcoded monorepo path and deleted the
  target directory, was replaced by `build/dev-deploy.js`. It requires an explicit
  target (`--to=`, `FIVEM_RESOURCE_PATH`, or `.deploy.json`), refuses to write to
  a directory that is neither empty nor an existing FiveM resource, and preserves
  an existing `config.json`.
- `npm run build` no longer deploys anywhere as a side effect.

### Fixed

- The NUI's end-of-sound callback URL no longer hardcodes the resource name, which
  would have broken one-shot cleanup — and leaked server registry entries — after
  the rename.
- `web/tsconfig.node.json` no longer emits `vite.config.js` and `vite.config.d.ts`
  next to the source on every `vue-tsc -b`.
- Removed source comments describing a `GetInstanceId()` polling mechanism that
  does not exist; `setDimension` is and always was the only way the client learns
  about a routing bucket change.

### Removed

- `assets/sounds/ars.mp3`. It is not ours to redistribute. If you are migrating
  from `hcrp-audio` and reference it, supply your own file.

### Known issues

Documented in full at
<https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/>. In short:
routing buckets are not a privacy boundary, sound-end reports are unvalidated,
endless loops must be stopped explicitly or they leak registry entries, and there
is no routing bucket handshake on join.

[1.0.0]: https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/releases/tag/v1.0.0
