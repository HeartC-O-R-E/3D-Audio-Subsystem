# Client Exports

Call these from any **client** script.

---

## `play3d`

Plays a sound that only the local player hears. No network traffic, no server
state.

```lua
exports['3d-audio']:play3d(
    soundId, soundFile, x, y, z, range, volume, loop,
    dimension, entityNetId
)
```

!!! danger "You allocate the sound ID, and it must be negative"
    Unlike the server export, this one does **not** return an ID — you pass one
    in. It must be negative: positive IDs belong to the server's namespace and
    reusing one makes the two sounds collide on the same slot.

    Keep a counter:

    ```lua
    local nextSoundId = 0
    local function allocId()
        nextSoundId = nextSoundId - 1
        return nextSoundId
    end
    ```

### Parameters

| # | Name | Type | Default | Description |
|---|---|---|---|---|
| 1 | `soundId` | number | *required* | **Negative** ID you allocate yourself. |
| 2 | `soundFile` | string | *required* | Path relative to `soundPath` (`assets/sounds` by default). |
| 3 | `x` | number | *required* | World X. |
| 4 | `y` | number | *required* | World Y. |
| 5 | `z` | number | *required* | World Z. |
| 6 | `range` | number | `defaults.range` | Audible radius in metres. Clamped to `limits.maxRange`. |
| 7 | `volume` | number | `defaults.volume` | `0.0`–`1.0`. Clamped to `limits.maxVolume`. |
| 8 | `loop` | boolean | `defaults.loop` | Whether to loop. There is no `loopDurationSeconds` here — use your own timer. |
| 9 | `dimension` | number | `defaults.dimension` (`-1`) | Only play if the local routing bucket matches. `-1` = always. |
| 10 | `entityNetId` | number | `0` | If `> 0`, follow this entity's position with pause/resume on streaming range. |

### Returns

Nothing.

### Examples

=== "Simple one-shot"

    ```lua
    local c = GetEntityCoords(PlayerPedId())
    exports['3d-audio']:play3d(-1001, 'vehicle/car_locking.wav',
        c.x, c.y, c.z, 15.0, 0.8, false)
    ```

=== "With an allocator"

    ```lua
    local nextSoundId = 0
    local function allocId()
        nextSoundId = nextSoundId - 1
        return nextSoundId
    end

    local id = allocId()
    exports['3d-audio']:play3d(id, 'vehicle/car_unlocking.wav',
        x, y, z, 20.0, 1.0, false)
    ```

=== "Loop attached to a vehicle"

    ```lua
    local id = allocId()
    local netId = NetworkGetNetworkIdFromEntity(veh)
    exports['3d-audio']:play3d(id, 'alarm/vehiclealarm.mp3',
        0.0, 0.0, 0.0, 60.0, 0.5, true, -1, netId)

    -- stop it yourself when you are done
    exports['3d-audio']:stop(id)
    ```

### Knowing when a sound finished

When a client-local (negative ID) one-shot finishes, the resource fires a local
event with that ID:

```lua
AddEventHandler('3d-audio:ended', function(soundId)
    print(('sound %d finished'):format(soundId))
end)
```

This only fires for **non-looping** sounds with **negative** IDs. Looping sounds
never fire it, and server-initiated sounds report to the server instead.

---

## `stop`

Stops a client-local sound.

```lua
exports['3d-audio']:stop(soundId)
```

### Parameters

| # | Name | Type | Description |
|---|---|---|---|
| 1 | `soundId` | number | The negative ID you passed to `play3d`. |

### Returns

Nothing.

!!! note "One argument, not two"
    The server's `stop` takes `(target, soundId)`. This one takes just
    `(soundId)`. Passing two arguments here means the second is ignored and the
    *first* is treated as the sound ID — which, if you copied a server call, is
    your `target` value and almost certainly the wrong sound.

---

## `setDimension`

Tells `3d-audio` that the local player's routing bucket changed.

```lua
exports['3d-audio']:setDimension(bucket)
```

### Parameters

| # | Name | Type | Description |
|---|---|---|---|
| 1 | `bucket` | number | The routing bucket the local player is now in. |

### Returns

Nothing.

### Why this exists

**This is the only thing `3d-audio` needs from your framework.** FiveM exposes no
client-side native that reads the local player's routing bucket — the server knows
it, the client does not. So the resource cannot detect bucket changes on its own
and has to be told.

You only need this if you use routing buckets. If every sound you play uses
`dimension = -1` (the default), you can ignore this export entirely.

### What it does

1. Stops and forgets every tracked sound whose `dimension` is not `-1`, and
   cancels their entity-tracking ticks. Sounds with `dimension = -1` keep playing.
2. Records the new bucket, so subsequent dimension-scoped sounds are filtered
   against it.
3. Notifies the server, which re-sends every registered sound belonging to the new
   bucket — so you hear an alarm that was already ringing when you arrived.

### Where to call it

Wherever your code changes a player's bucket. Server-side you call
`SetPlayerRoutingBucket`; mirror that to the client:

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

!!! warning "The client assumes bucket 0 until you say otherwise"
    There is no handshake on join: the client starts with `currentDimension = 0`.
    A player who spawns directly into a non-zero bucket silently drops
    dimension-scoped sounds until something calls `setDimension`. Call it once on
    spawn as well as on every change. See
    [Known Limitations](../limitations.md#4-no-routing-bucket-handshake-on-join).

!!! note "Calling it with the current value does nothing"
    `setDimension` returns immediately if the bucket has not actually changed, so
    calling it defensively on a loop is harmless — but it also means you cannot
    use it to force a re-sync.
