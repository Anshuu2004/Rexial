import WebSocket from "ws";
import jwt from "jsonwebtoken";
import { prisma } from "@repo/db";
import type { Client } from "../index.js";

/**
 * Who may run a quiz.
 *
 * A socket used to be an organizer simply because its first message said
 * `role: 'ORGANIZER'`, so any participant could start, skip or end someone
 * else's quiz. The role is now decided on the server: the join message must
 * carry the host's login token, and the user in it must be an accepted
 * organizer of the quiz that this session belongs to.
 */

/**
 * Read the user id out of a login token, or null when the token is missing,
 * expired or was not signed with our secret.
 *
 * The secret and the fallback match http-server on purpose, because that is
 * the service that issues the token.
 */
export function getUserIdFromToken(token: unknown): string | null {
    if (typeof token !== "string" || token === "") return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret", {
            algorithms: ["HS256"],
        });

        if (typeof decoded === "object" && decoded !== null) {
            const userId = (decoded as { userId?: unknown }).userId;
            if (typeof userId === "string" && userId !== "") return userId;
        }
    } catch {
        // Expired, malformed or signed with another secret.
    }

    return null;
}

/** True when the user is an accepted organizer of the quiz behind this session. */
export async function isSessionOrganizer(userId: string, sessionId: string): Promise<boolean> {
    const organizer = await prisma.quizOrganizer.findFirst({
        where: {
            userId,
            inviteStatus: "ACCEPTED",
            quiz: { quizSessions: { some: { id: sessionId } } },
        },
        select: { id: true },
    });

    return organizer !== null;
}

/** Tell one client why its message was refused. */
export function sendError(client: Client, code: string, message: string) {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    client.ws.send(JSON.stringify({ type: "error", payload: { code, message } }));
}

/**
 * Check that a socket may control its quiz and return the session it belongs to.
 *
 * The session comes from the join the server already verified, never from the
 * message, so a host cannot be tricked into acting on another quiz and nobody
 * can name a session they did not join. Returns null (after telling the
 * client) when the action is not allowed.
 */
export function authorizeOrganizerAction(client: Client, payload: any): string | null {
    if (client.role !== "ORGANIZER" || !client.sessionId) {
        sendError(client, "NOT_ORGANIZER", "Only the quiz organizer can do this.");
        return null;
    }

    if (payload?.sessionId && payload.sessionId !== client.sessionId) {
        sendError(client, "SESSION_MISMATCH", "This message is for a different session.");
        return null;
    }

    return client.sessionId;
}
