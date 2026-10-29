import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * The guard that stops a played question being edited.
 *
 * Editing replaces the answer rows, and ParticipantAnswer.answerId is
 * SET NULL on delete, so every past player would quietly lose the record of
 * which option they chose. These tests pin that behaviour down: the count is
 * taken inside the transaction, and a non-zero count has to abort the whole
 * thing rather than write anything.
 */

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    count: vi.fn(),
    questionUpdate: vi.fn(),
    answerDeleteMany: vi.fn(),
    answerCreateMany: vi.fn(),
    questionFindUnique: vi.fn(),
    queryRaw: vi.fn(),
}));

vi.mock("@repo/db", () => ({
    prisma: {
        question: { findUnique: mocks.findUnique },
        // Run the callback against a fake tx so the guard inside the
        // transaction is what the test actually exercises.
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
                $queryRaw: mocks.queryRaw,
                participantAnswer: { count: mocks.count },
                question: {
                    update: mocks.questionUpdate,
                    findUnique: mocks.questionFindUnique,
                },
                answer: {
                    deleteMany: mocks.answerDeleteMany,
                    createMany: mocks.answerCreateMany,
                },
            }),
    },
}));

const { updateQuestionController } = await import("./quizController");

const VALID_BODY = {
    text: "Capital of France?",
    timeLimit: 15,
    difficulty: "Medium",
    answers: [
        { text: "Paris", isCorrect: true },
        { text: "Rome", isCorrect: false },
    ],
};

const run = async () => {
    const req = {
        userId: "user-1",
        params: { quizId: "quiz-1", questionId: "question-1" },
        body: VALID_BODY,
    } as unknown as Request;

    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    } as unknown as Response;

    await updateQuestionController(req, res);
    return res;
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});

    // An organizer editing their own quiz: authorization is not what these
    // tests are about.
    mocks.findUnique.mockResolvedValue({
        id: "question-1",
        quizId: "quiz-1",
        quiz: { creatorId: "user-1", quizOrganizers: [{ id: "org-1" }] },
    });

    mocks.questionFindUnique.mockResolvedValue({ id: "question-1", answers: [] });
});

describe("updateQuestionController: a played question cannot be edited", () => {
    it("refuses with 409 once anyone has answered", async () => {
        mocks.count.mockResolvedValue(3);

        const res = await run();

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("writes nothing when it refuses", async () => {
        mocks.count.mockResolvedValue(1);

        await run();

        // The whole point: no update, and above all no answer rows deleted.
        expect(mocks.questionUpdate).not.toHaveBeenCalled();
        expect(mocks.answerDeleteMany).not.toHaveBeenCalled();
        expect(mocks.answerCreateMany).not.toHaveBeenCalled();
    });

    it("still edits a question nobody has answered", async () => {
        mocks.count.mockResolvedValue(0);

        const res = await run();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mocks.questionUpdate).toHaveBeenCalled();
        expect(mocks.answerCreateMany).toHaveBeenCalled();
    });

    it("counts only this question's answers", async () => {
        mocks.count.mockResolvedValue(0);

        await run();

        expect(mocks.count).toHaveBeenCalledWith({
            where: { questionId: "question-1" },
        });
    });

    it("takes the row lock before counting", async () => {
        mocks.count.mockResolvedValue(0);

        await run();

        // A count taken before the lock could race a quiz starting.
        expect(mocks.queryRaw.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.count.mock.invocationCallOrder[0]);
    });
});
