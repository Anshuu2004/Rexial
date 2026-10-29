import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@repo/db", () => ({ prisma: { quiz: { findUnique } } }));

import { joinQuizController } from "./sessionController";

const run = async (body: unknown) => {
    const req = { body } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    await joinQuizController(req, res);
    return res;
};

describe("joinQuizController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ["an empty body", {}],
        ["no username", { code: "ABC123" }],
        ["no code", { username: "ada" }],
        ["an empty username", { code: "ABC123", username: "" }],
    ])("answers 400 with { success, error } for %s and never reads the quiz", async (_label, body) => {
        const res = await run(body);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: "Code and username are required" });
        expect(findUnique).not.toHaveBeenCalled();
    });

    it("answers 404 in the same shape when the quiz does not exist", async () => {
        findUnique.mockResolvedValue(null);
        const res = await run({ code: "NOPE00", username: "ada" });

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: "Quiz not found" });
    });
});
