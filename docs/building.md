# Building from Source

## Prerequisites

- **Node.js 22** (CI builds on 22; 20 also works)
- Python 3.9+ only if you want to preview the documentation

## Two npm projects

The repository holds two separate npm projects on purpose:

| Project | Builds | Toolchain |
|---|---|---|
| root | the server and client game scripts | esbuild + `tsc --noEmit` |
| `web/` | the NUI audio page | Vite + `vue-tsc` |

They have different targets (Node and a CEF browser), different type roots
(`@citizenfx/server`/`@citizenfx/client` vs DOM), and different module systems, so
a single tsconfig cannot serve both. Install both:

```bash
npm ci
npm ci --prefix web
# or, in one step:
npm run install:all
```

## Build

```bash
npm run build
```

That runs, in order:

1. `clean` — remove `dist/` and `package/`
2. `typecheck` — `tsc --noEmit` over `src/`
3. `check:config` — verify `config.json`, `DEFAULT_CONFIG` and the NUI's copy of
   the defaults all agree
4. `build:scripts` — esbuild bundles `src/server` and `src/client`
5. `build:web` — `vue-tsc -b && vite build` for the NUI

Output:

```text
dist/
├── server/index.js        ~8 KB
├── client/index.js        ~11 KB
└── web/
    ├── index.html
    └── assets/index-*.js  ~99 KB (includes Howler.js)
```

`dist/` is gitignored. `fxmanifest.lua` points only into it, so an unbuilt
checkout does not run.

## Individual scripts

| Command | Does |
|---|---|
| `npm run typecheck` | Type-check the game scripts without emitting |
| `npm run check:config` | Check the three copies of the defaults agree |
| `npm run build:scripts` | esbuild only (fast; skips the NUI) |
| `npm run build:web` | NUI only |
| `npm run watch` | esbuild in watch mode for the game scripts |
| `npm run package` | Stage a runnable resource into `package/3d-audio/` |
| `npm run dev:deploy` | Copy a built resource into a local server |
| `npm run docs:serve` | Serve the documentation locally |
| `npm run docs:build` | Build the documentation with `--strict` |

## Deploying to a local server

`dev:deploy` never guesses a path. Give it one of:

=== "Command line"

    ```bash
    npm run dev:deploy -- --to="C:/fxserver/resources/3d-audio"
    ```

=== "Environment variable"

    ```bash
    FIVEM_RESOURCE_PATH="C:/fxserver/resources/3d-audio" npm run dev:deploy
    ```

=== "`.deploy.json`"

    ```json title=".deploy.json (gitignored)"
    { "target": "C:/fxserver/resources/3d-audio" }
    ```

With none of them set it exits with an error rather than writing anywhere.

Behaviour worth knowing:

- The target folder **must be named `3d-audio`** — the resource name is the folder
  name and exports are keyed on it.
- It refuses to write to a directory that is neither empty nor already a FiveM
  resource, so a mistyped path cannot wipe something unrelated.
- It replaces `dist/` and `assets/`, and **keeps an existing `config.json`** so
  your local tuning survives a redeploy.

A typical loop:

```bash
npm run build && npm run dev:deploy
# then in the server console:
restart 3d-audio
```

## Packaging a release

```bash
npm run build && npm run package
```

`package/3d-audio/` then contains exactly what a server needs: `fxmanifest.lua`,
`config.json`, `dist/`, `assets/`, `README.md`, `LICENSE`. No `src/`, no `web/`,
no `node_modules`, no build tooling.

The staged folder is named after the **resource**, not the repository, so zipping
it produces an archive that extracts correctly into `resources/`.

## Documentation

```bash
pip install -r requirements-docs.txt
npm run docs:serve      # http://127.0.0.1:8000
```

`npm run docs:build` runs with `--strict`, which turns broken internal links and
nav entries pointing at missing files into errors. CI uses the same flag, so build
locally before pushing docs changes.

## CI

Two workflows in `.github/workflows/`:

**`build.yml`** — on pushes to `main`, pull requests, and `v*` tags. Installs both
projects, checks the manifest ships `config.json`, runs the config sync check,
typechecks, builds, asserts the three expected output files exist, asserts the
build left no tracked files modified, then stages and uploads the resource.

On a `v*` tag it additionally zips `package/3d-audio` and publishes it as a GitHub
release asset. That is the only way a user gets a runnable resource, since `dist/`
is not committed.

**`docs.yml`** — on documentation changes. Builds with `--strict` and deploys to
GitHub Pages using the Actions-native Pages path (no `gh-pages` branch). Pull
requests build but do not deploy.

!!! note "One-time Pages setup"
    The docs workflow needs repository **Settings → Pages → Source** set to
    **GitHub Actions**. Until that is done the deploy step fails with
    "Get Pages site failed".

## Cutting a release

```bash
# 1. bump the version in package.json and fxmanifest.lua, update CHANGELOG.md
# 2. commit
git commit -am "release: v1.1.0"
# 3. tag and push
git tag v1.1.0
git push origin main --tags
```

The build workflow does the rest. Tags containing `-rc` or `-beta` are published
as pre-releases automatically.

## Code layout

```text
src/
├── shared/
│   ├── config.ts     AudioConfig, DEFAULT_CONFIG, mergeConfig, loadAudioConfig
│   └── events.ts     every event and NUI message name, from one prefix constant
├── server/index.ts   registry, fan-out, loop timers, bucket re-sync
└── client/index.ts   bucket filtering, entity tracking, listener tick, NUI bridge

web/src/
├── config.ts         NUI config state + the duplicated defaults
├── App.vue           Howler layer: one Howl per sound, panner setup
└── main.ts           Vue mount

build/
├── build-bundle.js       esbuild driver for both game scripts
├── package.js            stage a runnable resource
├── dev-deploy.js         copy into a local server
└── check-config-sync.js  guard the duplicated defaults
```

To rename every event at once, change `EVENT_PREFIX` in `src/shared/events.ts`.
Note that this is a breaking change for consumers listening to `3d-audio:ended`.
