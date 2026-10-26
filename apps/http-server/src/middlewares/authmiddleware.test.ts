import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { authMiddleware } from "./authmiddleware";

const SECRET = "test-secret";

// Just enough of a request and response for the middleware to run on.
const run = async (authorization?: string) => {
    const req = { headers: authorization ? { authorization } : {} } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await authMiddleware(req, res, next);

    return { req, res, next };
};

describe("authMiddleware", () => {
    beforeEach(() => {
        vi.stubEnv("JWT_SECRET", SECRET);
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("lets a valid token through and sets req.userId", async () => {
        const token = jwt.sign({ userId: "user-1" }, SECRET);
        const { req, res, next } = await run(`Bearer ${token}`);

        expect(next).toHaveBeenCalledOnce();
        expect(req.userId).toBe("user-1");
        expect(res.status).not.toHaveBeenCalled();
    });

    it("answers 401 for an expired token", async () => {
        const token = jwt.sign({ userId: "user-1" }, SECRET, { expiresIn: -10 });
        const { res, next } = await run(`Bearer ${token}`);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    it("answers 401 for a garbage token", async () => {
        const { res, next } = await run("Bearer not-a-real-token");

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    it("answers 401 for a token signed with another secret", async () => {
        const token = jwt.sign({ userId: "user-1" }, "some-other-secret");
        const { res, next } = await run(`Bearer ${token}`);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("answers 401 when the payload has no userId", async () => {
        const token = jwt.sign({ foo: "bar" }, SECRET);
        const { res, next } = await run(`Bearer ${token}`);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("keeps answering 500 for errors that are not token problems", async () => {
        vi.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("something broke");
        });
        const { res, next } = await run("Bearer anything");

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    });
});
