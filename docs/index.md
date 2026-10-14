# 3D Audio Subsystem

**Play arbitrary audio files at world coordinates in FiveM, with real positional
audio.**

`3d-audio` is a standalone FiveM resource. Any other resource can ask it to play a
sound at a position in the world, and every nearby player hears it from the right
direction, at the right volume, falling to silence at a distance you choose.

```lua
-- an alarm at a vehicle, audible for 150 m, looping for 3 minutes
local soundId = exports['3d-audio']:play3d(
    -1, 'alarm/vehiclealarm.mp3', x, y, z, 150.0, 0.6, true, 180
)
```

## Why this exists

GTA V's native audio system can only play sounds the game already ships, from a
fixed set of sound sets. It has no primitive for "play this MP3 at these
coordinates". `3d-audio` builds one: the game scripts track positions, and the
actual mixing happens in an invisible NUI browser page driven by
[Howler.js](https://howlerjs.com/) over the Web Audio API.

That means real HRTF spatialization — the same technique used for binaural audio —
rather than simple left/right panning. Turn your head in game and the sound moves
around you.

## Features

- **Positional playback** of any audio file the browser can decode (MP3, OGG, WAV, …)
- **Distance attenuation** with a configurable curve and a hard cutoff at your chosen range
- **Entity-attached sounds** that follow a vehicle or ped, and automatically pause
  when it leaves streaming range and resume when it comes back
- **Routing bucket (dimension) support**, including re-sync — a player entering a
  bucket hears a sound that started before they arrived
- **Server-side and client-side APIs**, with separate sound-ID namespaces so the two
  never collide
- **Zero framework dependencies.** It does not need ESX, QBCore, ox_lib or anything
  else. There is exactly one integration point, [`setDimension`](api/client.md#setdimension),
  and you only need it if you use routing buckets.
- **Configurable** through [`config.json`](configuration.md) — tick rate, attenuation
  curve, defaults and limits

## Getting started

<div class="grid cards" markdown>

- :material-download: **[Installation](installation.md)** — download, drop in, `ensure`
- :material-tune: **[Configuration](configuration.md)** — every `config.json` key
- :material-code-braces: **[API Reference](api/index.md)** — every export, with examples
- :material-sitemap: **[Architecture](architecture.md)** — how it actually works
- :material-music-note: **[Sound Files](sounds.md)** — adding your own audio
- :material-help-circle: **[Troubleshooting](troubleshooting.md)** — when there is no sound

</div>

!!! warning "Read this before you file a bug"
    This resource has known rough edges, documented honestly in
    [Known Limitations](limitations.md). If something surprises you, check there
    first — it may already be a known behaviour with a workaround.

## License

Apache-2.0. The bundled example sound files are **not** covered by that license —
see [Sound Files](sounds.md#licensing) before you ship them.

Build by Northdegree, Julscha.
