# Configuration

All configuration lives in a single `config.json` in the resource root. It is read
once when the resource starts, by the server, the client and the NUI.

!!! info "Config supplies defaults and limits — never signatures"
    Nothing in `config.json` changes an export's parameters. If you pass an
    explicit `range` and `volume`, you get exactly those values (subject only to
    the limit clamps). Config only fills in what a caller left out, and caps what
    a caller asked for.

    Every shipped default reproduces the value that used to be hardcoded, so
    **deleting `config.json` entirely leaves behaviour unchanged.**

## The shipped file

```json title="config.json"
--8<-- "config.json"
```

## Reference

### Top level

| Key | Type | Default | Effect |
|---|---|---|---|
| `debug` | boolean | `false` | Enables informational logging in the server console, the client console (<kbd>F8</kbd>) and the NUI console. Warnings and errors are **never** suppressed. Turn this on first when diagnosing anything. |
| `tickIntervalMs` | number, 10–1000 | `50` | Interval of the listener tick and of each entity-tracking tick. `50` ms is 20 Hz. Lowering it makes fast-moving sounds smoother at a CPU cost; raising it saves CPU and makes them steppy. |
| `soundPath` | string | `"assets/sounds"` | Resource-relative directory that `soundFile` arguments are resolved against. Must stay inside the resource and must be covered by the manifest's `files{}` block. Leading and trailing slashes are stripped; `..` is rejected. |

### `defaults`

Applied **only** when a caller passes nothing usable for that parameter — a
missing argument, `nil`/`undefined`, or a non-finite number. For `range`,
non-positive values also fall back, because a range of `0` previously produced a
silent sound.

| Key | Type | Default | Effect |
|---|---|---|---|
| `defaults.range` | number, 0.1–10000 | `50` | Fallback audible radius in metres. |
| `defaults.volume` | number, 0–1 | `1.0` | Fallback volume. |
| `defaults.loop` | boolean | `false` | Fallback loop flag. |
| `defaults.dimension` | number, -1–65535 | `-1` | Fallback routing bucket. `-1` means audible in every bucket. |

### `limits`

Clamps. These can only ever make a sound quieter, shorter-ranged or refused —
never louder or longer. An out-of-range request is clamped, not rejected, so a
misbehaving consumer degrades audibly instead of erroring.

| Key | Type | Default | Effect |
|---|---|---|---|
| `limits.maxVolume` | number, 0–1 | `1.0` | Hard volume ceiling. Set to e.g. `0.8` to globally quieten every sound without touching the resources that request them. `0` mutes everything. |
| `limits.maxRange` | number, 1–10000 | `1000` | Hard ceiling on `range`, which becomes the PannerNode's `maxDistance`. |
| `limits.maxConcurrentSounds` | number, 1–512 | `64` | Soft cap on simultaneously playing sounds per client. Beyond it, new plays are refused with a warning; nothing already playing is stopped. Each entity-attached sound also costs one tick at `tickIntervalMs`, so this doubles as a CPU guard. |

### `panner`

The Web Audio `PannerNode` attenuation curve, applied in the NUI. These are the
knobs that decide what "distance" sounds like.

| Key | Type | Default | Effect |
|---|---|---|---|
| `panner.panningModel` | `"HRTF"` \| `"equalpower"` | `"HRTF"` | `HRTF` does true binaural spatialization — you can tell front from back. `equalpower` is simple left/right panning and noticeably cheaper on weak CPUs. |
| `panner.distanceModel` | `"linear"` \| `"inverse"` \| `"exponential"` | `"linear"` | How volume falls off with distance. See the warning below. |
| `panner.refDistance` | number, 0.01–1000 | `1` | Distance in metres up to which the sound plays at full volume. Rolloff begins after this. |
| `panner.rolloffFactor` | number, 0–100 | `1` | Steepness of the falloff. With `linear` and `1`, volume reaches exactly zero at `range`. |

!!! warning "`distanceModel` interacts with `range`"
    Only `linear` honours `maxDistance` as a hard cutoff. `inverse` and
    `exponential` ignore `maxDistance` entirely — a sound stays faintly audible
    well past the `range` you passed in, at any distance. If you switch away from
    `linear`, your `range` arguments stop meaning "silent beyond here".

### `security`

| Key | Type | Default | Effect |
|---|---|---|---|
| `security.verifyRoutingBucket` | boolean | `false` | When enabled, the server checks a client's claimed routing bucket against `GetPlayerRoutingBucket()` before replaying dimension-scoped sounds to it, and ignores mismatches. |

!!! note "Why this defaults to off"
    The bucket a client reports is otherwise fully trusted, which means a modified
    client can ask the server to replay the sounds of any bucket to itself. Turning
    verification on closes that, at the cost of a rare false negative: if the
    server moves a player between buckets at the same moment the client reports the
    change, the check can see a mismatch and drop that one re-sync. It self-heals
    on the next bucket change.

    It ships off so that upgrading does not change behaviour. **If you use routing
    buckets as a privacy or anti-cheat boundary, turn it on.** See
    [Known Limitations](limitations.md#1-routing-bucket-claims-are-client-trusted).

## Which runtime reads what

| Setting | Server | Client | NUI |
|---|:-:|:-:|:-:|
| `debug` | ✅ | ✅ | ✅ |
| `tickIntervalMs` | | ✅ | |
| `soundPath` | | | ✅ |
| `defaults.*` | ✅ | ✅ | |
| `limits.maxVolume`, `limits.maxRange` | ✅ | ✅ | ✅ |
| `limits.maxConcurrentSounds` | | ✅ | ✅ |
| `panner.*` | | | ✅ |
| `security.verifyRoutingBucket` | ✅ | | |

Volume and range limits are applied at all three layers deliberately: a value
that gets past one layer is still clamped by the next.

The NUI receives its settings from the client over a handshake rather than reading
the file itself — see [Architecture](architecture.md#the-nui-handshake).

## Error handling

`config.json` never takes the resource down. Every failure mode degrades to a
working default and reports why:

| Situation | Result |
|---|---|
| File missing or empty | Built-in defaults, one informational line |
| Not valid JSON | Built-in defaults, one warning with the parse error |
| Not a JSON object (array, number, string) | Built-in defaults, one warning |
| A key missing | Default for that key only — merging is per-key, not per-section |
| A key with the wrong type | Default for that key, one warning naming the dotted path |
| A number outside its range | **Clamped** to the nearest bound, one warning |
| An invalid enum value | Default for that key, one warning listing the allowed values |
| An unknown extra key | Ignored silently |

Warnings are printed regardless of the `debug` setting — a broken config is not
debug chatter.

!!! tip "Changes need a restart"
    `config.json` is read once at resource start. Run `restart 3d-audio` in the
    server console after editing it.
