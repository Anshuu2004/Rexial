import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { findUnique, create, hash } = vi.hoisted(() => ({
    findUnique: vi.fn(),
    create: vi.fn(),
    hash: vi.fn(),
}));

vi.mock("@repo/db", () => ({ prisma: { user: { findUnique, create } } }));
vi.mock("bcrypt", () => ({ default: { hash, compare: vi.fn() } }));

import { userRegisterController } from "./authController";

const run = async (body: unknown) => {
    const req = { body } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    await userRegisterController(req, res);
    return res;
};

const valid = { name: "Ada", email: "ada@example.com", password: "secret12" };

describe("userRegisterController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hash.mockResolvedValue("hashed");
        findUnique.mockResolvedValue(null);
        create.mockResolvedValue({ id: "user-1", name: "Ada", email: "ada@example.com" });
    });

    it.each([
        ["no password", { name: "Ada", email: "ada@example.com" }, "password is required"],
        ["an empty password", { ...valid, password: "" }, "password is required"],
        ["a blank name", { ...valid, name: "   " }, "name is required"],
        ["a numeric password", { ...valid, password: 12345678 }, "password must be a string"],
        ["no body at all", undefined, "name, email and password are required"],
    ])("answers 400 for %s and never reaches the database or bcrypt", async (_label, body, message) => {
        const res = await run(body);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: message });
        expect(findUnique).not.toHaveBeenCalled();
        expect(hash).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("still registers a valid user with a 201 and a token", async () => {
        const res = await run(valid);

        expect(hash).toHaveBeenCalledWith("secret12", 10);
        expect(create).toHaveBeenCalledWith({ data: { name: "Ada", password: "hashed", email: "ada@example.com" } });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("still answers 400 for an email that is already registered", async () => {
        findUnique.mockResolvedValue({ id: "user-1" });
        const res = await run(valid);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: "Email is already existed.." });
        expect(create).not.toHaveBeenCalled();
    });
});
