import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import WebSocket from "ws";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@repo/db", () => ({
    prisma: { quizOrganizer: { findFirst } },
}));

import {
    authorizeOrganizerAction,
    getUserIdFromToken,
    isSessionOrganizer,
    sendError,
} from "./organizerAuth.js";
import type { Client } from "../index.js";

const SECRET = "test-secret";

function makeClient(overrides: Partial<Client> = {}): Client {
    return {
        ws: { readyState: WebSocket.OPEN, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket,
        sessionId: "",
        role: "PARTICIPANT",
        isAlive: true,
        ...overrides,
    };
}

function sent(client: Client) {
    return (client.ws.send as ReturnType<typeof vi.fn>).mock.calls.map(([raw]) => JSON.parse(raw));
}

beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    findFirst.mockReset();
});

describe("getUserIdFromToken", () => {
    it("returns the user id from a token signed with the shared secret", () => {
        const token = jwt.sign({ userId: "user-1" }, SECRET);
        expect(getUserIdFromToken(token)).toBe("user-1");
    });

    it.each([undefined, null, "", 42, {}, [], "not-a-jwt"])("rejects %j", (value) => {
        expect(getUserIdFromToken(value)).toBeNull();
    });

    it("rejects a token signed with another secret", () => {
        expect(getUserIdFromToken(jwt.sign({ userId: "user-1" }, "other"))).toBeNull();
    });

    it("rejects an expired token", () => {
        const token = jwt.sign({ userId: "user-1" }, SECRET, { expiresIn: -10 });
        expect(getUserIdFromToken(token)).toBeNull();
    });

    it("rejects an unsigned token", () => {
        const token = jwt.sign({ userId: "user-1" }, "", { algorithm: "none" });
        expect(getUserIdFromToken(token)).toBeNull();
    });

    it("rejects a token that has no usable userId", () => {
        expect(getUserIdFromToken(jwt.sign({}, SECRET))).toBeNull();
        expect(getUserIdFromToken(jwt.sign({ userId: 7 }, SECRET))).toBeNull();
        expect(getUserIdFromToken(jwt.sign({ userId: "" }, SECRET))).toBeNull();
    });

    it("falls back to the same default secret as http-server", () => {
        delete process.env.JWT_SECRET;
        expect(getUserIdFromToken(jwt.sign({ userId: "user-1" }, "secret"))).toBe("user-1");
    });
});

describe("isSessionOrganizer", () => {
    it("is true when an accepted organizer row exists for the session's quiz", async () => {
        findFirst.mockResolvedValue({ id: "org-1" });

        await expect(isSessionOrganizer("user-1", "session-1")).resolves.toBe(true);
        expect(findFirst).toHaveBeenCalledWith({
            where: {
                userId: "user-1",
                inviteStatus: "ACCEPTED",
                quiz: { quizSessions: { some: { id: "session-1" } } },
            },
            select: { id: true },
        });
    });

    it("is false when there is no such row", async () => {
        findFirst.mockResolvedValue(null);
        await expect(isSessionOrganizer("user-1", "session-1")).resolves.toBe(false);
    });
});

describe("sendError", () => {
    it("sends an error message to an open socket", () => {
        const client = makeClient();
        sendError(client, "NOPE", "Not allowed");
        expect(sent(client)).toEqual([{ type: "error", payload: { code: "NOPE", message: "Not allowed" } }]);
    });

    it("does nothing on a socket that is not open", () => {
        const client = makeClient();
        (client.ws as { readyState: number }).readyState = WebSocket.CLOSED;
        sendError(client, "NOPE", "Not allowed");
        expect(client.ws.send).not.toHaveBeenCalled();
    });
});

describe("authorizeOrganizerAction", () => {
    it("returns the joined session for a verified organizer", () => {
        const client = makeClient({ role: "ORGANIZER", sessionId: "session-1" });
        expect(authorizeOrganizerAction(client, { sessionId: "session-1" })).toBe("session-1");
        expect(authorizeOrganizerAction(client, {})).toBe("session-1");
        expect(authorizeOrganizerAction(client, undefined)).toBe("session-1");
        expect(client.ws.send).not.toHaveBeenCalled();
    });

    it("refuses a participant", () => {
        const client = makeClient({ role: "PARTICIPANT", sessionId: "session-1" });
        expect(authorizeOrganizerAction(client, { sessionId: "session-1" })).toBeNull();
        expect(sent(client)[0].payload.code).toBe("NOT_ORGANIZER");
    });

    it("refuses an organizer that has not joined a session", () => {
        const client = makeClient({ role: "ORGANIZER", sessionId: "" });
        expect(authorizeOrganizerAction(client, { sessionId: "session-1" })).toBeNull();
        expect(sent(client)[0].payload.code).toBe("NOT_ORGANIZER");
    });

    it("refuses a message that names another session", () => {
        const client = makeClient({ role: "ORGANIZER", sessionId: "session-1" });
        expect(authorizeOrganizerAction(client, { sessionId: "session-2" })).toBeNull();
        expect(sent(client)[0].payload.code).toBe("SESSION_MISMATCH");
    });
});
