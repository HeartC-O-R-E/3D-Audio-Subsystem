# Troubleshooting

## Turn on debug logging first

Almost everything below is diagnosed from the logs, and they are off by default.

```json title="config.json"
{ "debug": true }
```

```text
restart 3d-audio
```

Then watch three places:

| Console | How | Shows |
|---|---|---|
| **Server** | your server console | `play3d` calls, bucket re-syncs, registry cleanup |
| **Client** | <kbd>F8</kbd> in game | play/stop decisions, dimension filtering, entity tracking |
| **NUI** | see below | file load errors, Howler and AudioContext state |

### Opening the NUI console

The NUI is a separate browser context, and its errors do **not** appear in
<kbd>F8</kbd>. To see them, start FiveM with remote debugging and open
`http://localhost:13172` in Chrome, then pick the `3d-audio` page.

The NUI console is where a wrong filename shows up, so it is worth the setup the
first time a sound is silent.

---

## A sound does nothing at all

Work through these in order.

### 1. Is the resource running?

```text
> ensure 3d-audio
```

You should see both lines:

```text
[3d-audio] Server loaded (debug=true, verifyRoutingBucket=false)
[3d-audio] Client loaded (debug=true, tick=50ms)
```

If only the server line appears, the client script failed to load — check for a
JavaScript error above it.

### 2. Is the folder named `3d-audio`?

This is the single most common cause.

In FiveM the resource name is the **folder name**. If you cloned the repository,
your folder is probably `3D-Audio-Subsystem`, which means `exports['3d-audio']` in
your code resolves to nothing and throws inside *your* resource, not this one.

```bash
# correct
resources/3d-audio/
# broken — exports['3d-audio'] will not resolve
resources/3D-Audio-Subsystem/
```

Rename the folder and restart.

### 3. Did you build it?

A plain `git clone` is not runnable. `fxmanifest.lua` points at `dist/`, which is
generated and not committed. Either install a
[release](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/releases) or run
`npm run build` — see [Building from Source](building.md).

Symptom: the server logs a missing-file error for `dist/server/index.js` on start.

### 4. Is the filename right?

Check the NUI console for:

```text
[3d-audio] load error #1 "alarm/vehiclealrm.mp3": ... (src: /assets/sounds/alarm/vehiclealrm.mp3)
```

Paths are relative to `assets/sounds/`, use forward slashes, and are
case-sensitive on Linux servers. Nothing validates them server-side, so a typo is
completely silent apart from this line.

### 5. Is the sound scoped to a routing bucket you are not in?

With `debug` on, the client prints:

```text
[3d-audio] play #1 "alarm/vehiclealarm.mp3" → skipped (dim mismatch: current=0, sound=5)
```

Either play it with `dimension = -1`, or make sure something calls
[`setDimension`](api/client.md#setdimension). See
[silent after teleporting](#sounds-go-silent-after-teleporting-or-entering-an-instance).

### 6. Is the AudioContext suspended?

The NUI console logs its state on startup:

```text
[3d-audio] NUI ready, Howler context: suspended
```

`running` is what you want. `suspended` means Chromium's autoplay policy has
blocked audio until a user gesture. This is rare inside FiveM because the NUI is
loaded in a trusted context, but if you see it, clicking in game usually resumes
it. Persistent suspension points at an unusual client setup rather than a problem
with the resource.

### 7. Is the volume or range effectively zero?

```lua
-- range 0 falls back to defaults.range, but volume 0 is honoured as silence
exports['3d-audio']:play3d(-1, 'x.mp3', x, y, z, 50.0, 0.0, false)  -- silent, by request
```

Also check `limits.maxVolume` in your config — setting it to `0` mutes everything
globally, which is easy to forget about.

---

## The sound plays but is not positional

It is audible but has no direction, or does not get quieter as you walk away.

- **Check `panningModel`.** `equalpower` is plain left/right panning with no
  front/back distinction. `HRTF` is the spatial one.
- **Check `distanceModel`.** Only `linear` treats `range` as a hard cutoff.
  `inverse` and `exponential` ignore `maxDistance` entirely, so a sound stays
  faintly audible at any distance.
- **Check `refDistance`.** Everything within `refDistance` metres plays at full
  volume. A large value means no attenuation anywhere nearby.
- **Is the file stereo?** A stereo file carries its own left/right image, which
  fights the spatialization. Convert positional sounds to mono.
- **Is the listener tick running?** With `debug` on you should see activity while
  a sound plays. If the tick is dead, the listener pose never updates and the
  sound sits at a fixed point relative to your head.

---

## Sounds go silent after teleporting or entering an instance

Classic routing bucket problem. The client cannot read its own routing bucket —
FiveM has no native for it — so it assumes bucket `0` until told otherwise.

Fix: call `setDimension` whenever you change a player's bucket, **and once on
spawn**:

```lua
-- server
SetPlayerRoutingBucket(src, bucket)
TriggerClientEvent('myframework:bucketChanged', src, bucket)
```

```lua
-- client
RegisterNetEvent('myframework:bucketChanged', function(bucket)
    exports['3d-audio']:setDimension(bucket)
end)
```

A player who spawns straight into a non-zero bucket and is never told about it
silently drops every dimension-scoped sound. See
[Known Limitations](limitations.md#4-no-routing-bucket-handshake-on-join).

---

## A looping sound will not stop

Check which of these applies.

**You started it with `loopDurationSeconds = 0`.** Nothing will ever stop it
except an explicit `stop` call. The browser does not report the end of a looping
sound, and no timer was armed.

```lua
exports['3d-audio']:stop(-1, soundId)   -- server: target first, then id
exports['3d-audio']:stop(soundId)       -- client: id only
```

**You lost the sound ID.** The server `play3d` returns it; you have to keep it.
Without it there is no way to target that specific sound, and the only recovery is
`restart 3d-audio`, which clears all state.

**You called the wrong `stop`.** The server form takes two arguments, the client
form takes one. Passing two to the client export means the second is ignored and
the *first* — your `target` — is treated as the sound ID.

---

## A sound restarts when I walk away and come back

Expected behaviour for entity-attached sounds. When the entity leaves your
streaming range, `NetworkGetEntityFromNetworkId` stops resolving, and the client
treats that as a pause. Coming back starts playback **from the beginning**, not
from where it left off.

For a looping alarm this is invisible. For a long one-shot it is noticeable, and
there is no way around it without the entity staying streamed.

---

## `config.json` changes have no effect

- **Did you restart?** Config is read once at resource start. `restart 3d-audio`.
- **Is it valid JSON?** Look for a parse warning on start:
  ```text
  [3d-audio] config.json is not valid JSON (...) — using built-in defaults
  ```
  Trailing commas and comments are the usual culprits; JSON allows neither.
- **Did a value get clamped?** Out-of-range numbers are clamped rather than
  rejected, and say so:
  ```text
  [3d-audio] config: tickIntervalMs = 5 is outside [10, 1000] — clamped to 10
  ```
- **Is `config.json` in the manifest?** It must be listed in `files{}` or the
  client cannot read it and silently uses defaults while the server uses your
  file. If you edited `fxmanifest.lua`, make sure `'config.json'` is still there.
- **Is it in the right place?** The one the resource reads is the one next to
  `fxmanifest.lua` in your `resources/3d-audio/` folder — not the one in a source
  checkout elsewhere.

---

## Too many sounds are being refused

```text
[3d-audio] refusing sound #42: limits.maxConcurrentSounds (64) reached
```

Either you are genuinely playing more than 64 sounds at once, or sounds are not
being cleaned up. Looping sounds never clean themselves up, so a resource that
starts loops without stopping them will reach the cap eventually.

Raise `limits.maxConcurrentSounds` if the load is real. If it is not, find the
loops you are not stopping — with `debug` on, every play and stop is logged, so
compare the counts.

---

## Still stuck?

Open an issue at
[github.com/HeartC-O-R-E/3D-Audio-Subsystem/issues](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/issues)
with:

- what you called, verbatim (the whole `play3d` line)
- server console output with `debug: true`
- <kbd>F8</kbd> client console output
- NUI console output if you can get it
- your `config.json`
- your FiveM server artifact version
