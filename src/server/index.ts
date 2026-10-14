/**
 * hcrp-audio — Server
 *
 * Server-side exports callable by any resource:
 *
 *   exports['hcrp-audio']['play3d'](
 *     target,             // player server-id, or -1 for all clients
 *     soundFile,          // path relative to /sounds/ in the resource
 *     x, y, z,            // world position
 *     range,              // max audible distance in metres
 *     volume,             // 0.0 – 1.0
 *     loop,               // whether to loop the sound
 *     loopDurationSeconds,// auto-stop after N seconds when loop=true (0 = forever)
 *     dimension,          // routing bucket filter; -1 = all clients (default)
 *     entityNetId,        // if > 0 the client tracks this entity's position;
 *                         // sound pauses when entity leaves streaming range and
 *                         // resumes when it re-enters
 *   ): soundId
 *
 *   exports['hcrp-audio']['stop'](target, soundId): void
 *
 * Bidirectional dimension handling:
 *   The server keeps a registry of every active sound.  When a client emits
 *   'hcrp-audio:bucket-changed' (detected locally via GetInstanceId()),
 *   the server re-sends every dimension-specific sound that targets the new
 *   bucket to that player — so sounds are heard both when already in a
 *   dimension when a sound starts AND when entering a dimension later.
 */

interface ActiveSound {
    target: number;
    soundFile: string;
    x: number; y: number; z: number;
    range: number;
    volume: number;
    loop: boolean;
    dimension: number;
    entityNetId: number;
}

let nextId = 1;
const loopTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
const soundRegistry  = new Map<number, ActiveSound>();

// ─── Exports ──────────────────────────────────────────────────────────────────

exports('play3d', (
    target: number,
    soundFile: string,
    x: number,
    y: number,
    z: number,
    range: number,
    volume: number,
    loop: boolean,
    loopDurationSeconds: number = 0,
    dimension: number = -1,
    entityNetId: number = 0,
): number => {
    const soundId = nextId++;

    soundRegistry.set(soundId, { target, soundFile, x, y, z, range, volume, loop, dimension, entityNetId });
    emitNet('hcrp-audio:play', target, soundId, soundFile, x, y, z, range, volume, loop, dimension, entityNetId);

    if (loop && loopDurationSeconds > 0) {
        loopTimeouts.set(soundId, setTimeout(() => {
            soundRegistry.delete(soundId);
            emitNet('hcrp-audio:stop', target, soundId);
            loopTimeouts.delete(soundId);
        }, loopDurationSeconds * 1000));
    }

    return soundId;
});

exports('stop', (target: number, soundId: number): void => {
    soundRegistry.delete(soundId);

    const timeout = loopTimeouts.get(soundId);
    if (timeout !== undefined) {
        clearTimeout(timeout);
        loopTimeouts.delete(soundId);
    }

    emitNet('hcrp-audio:stop', target, soundId);
});

// ─── Dimension re-sync ────────────────────────────────────────────────────────
// Fired by the client whenever it detects a routing-bucket change.
// We send every active, dimension-specific sound that targets this player so
// they hear sounds that started while they were in a different bucket.
// Sounds with dimension = -1 are excluded here — they were already broadcast
// to all clients when they started and are never stopped by dimension changes.

onNet('hcrp-audio:bucket-changed', (newBucket: number) => {
    const src = parseInt(String(source));

    soundRegistry.forEach((sound: ActiveSound, soundId: number) => {
        if (sound.dimension === -1) return;               // not dimension-gated
        if (sound.dimension !== newBucket) return;        // wrong bucket
        if (sound.target !== -1 && sound.target !== src) return; // not for this player

        emitNet('hcrp-audio:play', src, soundId,
            sound.soundFile, sound.x, sound.y, sound.z,
            sound.range, sound.volume, sound.loop,
            sound.dimension, sound.entityNetId,
        );
    });
});

// ─── One-shot sound cleanup ───────────────────────────────────────────────────
// Loop sounds with loopDurationSeconds > 0 are cleaned up via loopTimeouts.
// Manual stop() calls clean up via the stop export.
// One-shot (non-looping, no timeout) sounds must be cleaned up by the client
// when Howler's onend fires — otherwise the soundRegistry leaks entries and
// bucket-changed events would try to re-send completed sounds.

onNet('hcrp-audio:client-ended', (soundId: number) => {
    if (soundRegistry.delete(soundId)) {
        // Belt-and-suspenders: clear any stale timeout (shouldn't exist for one-shots)
        const timeout = loopTimeouts.get(soundId);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            loopTimeouts.delete(soundId);
        }
    }
});

// ─── Player cleanup ───────────────────────────────────────────────────────────

on('playerDropped', () => {
    // Nothing to clean up server-side; soundRegistry entries are resource-level,
    // not player-level.  NUI and client state are destroyed with the player context.
});

console.log('[hcrp-audio] Server loaded');
