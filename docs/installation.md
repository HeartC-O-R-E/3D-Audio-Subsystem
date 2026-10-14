# Installation

## The folder name matters

!!! danger "The resource folder must be named `3d-audio`"
    In FiveM a resource's name **is its folder name**. The `name` field in
    `fxmanifest.lua` is only metadata. Exports are keyed on the real resource
    name, so if your folder is called anything else, every
    `exports['3d-audio']` call in your own code silently fails to resolve.

    If you clone this repository, clone it *into* the right folder name:

    ```bash
    git clone https://github.com/HeartC-O-R-E/3D-Audio-Subsystem.git 3d-audio
    ```

## Install from a release (recommended)

The repository does not contain built JavaScript — `fxmanifest.lua` points at
`dist/`, which is generated. A plain `git clone` therefore gives you a resource
that will **not** start. Use a release instead.

1. Go to [Releases](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/releases)
   and download `3d-audio-vX.Y.Z.zip`.
2. Extract it into your server's `resources/` directory. The archive already
   contains a top-level `3d-audio/` folder, so you end up with
   `resources/3d-audio/` — correct by construction. Do not rename it.
3. Add it to your `server.cfg`:

   ```cfg
   ensure 3d-audio
   ```

4. Restart the server. You should see:

   ```text
   [3d-audio] Server loaded (debug=false, verifyRoutingBucket=false)
   [3d-audio] Client loaded (debug=false, tick=50ms)
   ```

That is the whole installation. There is nothing to add to a database and no
framework bridge to configure.

## Install from source

See [Building from Source](building.md) if you want to modify the resource. You
need Node.js 22 and two `npm ci` runs; the build output goes to `dist/`.

## What a release archive contains

```text
3d-audio/
├── fxmanifest.lua
├── config.json          ← edit this, it is yours
├── dist/
│   ├── server/index.js
│   ├── client/index.js
│   └── web/             ← the NUI audio layer
├── assets/sounds/       ← example sounds; put your own here
├── README.md
└── LICENSE
```

No `src/`, no `node_modules/`, no build tooling — only what the server needs.

## Upgrading

Replace `dist/` and `assets/` from the new archive and **keep your own
`config.json`**. Missing or partial config falls back to built-in defaults, and
every default reproduces the behaviour you already had, so an upgrade never
changes how your sounds behave unless you change the file yourself.

## Integrating it

Nothing else is required to play sounds — go straight to the
[API Reference](api/index.md).

The one exception is routing buckets. FiveM has no client-side native that reads
the local player's routing bucket, so if your server moves players between
buckets you must tell `3d-audio` when that happens:

```lua
-- wherever your framework changes the player's routing bucket
exports['3d-audio']:setDimension(newBucket)
```

Without this call, sounds you scope to a specific bucket are silently dropped on
the client. Sounds with `dimension = -1` (the default) are unaffected and work
with no integration at all. See [`setDimension`](api/client.md#setdimension).
