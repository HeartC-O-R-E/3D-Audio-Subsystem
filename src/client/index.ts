/**
 * 3d-audio — Client
 *
 * Bridges sound play requests to the NUI Howler.js layer.
 * Positive sound IDs = server-initiated, negative IDs = client-local.
 *
 * DIMENSION HANDLING
 *   FiveM exposes no client-side native to read the player's routing bucket.
 *   Your framework must call exports['3d-audio']['setDimension'](dim) whenever
 *   the local player's routing bucket changes — this is the only thing 3d-audio
 *   needs from the surrounding gamemode. On dimension change:
 *     1. Stops all sounds bound to the old bucket.
 *     2. Notifies the server so it can re-send sounds for the new bucket.
 *   Sounds with dimension = -1 are never stopped by dimension changes.
 *
 * CLIENT EXPORTS
 *
 *   setDimension(dim: number): void
 *     Must be called whenever the routing bucket changes.
 *   play3d(soundId, soundFile, x, y, z, range, volume, loop,
 *          dimension?, entityNetId?): void
 *     Caller allocates soundId (must be negative for client-local sounds).
 *   stop(soundId): void
 *
 * ENTITY TRACKING
 *   When entityNetId > 0 the sound pauses when the entity leaves streaming
 *   range and resumes when it re-enters. The tracking tick runs at
 *   config.tickIntervalMs (default 50 ms = 20 Hz).
 */

import { loadAudioConfig, makeLogger, toNuiConfig } from '../shared/config';
import { NET_PLAY, NET_STOP, NET_BUCKET_CHANGED, NET_CLIENT_ENDED, LOCAL_ENDED, NUI_ENDED, NUI_READY, NUI_MSG } from '../shared/events';

// Use globalThis to prevent esbuild from shadowing FiveM's exports() with CommonJS exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exp = (globalThis as any).exports as (name: string, fn: (...args: any[]) => any) => void;

const cfg = loadAudioConfig();
const { log, warn } = makeLogger(cfg);
const TICK_MS = cfg.tickIntervalMs;

// ─── State ────────────────────────────────────────────────────────────────────

let listenerTick: ReturnType<typeof setTick> | null = null;
let currentDimension = 0;    // updated by setDimension(); default = main world

/** Sound IDs currently playing in the NUI */
const activeSounds = new Set<number>();
/** soundId → routing bucket (-1 = all) */
const soundDimensions = new Map<number, number>();
/** soundId → entity-tracking tick */
const entityTracks = new Map<number, ReturnType<typeof setTick>>();

// ─── Argument normalisation ───────────────────────────────────────────────────
// Config supplies defaults only where a caller passed nothing usable, and limits
// that can only ever make a sound quieter or shorter-ranged.

function clamp(v: number, min: number, max: number): number {
    return Math.min(Math.max(v, min), max);
}

function normRange(range: number): number {
    const v = (typeof range === 'number' && Number.isFinite(range) && range > 0)
        ? range : cfg.defaults.range;
    return clamp(v, 0.1, cfg.limits.maxRange);
}

function normVolume(volume: number): number {
    const v = (typeof volume === 'number' && Number.isFinite(volume))
        ? volume : cfg.defaults.volume;
    return clamp(v, 0, cfg.limits.maxVolume);
}

function normLoop(loop: boolean): boolean {
    return typeof loop === 'boolean' ? loop : cfg.defaults.loop;
}

function normDimension(dimension: number): number {
    return (typeof dimension === 'number' && Number.isFinite(dimension))
        ? dimension : cfg.defaults.dimension;
}

/** Soft concurrency cap — refuses new sounds rather than evicting existing ones. */
function atCapacity(soundId: number): boolean {
    if (activeSounds.has(soundId) || entityTracks.has(soundId)) return false;
    const inFlight = activeSounds.size + entityTracks.size;
    if (inFlight < cfg.limits.maxConcurrentSounds) return false;
    warn(`refusing sound #${soundId}: limits.maxConcurrentSounds (${cfg.limits.maxConcurrentSounds}) reached`);
    return true;
}

// ─── Active-sound helpers ─────────────────────────────────────────────────────

function activateSound(soundId: number): void {
    if (activeSounds.has(soundId)) return;
    activeSounds.add(soundId);
    ensureListenerTick();
}

function deactivateSound(soundId: number): void {
    activeSounds.delete(soundId);
}

// ─── Internal dimension-change handler ────────────────────────────────────────

function onDimensionChange(newDim: number): void {
    if (newDim === currentDimension) return;

    log(`dimension ${currentDimension} → ${newDim}, stopping ${soundDimensions.size} tracked sound(s)`);

    soundDimensions.forEach((soundDim, soundId) => {
        if (soundDim !== -1) {
            if (activeSounds.has(soundId)) {
                deactivateSound(soundId);
                SendNuiMessage(JSON.stringify({ type: NUI_MSG.stop, soundId }));
            }
            stopEntityTracking(soundId);
            soundDimensions.delete(soundId);
        }
    });

    currentDimension = newDim;
    emitNet(NET_BUCKET_CHANGED, newDim);
}

// ─── Listener tick ────────────────────────────────────────────────────────────

function ensureListenerTick(): void {
    if (listenerTick !== null) return;

    listenerTick = setTick(async () => {
        if (activeSounds.size === 0 && entityTracks.size === 0) {
            clearTick(listenerTick!);
            listenerTick = null;
            return;
        }

        const ped = PlayerPedId();
        const [px, py, pz] = GetEntityCoords(ped, true);
        const [rx, ry, rz] = GetEntityRotation(ped, 2);

        SendNuiMessage(JSON.stringify({
            type: NUI_MSG.listener,
            px, py, pz, rx, ry, rz,
        }));

        await new Promise<void>(resolve => setTimeout(resolve, TICK_MS));
    });
}

// ─── Entity tracking ──────────────────────────────────────────────────────────

function startEntityTracking(
    soundId: number,
    entityNetId: number,
    soundFile: string,
    range: number,
    volume: number,
    loop: boolean,
): void {
    if (entityTracks.has(soundId)) return;

    log(`entity-track start #${soundId} entity=${entityNetId} file="${soundFile}"`);

    let soundActive = false;

    const tick = setTick(async () => {
        const entity = NetworkGetEntityFromNetworkId(entityNetId);

        if (!DoesEntityExist(entity)) {
            if (soundActive) {
                soundActive = false;
                deactivateSound(soundId);
                SendNuiMessage(JSON.stringify({ type: NUI_MSG.stop, soundId }));
                log(`entity-track #${soundId}: entity left streaming range → paused`);
            }
            await new Promise<void>(resolve => setTimeout(resolve, TICK_MS)); // no need to hammer while entity is gone
            return;
        }

        const [x, y, z] = GetEntityCoords(entity, false);

        if (!soundActive) {
            soundActive = true;
            activateSound(soundId);
            SendNuiMessage(JSON.stringify({
                type: NUI_MSG.play,
                soundId, soundFile, x, y, z, range, volume, loop,
            }));
            log(`entity-track #${soundId}: entity in range → playing @ (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        } else {
            SendNuiMessage(JSON.stringify({ type: NUI_MSG.updatePos, soundId, x, y, z }));
        }

        await new Promise<void>(resolve => setTimeout(resolve, TICK_MS));
    });

    entityTracks.set(soundId, tick);
    ensureListenerTick();
}

function stopEntityTracking(soundId: number): void {
    const tick = entityTracks.get(soundId);
    if (tick !== undefined) {
        clearTick(tick);
        entityTracks.delete(soundId);
        log(`entity-track stopped #${soundId}`);
    }
}

// ─── Play / stop helpers ──────────────────────────────────────────────────────

function playSound(
    soundId: number,
    soundFile: string,
    x: number, y: number, z: number,
    range: number, volume: number, loop: boolean,
): void {
    activateSound(soundId);
    SendNuiMessage(JSON.stringify({
        type: NUI_MSG.play,
        soundId, soundFile, x, y, z, range, volume, loop,
    }));
}

function stopSound(soundId: number): void {
    deactivateSound(soundId);
    stopEntityTracking(soundId);
    soundDimensions.delete(soundId);
    SendNuiMessage(JSON.stringify({ type: NUI_MSG.stop, soundId }));
}

/** Shared by the server-pushed and client-local play paths. */
function dispatchPlay(
    soundId: number,
    soundFile: string,
    x: number, y: number, z: number,
    range: number, volume: number, loop: boolean,
    dimension: number,
    entityNetId: number,
): void {
    const dim = normDimension(dimension);

    if (dim !== -1 && currentDimension !== dim) {
        log(`play #${soundId} "${soundFile}" → skipped (dim mismatch: current=${currentDimension}, sound=${dim})`);
        return;
    }
    if (atCapacity(soundId)) return;

    const r = normRange(range);
    const v = normVolume(volume);
    const l = normLoop(loop);

    soundDimensions.set(soundId, dim);
    log(`play #${soundId} "${soundFile}" dim=${dim} entity=${entityNetId} range=${r} vol=${v} loop=${l}`);

    if (entityNetId > 0) {
        startEntityTracking(soundId, entityNetId, soundFile, r, v, l);
    } else {
        playSound(soundId, soundFile, x, y, z, r, v, l);
    }
}

// ─── Server-initiated sounds ──────────────────────────────────────────────────

onNet(NET_PLAY, (
    soundId: number,
    soundFile: string,
    x: number, y: number, z: number,
    range: number, volume: number, loop: boolean,
    dimension: number,
    entityNetId: number,
) => {
    dispatchPlay(soundId, soundFile, x, y, z, range, volume, loop, dimension, entityNetId);
});

onNet(NET_STOP, (soundId: number) => {
    log(`server stop #${soundId}`);
    stopSound(soundId);
});

// ─── NUI handshake ────────────────────────────────────────────────────────────
// The NUI frame mounts after this script runs, so the config cannot be
// fire-and-forget: SendNuiMessage before the frame exists is silently dropped.
// The NUI asks for its config on mount instead, and we answer here. This also
// makes a resource restart safe.

RegisterNuiCallbackType(NUI_READY);
on(`__cfx_nui:${NUI_READY}`, (_data: unknown, cb: (payload: unknown) => void) => {
    cb({});
    SendNuiMessage(JSON.stringify({ type: NUI_MSG.config, config: toNuiConfig(cfg) }));
    log('NUI ready — config sent');
});

// ─── NUI ended callback ───────────────────────────────────────────────────────

RegisterNuiCallbackType(NUI_ENDED);
on(`__cfx_nui:${NUI_ENDED}`, (data: { soundId?: number } | null, cb: () => void) => {
    cb();
    if (!data || data.soundId === undefined) return;
    log(`NUI ended #${data.soundId}`);
    deactivateSound(data.soundId);
    stopEntityTracking(data.soundId);
    soundDimensions.delete(data.soundId);

    if (data.soundId < 0) {
        // Client-local sound ended — notify local event consumers
        emit(LOCAL_ENDED, data.soundId);
    } else {
        // Server-initiated sound ended — notify server to remove from soundRegistry.
        // Without this the server leaks one-shot sound entries and may try to
        // re-send completed sounds to players who change routing buckets.
        emitNet(NET_CLIENT_ENDED, data.soundId);
    }
});

// ─── Client exports ───────────────────────────────────────────────────────────

/**
 * Call this whenever the local player's routing bucket changes.
 * This is the only thing 3d-audio needs from the surrounding gamemode — there is
 * no client-side FiveM native to read the routing bucket directly.
 */
exp('setDimension', (dim: number): void => {
    onDimensionChange(dim);
});

/**
 * Play a client-local 3D sound. The caller allocates soundId (must be negative;
 * positive IDs belong to the server's namespace).
 */
exp('play3d', (
    soundId: number,
    soundFile: string,
    x: number, y: number, z: number,
    range: number, volume: number, loop: boolean,
    dimension: number = cfg.defaults.dimension,
    entityNetId: number = 0,
): void => {
    dispatchPlay(soundId, soundFile, x, y, z, range, volume, loop, dimension, entityNetId);
});

/** Stop a client-local sound. */
exp('stop', (soundId: number): void => {
    log(`stop #${soundId}`);
    stopSound(soundId);
});

console.log(`[3d-audio] Client loaded (debug=${cfg.debug}, tick=${TICK_MS}ms)`);
