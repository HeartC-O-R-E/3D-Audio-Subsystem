<h1 align="center">3D Audio Subsystem</h1>

<p align="center">
  <strong>Play arbitrary audio files at world coordinates in FiveM, with real positional audio.</strong>
</p>

<p align="center">
  <a href="https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/actions/workflows/build.yml"><img src="https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/actions/workflows/build.yml/badge.svg" alt="Build"></a>
  <a href="https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/actions/workflows/docs.yml"><img src="https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/actions/workflows/docs.yml/badge.svg" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"></a>
</p>

<p align="center">
  📖 <strong><a href="https://heartc-o-r-e.github.io/3D-Audio-Subsystem/">Full documentation</a></strong>
</p>

---

GTA V can only play sounds the game already ships. `3d-audio` adds the missing
primitive: *play this file, at these coordinates, audible for this many metres.*
Any resource can call it, and every nearby player hears the sound from the right
direction, at the right volume, falling to silence at the range you choose.

The game scripts track positions; the actual mixing happens in an invisible NUI
page driven by [Howler.js](https://howlerjs.com/) over the Web Audio API. That
gives real HRTF spatialization — turn your head in game and the sound moves around
you — rather than simple left/right panning.

- **No framework dependency.** No ESX, no QBCore, no ox_lib. There is exactly one
  optional integration point, and only if you use routing buckets.
- **Entity-attached sounds** that follow a vehicle or ped and pause when it leaves
  streaming range.
- **Routing bucket support** with re-sync, so arriving late still means hearing the
  alarm that is already ringing.
- **Configurable** attenuation curve, tick rate, defaults and limits.

## Installation

> [!IMPORTANT]
> **The resource folder must be named `3d-audio`.** In FiveM the resource name
> *is* the folder name, so a differently named folder makes every
> `exports['3d-audio']` call fail to resolve.

1. Download the latest `3d-audio-vX.Y.Z.zip` from
   [Releases](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/releases).
2. Extract it into your server's `resources/` directory — the archive already
   contains a correctly named `3d-audio/` folder.
3. Add to `server.cfg`:
   ```cfg
   ensure 3d-audio
   ```

> [!NOTE]
> A plain `git clone` is **not** runnable: `fxmanifest.lua` points at `dist/`,
> which is generated and not committed. Use a release, or
> [build from source](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/building/).

Full guide: **[Installation](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/installation/)**

## FiveM exports

Five exports — two on the server, three on the client.

### Server

```lua
-- play3d(target, soundFile, x, y, z, range, volume, loop,
--        loopDurationSeconds, dimension, entityNetId) -> soundId
--
-- target = player server-id, or -1 for all clients
-- returns a POSITIVE sound id; keep it if you want to stop the sound

-- a one-shot everyone nearby hears
exports['3d-audio']:play3d(-1, 'vehicle/car_locking.wav',
    x, y, z, 15.0, 0.8, false)

-- a looping alarm that stops itself after 3 minutes
local soundId = exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3',
    x, y, z, 150.0, 0.6, true, 180)

-- an alarm attached to a vehicle: follows it, pauses out of streaming range
local netId = NetworkGetNetworkIdFromEntity(vehicle)
exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3',
    0.0, 0.0, 0.0, 150.0, 0.6, true, 180, -1, netId)

-- stop(target, soundId)
exports['3d-audio']:stop(-1, soundId)
```

### Client

```lua
-- play3d(soundId, soundFile, x, y, z, range, volume, loop,
--        dimension, entityNetId) -> void
--
-- YOU allocate soundId, and it must be NEGATIVE (positive ids are the server's)

local soundId = -1001
exports['3d-audio']:play3d(soundId, 'vehicle/car_unlocking.wav',
    x, y, z, 20.0, 1.0, false)

-- stop(soundId) -- note: one argument, unlike the server's two
exports['3d-audio']:stop(soundId)

-- tell the resource when the local routing bucket changes
exports['3d-audio']:setDimension(bucket)

-- fired when a client-local one-shot finishes
AddEventHandler('3d-audio:ended', function(id) end)
```

### JavaScript / TypeScript

```ts
const soundId: number = exports['3d-audio'].play3d(-1, 'alarm/vehiclealarm.mp3',
    x, y, z, 150.0, 0.6, true, 180)

exports['3d-audio'].stop(-1, soundId)
```

### Parameters

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `target` *(server only)* | number | — | Player server-id, or `-1` for all clients |
| `soundId` *(client only)* | number | — | Caller-allocated, must be **negative** |
| `soundFile` | string | — | Path relative to `assets/sounds/`, e.g. `alarm/vehiclealarm.mp3` |
| `x`, `y`, `z` | number | — | World position. Ignored when `entityNetId > 0` |
| `range` | number | `50` | Audible radius in metres; volume hits zero here |
| `volume` | number | `1.0` | `0.0`–`1.0` |
| `loop` | boolean | `false` | Whether to loop |
| `loopDurationSeconds` *(server only)* | number | `0` | Auto-stop after N seconds. **`0` = forever — you must call `stop`** |
| `dimension` | number | `-1` | Routing bucket filter; `-1` = all buckets |
| `entityNetId` | number | `0` | If `> 0`, the sound follows this entity |

> [!WARNING]
> The server and client `play3d` signatures are **not** interchangeable: the
> server's first argument is `target`, the client's is `soundId`, and `stop` takes
> two arguments on the server but one on the client. This is the most common source
> of integration bugs.

Complete reference with per-export detail:
**[API Reference](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/api/)**

## Configuration

All settings live in `config.json`. Every default reproduces the previously
hardcoded value, so deleting the file changes nothing.

```json
{
  "debug": false,
  "tickIntervalMs": 50,
  "soundPath": "assets/sounds",
  "defaults": { "range": 50, "volume": 1.0, "loop": false, "dimension": -1 },
  "limits": { "maxVolume": 1.0, "maxRange": 1000, "maxConcurrentSounds": 64 },
  "panner": {
    "panningModel": "HRTF",
    "distanceModel": "linear",
    "refDistance": 1,
    "rolloffFactor": 1
  },
  "security": { "verifyRoutingBucket": false }
}
```

Set `"debug": true` and restart the resource when diagnosing anything — it is the
first step in every troubleshooting path.

Every key explained:
**[Configuration](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/configuration/)**

## Adding your own sounds

Drop files into `assets/sounds/` and reference them by relative path. Anything
Chromium can decode works (MP3, OGG, WAV, …). Prefer mono for positional sounds —
a stereo file carries its own left/right image that fights the spatialization.

**[Sound Files](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/sounds/)**

## Build from source

Requires Node.js 22. Two npm projects: the game scripts (esbuild) and the NUI
(Vite).

```bash
npm run install:all     # npm ci in both projects
npm run build           # typecheck, config check, esbuild, vite
npm run package         # stage a runnable resource into package/3d-audio/
```

**[Building from Source](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/building/)**

## Known limitations

This resource has documented rough edges — routing buckets are not a privacy
boundary, endless loops must be stopped explicitly or they leak registry entries,
and there is no routing bucket handshake on join. All of them are written up
honestly, with mitigations, before you hit them in production:

**[Known Limitations](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/limitations/)**

## License

[Apache-2.0](LICENSE).

> [!CAUTION]
> The example sound files under `assets/sounds/` are **not** covered by the
> Apache-2.0 license and their provenance is unverified. Treat them as local test
> fixtures, not as something to ship or redistribute. See
> [Sound Files](https://heartc-o-r-e.github.io/3D-Audio-Subsystem/sounds/#licensing).

Bundles [Howler.js](https://howlerjs.com/) (MIT) into the NUI build — see
[NOTICE](NOTICE).

---

<p align="center"><sub>Build by Northdegree, Julscha</sub></p>
