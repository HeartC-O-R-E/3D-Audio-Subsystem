# Sound Files

## Where they go

Sound files live in `assets/sounds/` inside the resource, and `soundFile`
arguments are paths relative to that directory:

```text
3d-audio/
└── assets/
    └── sounds/
        ├── alarm/
        │   └── vehiclealarm.mp3     → 'alarm/vehiclealarm.mp3'
        ├── vehicle/
        │   ├── car_locking.wav      → 'vehicle/car_locking.wav'
        │   └── car_unlocking.wav    → 'vehicle/car_unlocking.wav'
        └── mysound.mp3              → 'mysound.mp3'
```

Subdirectories are free — nest as deeply as you like and use forward slashes in
the `soundFile` argument on every platform.

You can move the whole directory with the [`soundPath`](configuration.md#top-level)
setting, as long as the new location stays inside the resource and is covered by
the manifest's `files{}` block.

## Adding your own

1. Drop the file into `assets/sounds/` (or a subfolder).
2. Reference it by its relative path:
   ```lua
   exports['3d-audio']:play3d(-1, 'sirens/ambulance.ogg', x, y, z, 120.0, 0.7, true, 0)
   ```
3. `restart 3d-audio`.

No registration step and no manifest edit — `fxmanifest.lua` already ships
`assets/sounds/**/*`, so anything you put there is served.

!!! warning "Paths are not validated"
    A wrong path produces **no error on the server and no error in game**. The
    only sign is a line in the player's NUI console:

    ```text
    [3d-audio] load error #1 "sirens/ambluance.ogg": ... (src: /assets/sounds/sirens/ambluance.ogg)
    ```

    See [Troubleshooting](troubleshooting.md#a-sound-does-nothing-at-all) for how
    to open that console.

## Supported formats

Playback is the browser's (CEF's) decoder, not the game's, so anything Chromium
can decode works:

| Format | Notes |
|---|---|
| **MP3** | Safest default. Universally supported. |
| **OGG/Vorbis** | Supported, usually smaller than MP3 at the same quality. |
| **WAV** | Supported, uncompressed — fine for short one-shots, wasteful for long audio. |
| **AAC/M4A** | Generally works. |
| **FLAC** | Generally works, but the file size rarely justifies it for game audio. |

### Practical guidance

- **Keep files small.** Every file is downloaded by every client that plays it, and
  it ships inside your resource. A 1.8 MB sound is 1.8 MB added to every player's
  initial download.
- **Mono is usually better.** Positional audio works by placing a point source in
  space; a stereo file already has its own left/right image, which fights the
  spatialization. Mono gives cleaner directionality.
- **Trim silence** from the start and end. Leading silence delays the sound
  audibly; trailing silence delays the end-of-sound cleanup.
- **For loops, make them seamless.** The browser restarts the file immediately at
  the end, so any gap or click at the loop point is clearly audible on every
  iteration.
- **Normalise levels** across your sound set, then control loudness with the
  `volume` argument rather than by re-encoding.

## The bundled example files

| File | Size | Purpose |
|---|---|---|
| `alarm/vehiclealarm.mp3` | 358 KB | A looping vehicle alarm — a good test for `loop` plus `entityNetId`. |
| `vehicle/car_locking.wav` | 87 KB | Short one-shot. |
| `vehicle/car_unlocking.wav` | 87 KB | Short one-shot. |

They exist so you can verify the resource works before sourcing your own audio.

## Licensing

!!! danger "The bundled sounds are not covered by the Apache-2.0 license"
    This repository is Apache-2.0, and that license applies to the **code**. The
    provenance of the audio files under `assets/sounds/` has not been verified,
    and they are **not** licensed to you under Apache-2.0.

    Treat them as test fixtures: fine for checking that your integration works
    locally, not something to ship on a public server or redistribute. Replace
    them with audio you own or that carries a license allowing your use.

    If you need freely usable audio, [freesound.org](https://freesound.org/) and
    [OpenGameArt](https://opengameart.org/) both let you filter by license —
    look for CC0.

An earlier internal version of this resource also shipped a file called
`ars.mp3`. It was deliberately **not** included here, because it is not ours to
distribute. If you are migrating from that version and your code references it,
you will need to supply your own file.
