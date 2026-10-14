<script setup lang="ts">
/**
 * 3d-audio — Browser Audio Layer
 *
 * Invisible component managing all 3D positional audio via Howler.js.
 * Positive sound IDs are server-initiated, negative IDs are client-local —
 * both use the same Map and the same message format.
 */

import { onMounted, onUnmounted } from 'vue'
import { Howl, Howler } from 'howler'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayMsg {
  type: '3d-audio:play'
  soundId: number
  soundFile: string
  x: number; y: number; z: number
  range: number
  volume: number
  loop: boolean
}

interface StopMsg {
  type: '3d-audio:stop'
  soundId: number
}

interface UpdatePosMsg {
  type: '3d-audio:update-pos'
  soundId: number
  x: number; y: number; z: number
}

interface ListenerMsg {
  type: '3d-audio:listener'
  px: number; py: number; pz: number
  rx: number; ry: number; rz: number
}

type Msg = PlayMsg | StopMsg | UpdatePosMsg | ListenerMsg

// ─── State ────────────────────────────────────────────────────────────────────

const sounds = new Map<number, Howl>()

/**
 * The resource name as seen by the NUI. GetParentResourceName() is a global
 * injected into every FiveM NUI frame; the literal fallback keeps `vite dev`
 * from throwing.
 *
 * Resolved at runtime rather than hardcoded so that renaming the resource
 * folder does not silently break the NUI callbacks.
 */
function resourceName(): string {
  const g = globalThis as unknown as { GetParentResourceName?: () => string }
  try {
    return typeof g.GetParentResourceName === 'function' ? g.GetParentResourceName() : '3d-audio'
  } catch {
    return '3d-audio'
  }
}

const log = (...args: unknown[]) => console.log('[3d-audio]', ...args)
const warn = (...args: unknown[]) => console.warn('[3d-audio]', ...args)

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onPlay(msg: PlayMsg): void {
  const src = `/assets/sounds/${msg.soundFile}`

  // Stop any existing Howl for this ID (can happen when server re-sends a
  // dimension-specific sound after a bucket change)
  const existing = sounds.get(msg.soundId)
  if (existing) {
    existing.stop()
    existing.unload()
  }

  const howl = new Howl({
    src: [src],
    volume: msg.volume,
    loop: msg.loop,
    onload() {
      // Guard: if this Howl was replaced (e.g. entity left and re-entered streaming
      // range) while it was still loading, discard it to prevent duplicate playback.
      if (sounds.get(msg.soundId) !== howl) {
        howl.unload()
        return
      }
      howl.pos(msg.x, msg.y, msg.z)
      howl.pannerAttr({
        panningModel: 'HRTF',
        distanceModel: 'linear',  // hard cutoff at maxDistance (inverse ignores maxDistance)
        refDistance: 1,           // full volume up to 1 m, then linear rolloff begins
        rolloffFactor: 1,         // reaches 0 exactly at maxDistance
        maxDistance: msg.range,
      })
      howl.play()
    },
    onend() {
      // For looping sounds, onend fires at the end of every iteration — the sound
      // is still active. Only clean up on end for non-looping sounds.
      if (msg.loop) return
      sounds.delete(msg.soundId)
      fetch(`https://${resourceName()}/3d-audio:ended`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soundId: msg.soundId }),
      }).catch(() => { /* NUI callback may not be available during resource shutdown */ })
    },
    onloaderror(_id: number, err: unknown) {
      warn(`load error #${msg.soundId} "${msg.soundFile}": ${err} (src: ${src})`)
      sounds.delete(msg.soundId)
    },
    onplayerror(_id: number, err: unknown) {
      warn(`play error #${msg.soundId}: ${err}`)
      sounds.delete(msg.soundId)
    },
  })

  sounds.set(msg.soundId, howl)
}

function onStop(msg: StopMsg): void {
  const howl = sounds.get(msg.soundId)
  if (howl) {
    howl.stop()
    howl.unload()
    sounds.delete(msg.soundId)
  }
}

function onUpdatePos(msg: UpdatePosMsg): void {
  sounds.get(msg.soundId)?.pos(msg.x, msg.y, msg.z)
}

function onListener(msg: ListenerMsg): void {
  Howler.pos(msg.px, msg.py, msg.pz)

  // Convert GTA V Euler angles (degrees, rotOrder=2: rz=yaw, rx=pitch) to a
  // normalised forward direction vector for the Web Audio API.
  //
  // GTA heading convention: 0° = North (+Y), 90° = West, 180° = South, 270° = East.
  // Passing raw angles here would give a zero-vector when facing North — undefined
  // behaviour in the PannerNode and broken HRTF spatialization.
  //
  // Up vector stays (0, 0, 1) — GTA's Z-axis is vertical.
  const toRad = (d: number) => d * Math.PI / 180
  const yaw   = toRad(msg.rz)   // heading  (0 = North)
  const pitch = toRad(msg.rx)   // pitch    (positive = nose up)
  const fx = -Math.sin(yaw) * Math.cos(pitch)
  const fy =  Math.cos(yaw) * Math.cos(pitch)
  const fz =  Math.sin(pitch)
  Howler.orientation(fx, fy, fz, 0, 0, 1)
}

// ─── Message dispatch ─────────────────────────────────────────────────────────

function onMessage(event: MessageEvent): void {
  const data = event.data as Msg
  if (!data?.type) return

  if      (data.type === '3d-audio:play'       ) onPlay(data)
  else if (data.type === '3d-audio:stop'       ) onStop(data)
  else if (data.type === '3d-audio:update-pos' ) onUpdatePos(data)
  else if (data.type === '3d-audio:listener'   ) onListener(data)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  log('NUI ready, Howler context:', Howler.ctx?.state ?? 'no AudioContext')
  window.addEventListener('message', onMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  sounds.forEach(h => { h.stop(); h.unload() })
  sounds.clear()
})
</script>

<template>
  <!-- No visible UI — audio-only NUI overlay -->
</template>
