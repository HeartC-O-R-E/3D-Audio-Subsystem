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
 *   needs from the surrounding gamemode.  On dimension change:
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
 *   range and resumes when it re-enters.  The tracking tick runs at 20 Hz.
 */

// Use globalThis to prevent esbuild from shadowing FiveM's exports() with CommonJS exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exp = (globalThis as any).exports as (name: string, fn: (...args: any[]) => any) => void;

// ─── State ────────────────────────────────────────────────────────────────────

let listenerTick: ReturnType<typeof setTick> | null = null;
let currentDimension = 0;    // updated by setDimension(); default = main world

/** Sound IDs currently playing in the NUI */
const activeSounds    = new Set<number>();
/** soundId → routing bucket (-1 = all) */
const soundDimensions = new Map<number, number>();
/** soundId → entity-tracking tick */
const entityTracks    = new Map<number, ReturnType<typeof setTick>>();

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

    console.log(`[3d-audio] dimension ${currentDimension} → ${newDim}, stopping ${soundDimensions.size} tracked sound(s)`);

    soundDimensions.forEach((soundDim, soundId) => {
        if (soundDim !== -1) {
            if (activeSounds.has(soundId)) {
                deactivateSound(soundId);
                SendNuiMessage(JSON.stringify({ type: '3d-audio:stop', soundId }));
            }
            stopEntityTracking(soundId);
            soundDimensions.delete(soundId);
        }
    });

    currentDimension = newDim;
    emitNet('3d-audio:bucket-changed', newDim);
}

// ─── Listener tick (20 Hz) ────────────────────────────────────────────────────

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
            type: '3d-audio:listener',
            px, py, pz, rx, ry, rz,
        }));

        await new Promise<void>(resolve => setTimeout(resolve, 50)); // 20 Hz
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

    console.log(`[3d-audio] entity-track start #${soundId} entity=${entityNetId} file="${soundFile}"`);

    let soundActive = false;

    const tick = setTick(async () => {
        const entity = NetworkGetEntityFromNetworkId(entityNetId);

        if (!DoesEntityExist(entity)) {
            if (soundActive) {
                soundActive = false;
                deactivateSound(soundId);
                SendNuiMessage(JSON.stringify({ type: '3d-audio:stop', soundId }));
                console.log(`[3d-audio] entity-track #${soundId}: entity left streaming range → paused`);
            }
            await new Promise<void>(resolve => setTimeout(resolve, 50)); // 20 Hz — no need to hammer at 60 FPS while entity is gone
            return;
        }

        const [x, y, z] = GetEntityCoords(entity, false);

        if (!soundActive) {
            soundActive = true;
            activateSound(soundId);
            SendNuiMessage(JSON.stringify({
                type: '3d-audio:play',
                soundId, soundFile, x, y, z, range, volume, loop,
            }));
            console.log(`[3d-audio] entity-track #${soundId}: entity in range → playing @ (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        } else {
            SendNuiMessage(JSON.stringify({ type: '3d-audio:update-pos', soundId, x, y, z }));
        }

        await new Promise<void>(resolve => setTimeout(resolve, 50)); // 20 Hz — 60 FPS is excessive for position updates
    });

    entityTracks.set(soundId, tick);
    ensureListenerTick();
}

function stopEntityTracking(soundId: number): void {
    const tick = entityTracks.get(soundId);
    if (tick !== undefined) {
        clearTick(tick);
        entityTracks.delete(soundId);
        console.log(`[3d-audio] entity-track stopped #${soundId}`);
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
        type: '3d-audio:play',
        soundId, soundFile, x, y, z, range, volume, loop,
    }));
}

function stopSound(soundId: number): void {
    deactivateSound(soundId);
    stopEntityTracking(soundId);
    soundDimensions.delete(soundId);
    SendNuiMessage(JSON.stringify({ type: '3d-audio:stop', soundId }));
}

// ─── Server-initiated sounds ──────────────────────────────────────────────────

onNet('3d-audio:play', (
    soundId: number,
    soundFile: string,
    x: number, y: number, z: number,
    range: number, volume: number, loop: boolean,
    dimension: number,
    entityNetId: number,
) => {
    if (dimension !== -1 && currentDimension !== dimension) {
        console.log(`[3d-audio] server play #${soundId} "${soundFile}" → skipped (dim mismatch: current=${currentDimension}, sound=${dimension})`);
        return;
    }
    soundDimensions.set(soundId, dimension);
    console.log(`[3d-audio] server play #${soundId} "${soundFile}" dim=${dimension} entity=${entityNetId}`);

    if (entityNetId > 0) {
        startEntityTracking(soundId, entityNetId, soundFile, range, volume, loop);
    } else {
        playSound(soundId, soundFile, x, y, z, range, volume, loop);
    }
});

onNet('3d-audio:stop', (soundId: number) => {
    console.log(`[3d-audio] server stop #${soundId}`);
    stopSound(soundId);
});

// ─── NUI ended callback ───────────────────────────────────────────────────────

RegisterNuiCallbackType('3d-audio:ended');
on('__cfx_nui:3d-audio:ended', (data: { soundId?: number } | null, cb: () => void) => {
    cb();
    if (!data || data.soundId === undefined) return;
    console.log(`[3d-audio] NUI ended #${data.soundId}`);
    deactivateSound(data.soundId);
    stopEntityTracking(data.soundId);
    soundDimensions.delete(data.soundId);

    if (data.soundId < 0) {
        // Client-local sound ended — notify local event consumers
        emit('3d-audio:ended', data.soundId);
    } else {
        // Server-initiated sound ended — notify server to remove from soundRegistry.
        // Without this the server leaks one-shot sound entries and may try to
        // re-send completed sounds to players who change routing buckets.
        emitNet('3d-audio:client-ended', data.soundId);
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
    dimension: number = -1,
    entityNetId: number = 0,
): void => {
    if (dimension !== -1 && currentDimension !== dimension) {
        console.log(`[3d-audio] play3d #${soundId} "${soundFile}" → skipped (dim mismatch: current=${currentDimension}, sound=${dimension})`);
        return;
    }
    soundDimensions.set(soundId, dimension);
    console.log(`[3d-audio] play3d #${soundId} "${soundFile}" dim=${dimension} entity=${entityNetId}`);

    if (entityNetId > 0) {
        startEntityTracking(soundId, entityNetId, soundFile, range, volume, loop);
    } else {
        playSound(soundId, soundFile, x, y, z, range, volume, loop);
    }
});

/** Stop a client-local sound. */
exp('stop', (soundId: number): void => {
    console.log(`[3d-audio] stop #${soundId}`);
    stopSound(soundId);
});

console.log('[3d-audio] Client loaded');
