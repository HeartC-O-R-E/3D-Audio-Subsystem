# Known Limitations

This page documents real defects and sharp edges that exist in the current
release, with their consequences and what to do about them. It is deliberately
blunt: knowing a limitation beats discovering it on a live server.

These are tracked for a follow-up hardening pass. Nothing here is a reason not to
use the resource — but if any of them matters for your server, read the mitigation.

---

## 1. Routing bucket claims are client-trusted

**Severity: moderate — a privacy issue if you use buckets as a boundary**

The client tells the server which routing bucket it is in, and by default the
server believes it. A modified client can claim any bucket and get the server to
replay that bucket's sounds to itself.

Separately, dimension filtering happens on the **client**, not the server. The
server emits `3d-audio:play` to `target` regardless of bucket and the client drops
what does not match. So even without spoofing, a modified client receives the play
messages — including file names and world positions — for sounds in buckets it is
not in.

**Consequence:** routing buckets are an audio *convenience*, not a security
boundary. If your instances are meant to be private, sound metadata leaks across
them.

**Mitigation:** turn on bucket verification:

```json title="config.json"
{ "security": { "verifyRoutingBucket": true } }
```

The server then compares the claimed bucket against `GetPlayerRoutingBucket()` and
ignores mismatches. This closes the spoofing half. It ships **off** so that
upgrading does not change behaviour, and it carries one small cost: if the server
moves a player between buckets at the same instant the client reports a change,
the check can see a mismatch and drop that single re-sync. It self-heals on the
next change.

The client-side-filtering half is not fixed by that flag — fixing it properly
means the server filtering recipients before it emits, which is a behavioural
change held for the follow-up pass.

---

## 2. Sound end reports are unvalidated

**Severity: low**

When a one-shot finishes, the client tells the server so the registry entry can be
freed. The server does not check that the reporting client has anything to do with
that sound. A modified client can send `3d-audio:client-ended` with any sound ID
and delete that entry.

**Consequence:** deleting an entry does not stop the sound for anyone — it only
removes it from the registry, which means it is no longer replayed to players
entering its routing bucket. The worst outcome is a bucket-scoped sound going
missing for players who arrive late.

**Mitigation:** none needed for most servers. Do not rely on bucket re-sync as
the only mechanism keeping an important sound audible.

---

## 3. Endless loops leak registry entries

**Severity: moderate — unbounded memory growth if you get it wrong**

A sound started with `loop = true` and `loopDurationSeconds = 0` has nothing that
will ever clean it up:

- the browser does not report the end of a looping sound (it would fire on every
  iteration, which is not the end)
- no auto-stop timer is armed, because the duration is `0`
- so the only exit is an explicit `stop` call

**Consequence:** every endless loop you do not stop stays in `soundRegistry` for
the lifetime of the resource, and keeps being re-sent to every player who changes
routing bucket. Over a long uptime this is unbounded growth, and players entering
instances start hearing alarms that stopped being relevant hours ago.

**Mitigation:** always pair an endless loop with a `stop` you are certain will
run — including on error paths and when the entity that owns the sound is deleted.

```lua
local soundId = exports['3d-audio']:play3d(-1, 'alarm.mp3', x, y, z, 150.0, 0.6, true, 0)

-- make sure this is reachable from every path that ends the alarm
exports['3d-audio']:stop(-1, soundId)
```

Better, if you can bound it: pass a `loopDurationSeconds` and let the resource
arm the timer. A generous upper bound still beats no bound.

```lua
-- stops itself after 10 minutes no matter what your code does
exports['3d-audio']:play3d(-1, 'alarm.mp3', x, y, z, 150.0, 0.6, true, 600)
```

---

## 4. No routing bucket handshake on join

**Severity: low — confusing rather than harmful**

The client starts with `currentDimension = 0` and there is no handshake asking the
server what the real bucket is. A player who spawns directly into a non-zero
bucket believes they are in bucket `0` until something calls `setDimension`.

**Consequence:** dimension-scoped sounds are silently dropped for that player.
With `debug` off there is no indication at all; with it on you see:

```text
[3d-audio] play #1 "alarm.mp3" → skipped (dim mismatch: current=0, sound=5)
```

**Mitigation:** call `setDimension` on spawn, not only on change:

```lua
AddEventHandler('playerSpawned', function()
    TriggerServerEvent('myframework:requestBucket')
end)
```

Note also that `setDimension` returns immediately if the value matches what it
already has, so you cannot use it to force a re-sync at the current bucket.

---

## 5. Entity-attached sounds restart rather than resume

**By design, but worth knowing**

When a tracked entity leaves your streaming range, the sound stops. When the
entity comes back, the sound starts again **from the beginning**.

For a looping alarm this is invisible. For a long one-shot it is clearly audible,
and there is no way around it: the client cannot track an entity it is not
streaming, so there is no position to update and no notion of how far the sound
should have progressed.

---

## 6. Asymmetric export signatures

**By design, kept for backward compatibility**

The server and client APIs differ in ways that are easy to get wrong:

| | Server | Client |
|---|---|---|
| `play3d` first argument | `target` (player id, `-1` = everyone) | `soundId` (negative, caller-allocated) |
| `play3d` returns | the sound ID | nothing |
| `play3d` has `loopDurationSeconds` | yes | no |
| `stop` arguments | `(target, soundId)` | `(soundId)` |

**Consequence:** copying a server call into client code produces something that
typechecks in Lua, runs, and plays the wrong thing — or passes your `target` as a
sound ID.

**Mitigation:** none planned. Changing the signatures would break every existing
consumer. See [the API overview](api/index.md#2-the-two-play3d-signatures-are-not-the-same)
for the details, and prefer distinct-looking IDs (like `-1001`) in client code so
the two never look interchangeable.

---

## 7. Sound file paths are not validated

**Severity: low, but a bad failure mode**

`soundFile` is a free-form string, checked nowhere until the browser tries to load
it. A typo produces no server error, no in-game error, and no log line outside the
NUI console — which is a separate browser context that needs remote debugging to
open.

**Consequence:** a misspelled filename looks exactly like "the audio system is
broken".

**Mitigation:** see
[opening the NUI console](troubleshooting.md#opening-the-nui-console). When adding
new sounds, test each one once before relying on it.

---

## Reporting something not listed here

Open an issue at
[github.com/HeartC-O-R-E/3D-Audio-Subsystem/issues](https://github.com/HeartC-O-R-E/3D-Audio-Subsystem/issues).
Include the detail asked for in
[Troubleshooting](troubleshooting.md#still-stuck).
