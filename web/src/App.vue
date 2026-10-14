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
import { config, applyConfig, isConfigReady, nuiUrl, type NuiConfig } from './config'

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

interface ConfigMsg {
  type: '3d-audio:config'
  config: NuiConfig
}

type Msg = PlayMsg | StopMsg | UpdatePosMsg | ListenerMsg | ConfigMsg

// ─── State ────────────────────────────────────────────────────────────────────

const sounds = new Map<number, Howl>()

/**
 * Messages that arrive between mount and the config handshake completing.
 * Flushed in arrival order once the client has answered.
 */
const pending: Msg[] = []

const log = (...args: unknown[]) => { if (config.debug) console.log('[3d-audio]', ...args) }
const warn = (...args: unknown[]) => console.warn('[3d-audio]', ...args)

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onPlay(msg: PlayMsg): void {
  const src = `/${config.soundPath}/${msg.soundFile}`

  // Stop any existing Howl for this ID (can happen when server re-sends a
  // dimension-specific sound after a bucket change)
  const existing = sounds.get(msg.soundId)
  if (existing) {
    existing.stop()
    existing.unload()
  } else if (sounds.size >= config.maxConcurrentSounds) {
    warn(`refusing sound #${msg.soundId}: maxConcurrentSounds (${config.maxConcurrentSounds}) reached`)
    return
  }

  const volume = clamp(msg.volume, 0, config.maxVolume)
  const range = clamp(msg.range, 0.1, config.maxRange)

  const howl = new Howl({
    src: [src],
    volume,
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
        panningModel: config.panner.panningModel,
        // 'linear' gives a hard cutoff at maxDistance; 'inverse' and 'exponential'
        // ignore maxDistance entirely and stay faintly audible past `range`.
        //
        // The cast is needed because @types/howler narrows distanceModel to
        // 'linear' | 'inverse', while Howler and the Web Audio PannerNode both
        // accept 'exponential' at runtime.
        distanceModel: config.panner.distanceModel as 'linear' | 'inverse',
        refDistance: config.panner.refDistance,
        rolloffFactor: config.panner.rolloffFactor,
        maxDistance: range,
      })
      howl.play()
    },
    onend() {
      // For looping sounds, onend fires at the end of every iteration — the sound
      // is still active. Only clean up on end for non-looping sounds.
      if (msg.loop) return
      sounds.delete(msg.soundId)
      fetch(nuiUrl('3d-audio:ended'), {
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
  const yaw = toRad(msg.rz)   // heading  (0 = North)
  const pitch = toRad(msg.rx)   // pitch    (positive = nose up)
  const fx = -Math.sin(yaw) * Math.cos(pitch)
  const fy = Math.cos(yaw) * Math.cos(pitch)
  const fz = Math.sin(pitch)
  Howler.orientation(fx, fy, fz, 0, 0, 1)
}

// ─── Message dispatch ─────────────────────────────────────────────────────────

function dispatch(data: Msg): void {
  if (data.type === '3d-audio:play') onPlay(data)
  else if (data.type === '3d-audio:stop') onStop(data)
  else if (data.type === '3d-audio:update-pos') onUpdatePos(data)
  else if (data.type === '3d-audio:listener') onListener(data)
}

function onMessage(event: MessageEvent): void {
  const data = event.data as Msg
  if (!data?.type) return

  if (data.type === '3d-audio:config') {
    applyConfig(data.config)
    log('config applied', config)
    while (pending.length > 0) dispatch(pending.shift()!)
    return
  }

  // Queue anything that arrives before the handshake completes, so no sound is
  // played with fallback panner settings that may differ from config.json.
  if (!isConfigReady()) {
    pending.push(data)
    return
  }

  dispatch(data)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  // Listener first, so nothing is missed while the handshake is in flight.
  window.addEventListener('message', onMessage)

  fetch(nuiUrl('3d-audio:nui-ready'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {
    // Not running inside FiveM (vite dev), or the client script is not up yet.
    // Fall back to the built-in defaults so the NUI still works.
    applyConfig(null)
    while (pending.length > 0) dispatch(pending.shift()!)
  })

  console.log('[3d-audio] NUI ready, Howler context:', Howler.ctx?.state ?? 'no AudioContext')
})

onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  sounds.forEach(h => { h.stop(); h.unload() })
  sounds.clear()
  pending.length = 0
})
</script>

<template>
  <!-- No visible UI — audio-only NUI overlay -->
</template>
