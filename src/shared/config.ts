/**
 * 3d-audio — Configuration
 *
 * Every default in DEFAULT_CONFIG reproduces the value that used to be hardcoded,
 * so deleting config.json leaves behaviour unchanged.
 *
 * Config supplies DEFAULTS and LIMITS only. It never changes an export signature:
 * a caller that passes an explicit range/volume gets exactly that value (subject
 * only to the limit clamp).
 *
 * NOTE: web/src/config.ts holds a copy of the NUI-relevant defaults. The NUI is a
 * separate tsconfig/module graph and cannot import from here — keep the two in sync.
 */

export type PanningModel = 'HRTF' | 'equalpower';
export type DistanceModel = 'linear' | 'inverse' | 'exponential';

export interface AudioConfig {
    /** Gates all informational logging in server, client and NUI. Warnings are never gated. */
    debug: boolean;
    /** Listener- and entity-tracking tick interval in ms. 50 = 20 Hz. */
    tickIntervalMs: number;
    /** Resource-relative directory the NUI resolves `soundFile` against. */
    soundPath: string;
    defaults: {
        /** Used when a caller passes a non-finite or non-positive range. */
        range: number;
        /** Used when a caller passes a non-finite volume. */
        volume: number;
        /** Used when a caller passes a non-finite loop flag. */
        loop: boolean;
        /** Used when a caller omits dimension. -1 = audible in every routing bucket. */
        dimension: number;
    };
    limits: {
        /** Hard ceiling on volume. Can only make sounds quieter, never louder. */
        maxVolume: number;
        /** Hard ceiling on range (PannerNode maxDistance). */
        maxRange: number;
        /** Soft cap — plays beyond this are refused with a warning, nothing is evicted. */
        maxConcurrentSounds: number;
    };
    /** Web Audio PannerNode attenuation curve, applied in the NUI. */
    panner: {
        panningModel: PanningModel;
        distanceModel: DistanceModel;
        refDistance: number;
        rolloffFactor: number;
    };
    security: {
        /**
         * Verify a client's claimed routing bucket against GetPlayerRoutingBucket()
         * before replaying dimension-gated sounds to it.
         * Defaults to false to preserve legacy behaviour — see docs/limitations.md.
         */
        verifyRoutingBucket: boolean;
    };
}

/** The subset the NUI needs. This is the exact payload of the `3d-audio:config` NUI message. */
export interface NuiConfig {
    debug: boolean;
    soundPath: string;
    panner: AudioConfig['panner'];
    maxVolume: number;
    maxRange: number;
    maxConcurrentSounds: number;
}

export const DEFAULT_CONFIG: AudioConfig = {
    debug: false,
    tickIntervalMs: 50,
    soundPath: 'assets/sounds',
    defaults: {
        range: 50,
        volume: 1.0,
        loop: false,
        dimension: -1,
    },
    limits: {
        maxVolume: 1.0,
        maxRange: 1000,
        maxConcurrentSounds: 64,
    },
    panner: {
        panningModel: 'HRTF',
        distanceModel: 'linear',
        refDistance: 1,
        rolloffFactor: 1,
    },
    security: {
        verifyRoutingBucket: false,
    },
};

export function toNuiConfig(cfg: AudioConfig): NuiConfig {
    return {
        debug: cfg.debug,
        soundPath: cfg.soundPath,
        panner: cfg.panner,
        maxVolume: cfg.limits.maxVolume,
        maxRange: cfg.limits.maxRange,
        maxConcurrentSounds: cfg.limits.maxConcurrentSounds,
    };
}

export interface MergeResult {
    config: AudioConfig;
    warnings: string[];
}

const PANNING_MODELS: PanningModel[] = ['HRTF', 'equalpower'];
const DISTANCE_MODELS: DistanceModel[] = ['linear', 'inverse', 'exponential'];

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate one value against a default, clamping numbers into range rather than
 * rejecting them. Never throws; every rejection appends a warning naming the
 * dotted path so an operator can find the offending key.
 */
function pickBool(raw: Record<string, unknown>, key: string, path: string, fallback: boolean, warnings: string[]): boolean {
    const v = raw[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'boolean') {
        warnings.push(`${path} must be a boolean, got ${typeof v} — using ${fallback}`);
        return fallback;
    }
    return v;
}

function pickNumber(
    raw: Record<string, unknown>, key: string, path: string,
    fallback: number, min: number, max: number, warnings: string[],
): number {
    const v = raw[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        warnings.push(`${path} must be a finite number, got ${typeof v} — using ${fallback}`);
        return fallback;
    }
    if (v < min || v > max) {
        const clamped = Math.min(Math.max(v, min), max);
        warnings.push(`${path} = ${v} is outside [${min}, ${max}] — clamped to ${clamped}`);
        return clamped;
    }
    return v;
}

function pickEnum<T extends string>(
    raw: Record<string, unknown>, key: string, path: string,
    fallback: T, allowed: T[], warnings: string[],
): T {
    const v = raw[key];
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !allowed.includes(v as T)) {
        warnings.push(`${path} must be one of ${allowed.join(' | ')}, got ${JSON.stringify(v)} — using ${fallback}`);
        return fallback;
    }
    return v as T;
}

function pickSoundPath(raw: Record<string, unknown>, fallback: string, warnings: string[]): string {
    const v = raw['soundPath'];
    if (v === undefined) return fallback;
    if (typeof v !== 'string') {
        warnings.push(`soundPath must be a string, got ${typeof v} — using "${fallback}"`);
        return fallback;
    }
    const trimmed = v.trim().replace(/^\/+|\/+$/g, '');
    if (trimmed === '' || trimmed.includes('..') || /^[a-zA-Z]:/.test(trimmed)) {
        warnings.push(`soundPath "${v}" must be a relative path inside the resource — using "${fallback}"`);
        return fallback;
    }
    return trimmed;
}

function section(raw: Record<string, unknown>, key: string, path: string, warnings: string[]): Record<string, unknown> {
    const v = raw[key];
    if (v === undefined) return {};
    if (!isRecord(v)) {
        warnings.push(`${path} must be an object, got ${Array.isArray(v) ? 'array' : typeof v} — using defaults`);
        return {};
    }
    return v;
}

/**
 * Deep-merge an arbitrary parsed value over DEFAULT_CONFIG.
 * Missing, partial and malformed input all degrade to defaults key by key.
 */
export function mergeConfig(raw: unknown): MergeResult {
    const warnings: string[] = [];
    const d = DEFAULT_CONFIG;

    if (!isRecord(raw)) {
        return {
            config: d,
            warnings: ['config.json must contain a JSON object — using built-in defaults'],
        };
    }

    const defaultsRaw = section(raw, 'defaults', 'defaults', warnings);
    const limitsRaw = section(raw, 'limits', 'limits', warnings);
    const pannerRaw = section(raw, 'panner', 'panner', warnings);
    const securityRaw = section(raw, 'security', 'security', warnings);

    const config: AudioConfig = {
        debug: pickBool(raw, 'debug', 'debug', d.debug, warnings),
        tickIntervalMs: pickNumber(raw, 'tickIntervalMs', 'tickIntervalMs', d.tickIntervalMs, 10, 1000, warnings),
        soundPath: pickSoundPath(raw, d.soundPath, warnings),
        defaults: {
            range: pickNumber(defaultsRaw, 'range', 'defaults.range', d.defaults.range, 0.1, 10000, warnings),
            volume: pickNumber(defaultsRaw, 'volume', 'defaults.volume', d.defaults.volume, 0, 1, warnings),
            loop: pickBool(defaultsRaw, 'loop', 'defaults.loop', d.defaults.loop, warnings),
            dimension: pickNumber(defaultsRaw, 'dimension', 'defaults.dimension', d.defaults.dimension, -1, 65535, warnings),
        },
        limits: {
            maxVolume: pickNumber(limitsRaw, 'maxVolume', 'limits.maxVolume', d.limits.maxVolume, 0, 1, warnings),
            maxRange: pickNumber(limitsRaw, 'maxRange', 'limits.maxRange', d.limits.maxRange, 1, 10000, warnings),
            maxConcurrentSounds: pickNumber(
                limitsRaw, 'maxConcurrentSounds', 'limits.maxConcurrentSounds',
                d.limits.maxConcurrentSounds, 1, 512, warnings,
            ),
        },
        panner: {
            panningModel: pickEnum(pannerRaw, 'panningModel', 'panner.panningModel', d.panner.panningModel, PANNING_MODELS, warnings),
            distanceModel: pickEnum(pannerRaw, 'distanceModel', 'panner.distanceModel', d.panner.distanceModel, DISTANCE_MODELS, warnings),
            refDistance: pickNumber(pannerRaw, 'refDistance', 'panner.refDistance', d.panner.refDistance, 0.01, 1000, warnings),
            rolloffFactor: pickNumber(pannerRaw, 'rolloffFactor', 'panner.rolloffFactor', d.panner.rolloffFactor, 0, 100, warnings),
        },
        security: {
            verifyRoutingBucket: pickBool(securityRaw, 'verifyRoutingBucket', 'security.verifyRoutingBucket', d.security.verifyRoutingBucket, warnings),
        },
    };

    return { config, warnings };
}

// ─── Runtime loading ──────────────────────────────────────────────────────────

const CONFIG_FILE = 'config.json';

/**
 * Read and validate config.json. Returns built-in defaults on any failure and
 * never throws, so a broken config degrades to working defaults rather than a
 * dead resource.
 *
 * Client-side this only works because config.json is listed in the manifest's
 * files{} block — LoadResourceFile is restricted to manifest-declared files on
 * the client.
 */
export function loadAudioConfig(): AudioConfig {
    let text: string | null = null;
    try {
        text = LoadResourceFile(GetCurrentResourceName(), CONFIG_FILE);
    } catch {
        text = null;
    }

    if (!text || text.trim() === '') {
        console.log(`[3d-audio] ${CONFIG_FILE} not found or empty — using built-in defaults`);
        return DEFAULT_CONFIG;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        console.warn(`[3d-audio] ${CONFIG_FILE} is not valid JSON (${e}) — using built-in defaults`);
        return DEFAULT_CONFIG;
    }

    const { config, warnings } = mergeConfig(parsed);
    for (const w of warnings) console.warn(`[3d-audio] config: ${w}`);
    return config;
}

/** debug-gated logger. Warnings and errors deliberately bypass the gate. */
export function makeLogger(cfg: AudioConfig) {
    return {
        log: (...args: unknown[]): void => {
            if (cfg.debug) console.log('[3d-audio]', ...args);
        },
        warn: (...args: unknown[]): void => {
            console.warn('[3d-audio]', ...args);
        },
    };
}
