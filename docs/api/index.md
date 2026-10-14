# API Overview

`3d-audio` exposes five exports: two on the server, three on the client.

| Side | Export | Purpose |
|---|---|---|
| Server | [`play3d`](server.md#play3d) | Play a sound for one player or everyone |
| Server | [`stop`](server.md#stop) | Stop a sound you started |
| Client | [`play3d`](client.md#play3d) | Play a sound only this player hears |
| Client | [`stop`](client.md#stop) | Stop a client-local sound |
| Client | [`setDimension`](client.md#setdimension) | Tell the resource the routing bucket changed |

## Two things to get right

Almost every integration bug comes from one of these two.

### 1. Sound IDs are split into two namespaces by sign

| Sign | Owner | Who allocates it |
|---|---|---|
| **Positive** (`1`, `2`, `3`, …) | Server | The resource. `play3d` **returns** it to you. |
| **Negative** (`-1`, `-2`, `-1001`, …) | Client | **You.** You pass it *in* to the client `play3d`. |

So the server export hands you an ID, and the client export expects one. Never
pass a positive ID to the client `play3d` — it collides with the server's
namespace and the two sounds will fight over the same slot.

### 2. The two `play3d` signatures are not the same

They look alike and are not:

```lua
-- SERVER: first arg is the TARGET player, returns the sound id
local id = exports['3d-audio']:play3d(target, soundFile, x, y, z, range, volume, loop,
                                      loopDurationSeconds, dimension, entityNetId)

-- CLIENT: first arg is the SOUND ID you chose, returns nothing
exports['3d-audio']:play3d(soundId, soundFile, x, y, z, range, volume, loop,
                           dimension, entityNetId)
```

Differences: the client version has no `target` (it is always the local player)
and no `loopDurationSeconds` (use a timer in your own code), and its first
argument means something completely different.

`stop` is asymmetric for the same reason:

```lua
exports['3d-audio']:stop(target, soundId)  -- server, two arguments
exports['3d-audio']:stop(soundId)          -- client, one argument
```

!!! danger "`-1` means different things on each side"
    On the server, `target = -1` means "all clients". On the client, the first
    argument is the sound ID, so `-1` there is a perfectly valid sound ID. The
    examples in these docs use IDs like `-1001` on the client to keep the two
    visually distinct.

## Server or client?

Use the **server** export when the sound is part of world state that multiple
players should hear: a car alarm, an explosion, a siren, a speaker in a club.
The server owns the registry, so the sound survives players coming and going and
is re-sent to players who enter its routing bucket later.

Use the **client** export when the sound belongs to one player's own experience
and nobody else should hear it: UI feedback, a sound only the person interacting
with something should get. No network traffic, no server state.

## Calling exports

=== "Lua"

    ```lua
    local soundId = exports['3d-audio']:play3d(-1, 'alarm/vehiclealarm.mp3',
        100.0, 200.0, 30.0, 80.0, 0.7, false)
    ```

=== "JavaScript / TypeScript"

    ```ts
    const soundId: number = exports['3d-audio'].play3d(-1, 'alarm/vehiclealarm.mp3',
        100.0, 200.0, 30.0, 80.0, 0.7, false)
    ```

=== "TypeScript (defensive)"

    ```ts
    // esbuild shadows FiveM's `exports` with the CommonJS one, so reach for it
    // through globalThis if your bundler does the same.
    const fx = (globalThis as any).exports;

    let soundId: number | null = null;
    try {
        soundId = fx['3d-audio'].play3d(-1, 'alarm/vehiclealarm.mp3',
            100.0, 200.0, 30.0, 80.0, 0.7, false);
    } catch (e) {
        console.warn('[my-resource] 3d-audio unavailable:', e);
    }
    ```

!!! tip "Degrade gracefully"
    Wrap calls in `pcall`/`try` if your resource should keep working when
    `3d-audio` is not running. Nothing here is required for your resource to
    start, so there is no reason for a missing audio resource to break it.

    If you want FiveM to enforce the ordering instead, add
    `dependency '3d-audio'` to your own `fxmanifest.lua`.

## Events

The net events and NUI messages are documented in
[Events & NUI Messages](events.md), but they are **internal**. Depend on the
exports, not on the events — the exports are the stable surface.
