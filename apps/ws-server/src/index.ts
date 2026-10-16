import { configDotenv } from 'dotenv';
configDotenv();
import WebSocket, { WebSocketServer } from 'ws';

import { clients, unindexClient } from './clients/index.js';
import { handleMessage } from './utils/handleMessages.js';
import { startSessionSubscriber } from './utils/broadcastTosession.js';
import { invalidateParticipants } from './utils/cache.js';
import { drainAll } from './utils/answerQueue.js';




const wss = new WebSocketServer({ port: 8080 });



export interface Client {
    ws: WebSocket;
    sessionId: string;
    role: 'ORGANIZER' | 'PARTICIPANT';
    participantId?: string;
    userId?: string;
    isAlive: boolean;
}

// A dropped connection (NAT timeout, closed laptop, proxy cutting an idle
// socket) often never fires 'close', so the client would linger in `clients`
// forever and keep inflating participant counts. Ping every 30s and drop
// anything that has not ponged since the previous round.
const HEARTBEAT_INTERVAL_MS = 30_000;

const heartbeat = setInterval(() => {
    for (const client of clients) {
        if (!client.isAlive) {
            client.ws.terminate();   // fires 'close' -> normal cleanup path
            continue;
        }

        client.isAlive = false;
        client.ws.ping();
    }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));


/**
 * Write buffered answers before the process goes away.
 *
 * Answers are batched in memory for a fraction of a second before they are
 * written, so a deploy or restart landing in that window would drop whatever
 * was waiting — during a live question, that is real answers from real
 * people. Docker sends SIGTERM and waits ten seconds before killing, which is
 * ample for a flush.
 */
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, async () => {
        if (shuttingDown) return;
        shuttingDown = true;

        console.log(`[shutdown] ${signal} received, flushing buffered answers`);
        clearInterval(heartbeat);

        try {
            await drainAll();
            console.log('[shutdown] answers flushed');
        } catch (err) {
            console.error('[shutdown] flush failed', err);
        }

        wss.close(() => process.exit(0));
        // Do not hang on a socket that will not close.
        setTimeout(() => process.exit(0), 5_000).unref();
    });
}


startSessionSubscriber();

wss.on('connection', (ws: WebSocket) => {


    const client: Client = {
        ws,
        sessionId: '',
        role: 'PARTICIPANT',
        isAlive: true
    };
    clients.add(client);

    // Browsers answer a protocol-level ping automatically, so this needs no
    // client-side support.
    ws.on('pong', () => {
        client.isAlive = true;
    });


    ws.on('message', async (message) => {
        try {
            const parsedMessage = message.toString();

            console.log("Raw Message", parsedMessage)

            const data = JSON.parse(parsedMessage);

            await handleMessage(client, data);


        } catch (error) {
            console.log('WS Error', error)
        }
    });

    ws.on('close', async () => {

        console.log('Client disconnected...', client.participantId ?? 'unknown participant');
        clients.delete(client);
        unindexClient(client);

        if (client.sessionId && client.role === 'PARTICIPANT') {
            await invalidateParticipants(client.sessionId);
        }

    })
})









