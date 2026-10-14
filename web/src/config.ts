/**
 * 3d-audio — NUI configuration
 *
 * The NUI cannot import from ../../src/shared/config.ts: it is a separate
 * tsconfig and module graph (bundler resolution, DOM lib, Vite build) from the
 * esbuild game-script bundles.
 *
 * KEEP THE DEFAULTS BELOW IN SYNC WITH src/shared/config.ts → DEFAULT_CONFIG.
 * They are only ever used as a fallback: the authoritative, validated config is
 * pushed down by the client script in response to our nui-ready callback.
 */

export type PanningModel = 'HRTF' | 'equalpower'
export type DistanceModel = 'linear' | 'inverse' | 'exponential'

export interface NuiConfig {
  debug: boolean
  soundPath: string
  panner: {
    panningModel: PanningModel
    distanceModel: DistanceModel
    refDistance: number
    rolloffFactor: number
  }
  maxVolume: number
  maxRange: number
  maxConcurrentSounds: number
}

/** Fallback only — mirrors src/shared/config.ts DEFAULT_CONFIG. */
export const DEFAULT_NUI_CONFIG: NuiConfig = {
  debug: false,
  soundPath: 'assets/sounds',
  panner: {
    panningModel: 'HRTF',
    distanceModel: 'linear',
    refDistance: 1,
    rolloffFactor: 1,
  },
  maxVolume: 1.0,
  maxRange: 1000,
  maxConcurrentSounds: 64,
}

/** Live config. Replaced wholesale when the client pushes the real one. */
export const config: NuiConfig = { ...DEFAULT_NUI_CONFIG }

let ready = false

export function isConfigReady(): boolean {
  return ready
}

export function applyConfig(incoming: Partial<NuiConfig> | null | undefined): void {
  if (incoming) {
    Object.assign(config, incoming)
    if (incoming.panner) config.panner = { ...DEFAULT_NUI_CONFIG.panner, ...incoming.panner }
  }
  ready = true
}

/**
 * The resource name as seen by the NUI. GetParentResourceName() is a global
 * injected into every FiveM NUI frame; the literal fallback keeps `vite dev`
 * from throwing.
 *
 * Resolving this at runtime rather than hardcoding it means renaming the
 * resource folder does not silently break the NUI callbacks.
 */
export function resourceName(): string {
  const g = globalThis as unknown as { GetParentResourceName?: () => string }
  try {
    return typeof g.GetParentResourceName === 'function' ? g.GetParentResourceName() : '3d-audio'
  } catch {
    return '3d-audio'
  }
}

export function nuiUrl(callback: string): string {
  return `https://${resourceName()}/${callback}`
}
