import { Redis } from 'ioredis';
import { ServerError } from 'livekit-server-sdk';
import { config } from './config.js';
import { roomName, roomService } from './livekit.js';

/**
 * Close a session's video room the moment its quiz ends.
 *
 * ws-server publishes every session event to `session:<id>` for its own
 * instances (see broadcastTosession.ts); listening there means ending a quiz
 * needs no change to ws-server and does not depend on the host's browser
 * staying open. Rooms that are never ended this way, such as a session the
 * admin panel cancels, close on LiveKit's empty timeout instead.
 */
export function startRoomCloser() {
    const sub = new Redis({
        ...config.redis,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        autoResubscribe: true,
    });

    sub.on('error', (e) => console.error('[streaming] Redis sub error:', e));

    sub.psubscribe('session:*', (err) => {
        if (err) console.error('[streaming] psubscribe failed', err);
    });

    sub.on('pmessage', (_pattern: string, channel: string, raw: string) => {
        // Every timer tick of every live quiz arrives here; skip the parse
        // for anything that cannot be the end of a quiz.
        if (!raw.includes('"quiz:ended"')) return;

        let type: unknown;
        try {
            type = JSON.parse(raw).type;
        } catch {
            return;
        }
        if (type !== 'quiz:ended') return;

        const sessionId = channel.slice('session:'.length);

        roomService.deleteRoom(roomName(sessionId)).catch((err) => {
            // No room: the session never had video, or nobody joined it.
            if (err instanceof ServerError && err.status === 404) return;
            console.error('[streaming] could not close room', sessionId, err);
        });
    });

    return sub;
}
