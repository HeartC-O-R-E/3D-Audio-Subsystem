# Server Exports

Call these from any **server** script.

---

## `play3d`

Plays a sound at a world position for one player or for everyone, and registers it
so it can be re-sent to players who enter its routing bucket later.

```lua
local soundId = exports['3d-audio']:play3d(
    target, soundFile, x, y, z, range, volume, loop,
    loopDurationSeconds, dimension, entityNetId
)
```

### Parameters

| # | Name | Type | Default | Description |
|---|---|---|---|---|
| 1 | `target` | number | *required* | Player server-id to play for, or **`-1` for all clients**. |
| 2 | `soundFile` | string | *required* | Path relative to `soundPath` (`assets/sounds` by default), e.g. `alarm/vehiclealarm.mp3`. Forward slashes. Not validated — a typo only produces a warning in the player's NUI console. |
| 3 | `x` | number | *required* | World X. |
| 4 | `y` | number | *required* | World Y. |
| 5 | `z` | number | *required* | World Z. |
| 6 | `range` | number | `defaults.range` | Audible radius in metres. Volume falls to zero at exactly this distance (with the default `linear` distance model). Clamped to `limits.maxRange`. |
| 7 | `volume` | number | `defaults.volume` | `0.0`–`1.0`. Clamped to `limits.maxVolume`. |
| 8 | `loop` | boolean | `defaults.loop` | Whether to loop. |
| 9 | `loopDurationSeconds` | number | `0` | With `loop = true`, auto-stop after this many seconds. **`0` means loop forever** — see the warning below. Ignored when `loop` is `false`. |
| 10 | `dimension` | number | `defaults.dimension` (`-1`) | Routing bucket filter. `-1` = audible in every bucket. |
| 11 | `entityNetId` | number | `0` | If `> 0`, the sound follows this entity instead of staying at `x, y, z`. See [Entity-attached sounds](#entity-attached-sounds). |

### Returns

`number` — a positive sound ID, from a counter that starts at `1` and increments
for the lifetime of the resource. Keep it if you ever want to stop the sound.

### Examples

=== "One-shot for everyone"

    ```lua
    -- an impact sound at a position; nothing to clean up, it ends by itself
    exports['3d-audio']:play3d(-1, 'vehicle/car_locking.wav',
        coords.x, coords.y, coords.z, 15.0, 0.8, false)
    ```

=== "One-shot for a single player"

    ```lua
    RegisterCommand('testsound', function(source)
        local ped = GetPlayerPed(source)
        local c = GetEntityCoords(ped)
        exports['3d-audio']:play3d(source, 'vehicle/car_unlocking.wav',
            c.x, c.y, c.z, 20.0, 1.0, false)
    end, true)
    ```

=== "Timed loop"

    ```lua
    -- an alarm that stops itself after 3 minutes
    local soundId = exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3',
        c.x, c.y, c.z, 150.0, 0.6, true, 180)
    ```

=== "Endless loop"

    ```lua
    -- you are now responsible for stopping this
    local soundId = exports['3d-audio']:play3d(-1, 'music/club_loop.mp3',
        c.x, c.y, c.z, 40.0, 0.5, true, 0)

    -- ...later, without fail:
    exports['3d-audio']:stop(-1, soundId)
    ```

!!! warning "Endless loops must be stopped explicitly"
    With `loop = true` and `loopDurationSeconds = 0` there is nothing that will
    ever clean the sound up. The browser never reports the end of a looping
    sound (it would fire on every iteration), and no timer is armed, so the
    server's registry keeps the entry **forever** — and keeps re-sending it to
    players who change routing buckets.

    Always pair an endless loop with a `stop` call you are certain will run,
    including on error paths and when the owning entity is deleted. See
    [Known Limitations](../limitations.md#3-endless-loops-leak-registry-entries).

### Entity-attached sounds

Pass a network ID in `entityNetId` and the sound follows that entity:

```lua
local netId = NetworkGetNetworkIdFromEntity(vehicle)
local soundId = exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3',
    0.0, 0.0, 0.0,              -- (1)
    150.0, 0.6, true, 180, -1, netId)
```

1. The `x, y, z` arguments are ignored when `entityNetId > 0` — the position comes
   from the entity each tick. Pass the entity's current coords anyway if you prefer;
   it makes no difference.

Each client then tracks the entity itself: the sound's position updates at
`tickIntervalMs`, **pauses** when the entity leaves that client's streaming range,
and **resumes** when it comes back. A client that never streams the entity never
hears the sound at all.

!!! note
    If the entity is permanently deleted, the sound stops on every client but the
    server's registry entry stays. Call `stop` when you delete the entity.

### Routing buckets

With `dimension` set to a bucket number, only players currently in that bucket
hear the sound. On top of plain filtering, the server **re-sends** such a sound to
any player who later moves into that bucket, so arriving late still means hearing
the alarm that is already ringing.

This requires your framework to call
[`setDimension`](client.md#setdimension) on the client when the bucket changes —
FiveM has no client native for reading it. Without that call, bucket-scoped sounds
are silently dropped.

`dimension = -1` (the default) needs no integration at all.

---

## `stop`

Stops a sound and removes it from the server's registry.

```lua
exports['3d-audio']:stop(target, soundId)
```

### Parameters

| # | Name | Type | Description |
|---|---|---|---|
| 1 | `target` | number | Player server-id, or `-1` for all clients. Use the same value you passed to `play3d`. |
| 2 | `soundId` | number | The ID `play3d` returned. |

### Returns

Nothing.

### Notes

- Safe to call for an ID that already finished or never existed — it is a no-op.
- Also cancels a pending `loopDurationSeconds` timer, so a timed loop stopped
  early does not fire its auto-stop later.
- **Two arguments**, unlike the client's one-argument `stop`. See
  [the API overview](index.md#2-the-two-play3d-signatures-are-not-the-same).

```lua
-- stopping a broadcast sound
local soundId = exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3', x, y, z, 150.0, 0.6, true, 0)
exports['3d-audio']:stop(-1, soundId)
```
