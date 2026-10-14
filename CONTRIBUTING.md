# Contributing

Thanks for considering a contribution.

## Setup

Node.js 22. Two separate npm projects — the game scripts and the NUI:

```bash
npm run install:all     # npm ci && npm ci --prefix web
npm run build
```

See [Building from Source](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/building/)
for the full picture, including how to deploy to a local server with
`npm run dev:deploy`.

## Before you open a pull request

```bash
npm run typecheck       # must be clean
npm run check:config    # the three copies of the defaults must agree
npm run build           # must succeed
npm run docs:build      # if you touched docs/ — runs with --strict
```

CI runs all of these. It also fails if the build modified any tracked file, so
never commit `dist/`, `web/vite.config.js` or `web/vite.config.d.ts`.

## Things that are easy to get wrong

**Adding a config key** touches four places, and the sync check will tell you if
you miss one:

1. `config.json` — the shipped value
2. `src/shared/config.ts` — the `AudioConfig` type, `DEFAULT_CONFIG`, and a
   validation line in `mergeConfig`
3. `web/src/config.ts` — only if the NUI needs it, plus `toNuiConfig`
4. `docs/configuration.md` — the reference table and the "which runtime reads
   what" matrix

Any new default **must reproduce existing behaviour**. Config supplies defaults
and limits; it never changes what an explicit argument does.

**Changing an export signature** is a breaking change. The signatures are already
awkward and asymmetric, and that is deliberate — see
[Known Limitations](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/#6-asymmetric-export-signatures).
If you want a nicer API, add a new export rather than changing an existing one.

**Renaming events** means changing `EVENT_PREFIX` in `src/shared/events.ts`, which
renames all of them at once. It breaks consumers listening for `3d-audio:ended`,
so it needs a major version bump.

**The NUI cannot import from `src/shared/`.** Different tsconfig, different module
resolution, different target. That is why `web/src/config.ts` duplicates the
defaults, and why `npm run check:config` exists.

## Testing

There is no automated test suite for the runtime behaviour — it needs a running
FiveM server. If you change playback, dimension handling or entity tracking,
please test in game and say so in the PR:

- `restart 3d-audio` with `"debug": true` and confirm both load lines appear
- play a positional sound and walk away from it, confirming it attenuates to
  silence at `range`
- turn on the spot and confirm the stereo image moves
- for entity sounds, drive out of streaming range and back, confirming pause and
  resume
- confirm a one-shot leaves no registry entry behind (visible in the debug log)

Config validation *is* testable without a server, and
`build/check-config-sync.js` covers the sync invariant.

## Commit messages

Conventional-commit prefixes, since the release notes are generated from them:
`feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`.

## Reporting bugs

Open an issue with the detail listed in
[Troubleshooting](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/troubleshooting/#still-stuck).
Check [Known Limitations](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/)
first — several surprising behaviours are already documented there.

## License

Contributions are accepted under the [Apache-2.0](LICENSE) license.

Please do not contribute audio files unless you can state their license.
