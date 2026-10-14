/**
 * 3d-audio — Server
 *
 * Server-side exports callable by any resource:
 *
 *   exports['3d-audio']['play3d'](
 *     target,             // player server-id, or -1 for all clients
 *     soundFile,          // path relative to soundPath (default assets/sounds)
 *     x, y, z,            // world position
 *     range,              // max audible distance in metres
 *     volume,             // 0.0 – 1.0
 *     loop,               // whether to loop the sound
 *     loopDurationSeconds,// auto-stop after N seconds when loop=true (0 = forever)
 *     dimension,          // routing bucket filter; -1 = all buckets (default)
 *     entityNetId,        // if > 0 the client tracks this entity's position;
 *                         // sound pauses when entity leaves streaming range and
 *                         // resumes when it re-enters
 *   ): soundId
 *
 *   exports['3d-audio']['stop'](target, soundId): void
 *
 * Sound IDs returned here are always POSITIVE. Negative IDs are the client-local
 * namespace and are allocated by the caller — see src/client/index.ts.
 *
 * BIDIRECTIONAL DIMENSION HANDLING
 *   The server keeps a registry of every active sound. When a client reports a
 *   routing-bucket change via '3d-audio:bucket-changed' (which it learns about
 *   through the setDimension client export — FiveM has no client-side native for
 *   it), the server re-sends every dimension-specific sound that targets the new
 *   bucket to that player. So a sound is heard both by players already in the
 *   dimension when it starts AND by players who enter the dimension later.
 */

import { loadAudioConfig, makeLogger } from '../shared/config';
import { NET_PLAY, NET_STOP, NET_BUCKET_CHANGED, NET_CLIENT_ENDED } from '../shared/events';

const cfg = loadAudioConfig();
const { log, warn } = makeLogger(cfg);

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
const soundRegistry = new Map<number, ActiveSound>();

// ─── Argument normalisation ───────────────────────────────────────────────────
// Config supplies defaults only where a caller passed nothing usable, and limits
// that can only ever make a sound quieter or shorter-ranged. An explicit,
// in-range argument always survives untouched.

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
    dimension: number = cfg.defaults.dimension,
    entityNetId: number = 0,
): number => {
    const soundId = nextId++;

    const r = normRange(range);
    const v = normVolume(volume);
    const l = normLoop(loop);
    const dim = normDimension(dimension);

    soundRegistry.set(soundId, { target, soundFile, x, y, z, range: r, volume: v, loop: l, dimension: dim, entityNetId });
    emitNet(NET_PLAY, target, soundId, soundFile, x, y, z, r, v, l, dim, entityNetId);

    log(`play3d #${soundId} "${soundFile}" target=${target} dim=${dim} entity=${entityNetId} range=${r} vol=${v} loop=${l}`);

    if (l && loopDurationSeconds > 0) {
        loopTimeouts.set(soundId, setTimeout(() => {
            soundRegistry.delete(soundId);
            emitNet(NET_STOP, target, soundId);
            loopTimeouts.delete(soundId);
            log(`loop #${soundId} auto-stopped after ${loopDurationSeconds}s`);
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

    log(`stop #${soundId} target=${target}`);
    emitNet(NET_STOP, target, soundId);
});

// ─── Dimension re-sync ────────────────────────────────────────────────────────
// Fired by the client whenever setDimension() reports a routing-bucket change.
// We send every active, dimension-specific sound that targets this player so
// they hear sounds that started while they were in a different bucket.
// Sounds with dimension = -1 are excluded here — they were already broadcast
// to all clients when they started and are never stopped by dimension changes.

onNet(NET_BUCKET_CHANGED, (newBucket: number) => {
    const src = parseInt(String(source));

    // Opt-in hardening: the claimed bucket is otherwise fully client-trusted.
    // Off by default to preserve legacy behaviour — see docs/limitations.md.
    if (cfg.security.verifyRoutingBucket) {
        const actual = GetPlayerRoutingBucket(String(src));
        if (actual !== newBucket) {
            warn(`player ${src} claimed bucket ${newBucket} but is in ${actual} — ignoring`);
            return;
        }
    }

    let resent = 0;
    soundRegistry.forEach((sound: ActiveSound, soundId: number) => {
        if (sound.dimension === -1) return;                      // not dimension-gated
        if (sound.dimension !== newBucket) return;               // wrong bucket
        if (sound.target !== -1 && sound.target !== src) return;  // not for this player

        emitNet(NET_PLAY, src, soundId,
            sound.soundFile, sound.x, sound.y, sound.z,
            sound.range, sound.volume, sound.loop,
            sound.dimension, sound.entityNetId,
        );
        resent++;
    });

    log(`player ${src} entered bucket ${newBucket} — re-sent ${resent} sound(s)`);
});

// ─── One-shot sound cleanup ───────────────────────────────────────────────────
// Loop sounds with loopDurationSeconds > 0 are cleaned up via loopTimeouts.
// Manual stop() calls clean up via the stop export.
// One-shot (non-looping, no timeout) sounds must be cleaned up by the client
// when Howler's onend fires — otherwise the soundRegistry leaks entries and
// bucket-changed events would try to re-send completed sounds.

onNet(NET_CLIENT_ENDED, (soundId: number) => {
    if (soundRegistry.delete(soundId)) {
        // Belt-and-suspenders: clear any stale timeout (shouldn't exist for one-shots)
        const timeout = loopTimeouts.get(soundId);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            loopTimeouts.delete(soundId);
        }
        log(`registry entry #${soundId} removed (client reported ended)`);
    }
});

// ─── Player cleanup ───────────────────────────────────────────────────────────

on('playerDropped', () => {
    // Nothing to clean up server-side; soundRegistry entries are resource-level,
    // not player-level.  NUI and client state are destroyed with the player context.
});

console.log(`[3d-audio] Server loaded (debug=${cfg.debug}, verifyRoutingBucket=${cfg.security.verifyRoutingBucket})`);
