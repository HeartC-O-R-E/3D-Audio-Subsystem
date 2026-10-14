# Events & NUI Messages

!!! warning "These are internal"
    Everything on this page is implementation detail of how the three layers talk
    to each other. **Depend on the [exports](index.md), not on these events** —
    they can change between versions without a major bump.

    This page exists for people forking the resource, debugging it, or reading the
    source.

The one exception is `3d-audio:ended`, which is a deliberate public hook for
client-local sounds — see [client `play3d`](client.md#knowing-when-a-sound-finished).

## Net events

### Server → client

#### `3d-audio:play`

Start a sound. Emitted by the server `play3d` export and again by the bucket
re-sync.

| # | Argument | Type |
|---|---|---|
| 1 | `soundId` | number (positive) |
| 2 | `soundFile` | string |
| 3 | `x` | number |
| 4 | `y` | number |
| 5 | `z` | number |
| 6 | `range` | number |
| 7 | `volume` | number |
| 8 | `loop` | boolean |
| 9 | `dimension` | number |
| 10 | `entityNetId` | number |

The values here are already normalised and clamped by the server. The client
clamps again on receipt.

#### `3d-audio:stop`

Stop a sound.

| # | Argument | Type |
|---|---|---|
| 1 | `soundId` | number |

### Client → server

#### `3d-audio:bucket-changed`

The local routing bucket changed; replay sounds scoped to the new one.

| # | Argument | Type |
|---|---|---|
| 1 | `newBucket` | number |

The server answers by emitting `3d-audio:play` for every registered sound whose
`dimension` matches `newBucket` and whose `target` is either `-1` or this player.

!!! danger "Client-trusted by default"
    The claimed bucket is taken at face value unless
    `security.verifyRoutingBucket` is enabled. See
    [Known Limitations](../limitations.md#1-routing-bucket-claims-are-client-trusted).

#### `3d-audio:client-ended`

A server-initiated one-shot finished; drop its registry entry.

| # | Argument | Type |
|---|---|---|
| 1 | `soundId` | number (positive) |

Without this the server's registry would grow forever and would re-send completed
sounds to players changing buckets.

!!! danger "Unvalidated"
    The server does not check that the reporting client has anything to do with
    the sound. See
    [Known Limitations](../limitations.md#2-sound-end-reports-are-unvalidated).

## Client-local events

### `3d-audio:ended`

Emitted on the client when a **client-local** (negative ID), **non-looping** sound
finishes playing.

| # | Argument | Type |
|---|---|---|
| 1 | `soundId` | number (negative) |

```lua
AddEventHandler('3d-audio:ended', function(soundId) end)
```

Server-initiated (positive ID) sounds do not fire this — they go to the server as
`3d-audio:client-ended` instead. Looping sounds never fire it, because the browser
reports the end of every loop iteration.

## NUI callbacks

Registered with `RegisterNuiCallbackType` on the client; the NUI invokes them with
`fetch`.

| Callback | Direction | Payload | Purpose |
|---|---|---|---|
| `3d-audio:nui-ready` | NUI → client | `{}` | The browser page mounted and wants its configuration. The client answers with a `3d-audio:config` message. |
| `3d-audio:ended` | NUI → client | `{ soundId: number }` | A non-looping sound finished. Routed to the local event or to the server depending on the ID's sign. |

The NUI builds these URLs from `GetParentResourceName()` rather than a hardcoded
name, so renaming the resource folder does not break them.

## NUI messages

Sent from the client to the browser page with `SendNuiMessage`. Each is a JSON
object with a `type` field.

### `3d-audio:config`

Sent in reply to `3d-audio:nui-ready`. Until it arrives, the NUI queues every
other message.

```json
{
  "type": "3d-audio:config",
  "config": {
    "debug": false,
    "soundPath": "assets/sounds",
    "panner": {
      "panningModel": "HRTF",
      "distanceModel": "linear",
      "refDistance": 1,
      "rolloffFactor": 1
    },
    "maxVolume": 1.0,
    "maxRange": 1000,
    "maxConcurrentSounds": 64
  }
}
```

### `3d-audio:play`

```json
{
  "type": "3d-audio:play",
  "soundId": 1, "soundFile": "alarm/vehiclealarm.mp3",
  "x": 0.0, "y": 0.0, "z": 0.0,
  "range": 150.0, "volume": 0.6, "loop": true
}
```

The NUI resolves the file as `/<soundPath>/<soundFile>` against the resource root.
Note that `dimension` and `entityNetId` are **not** in this message — both are
handled entirely on the client side before it is sent.

### `3d-audio:stop`

```json
{ "type": "3d-audio:stop", "soundId": 1 }
```

### `3d-audio:update-pos`

Sent once per tick per entity-attached sound.

```json
{ "type": "3d-audio:update-pos", "soundId": 1, "x": 0.0, "y": 0.0, "z": 0.0 }
```

### `3d-audio:listener`

The listener pose, sent once per tick while anything is playing.

```json
{
  "type": "3d-audio:listener",
  "px": 0.0, "py": 0.0, "pz": 0.0,
  "rx": 0.0, "ry": 0.0, "rz": 0.0
}
```

`rx`/`ry`/`rz` are GTA Euler angles in degrees with rotation order 2. The NUI
converts them to a Web Audio forward vector — see
[Architecture](../architecture.md#listener-orientation).

## Renaming the event namespace

All of these names are built from a single constant in `src/shared/events.ts`:

```ts
export const EVENT_PREFIX = '3d-audio';
```

Changing it renames every event and NUI message at once. It is also a breaking
change for anything listening to `3d-audio:ended`, so treat it as a major version
bump.
