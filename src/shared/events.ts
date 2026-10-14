/**
 * 3d-audio — Event and NUI message names
 *
 * Centralised so a future resource rename is a one-line change here instead of a
 * grep across three files. Note these names are part of the wire protocol:
 * changing EVENT_PREFIX breaks any consumer that listens for `3d-audio:ended`.
 *
 * Consumers should depend on the exports, not on these events.
 */

export const EVENT_PREFIX = '3d-audio';

/** Server → client: start a sound. */
export const NET_PLAY = `${EVENT_PREFIX}:play`;
/** Server → client: stop a sound. */
export const NET_STOP = `${EVENT_PREFIX}:stop`;
/** Client → server: the local routing bucket changed; replay sounds for it. */
export const NET_BUCKET_CHANGED = `${EVENT_PREFIX}:bucket-changed`;
/** Client → server: a server-initiated one-shot finished; drop its registry entry. */
export const NET_CLIENT_ENDED = `${EVENT_PREFIX}:client-ended`;

/** Client-local event emitted when a client-local (negative id) sound finishes. */
export const LOCAL_ENDED = `${EVENT_PREFIX}:ended`;

/** NUI → client callback names. */
export const NUI_ENDED = `${EVENT_PREFIX}:ended`;
export const NUI_READY = `${EVENT_PREFIX}:nui-ready`;

/** Client → NUI message types. */
export const NUI_MSG = {
    play: `${EVENT_PREFIX}:play`,
    stop: `${EVENT_PREFIX}:stop`,
    updatePos: `${EVENT_PREFIX}:update-pos`,
    listener: `${EVENT_PREFIX}:listener`,
    config: `${EVENT_PREFIX}:config`,
} as const;
