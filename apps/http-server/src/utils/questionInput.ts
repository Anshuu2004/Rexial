import { z } from 'zod';

export const DIFFICULTIES = ['Low', 'Medium', 'High'] as const;

// Same bounds the AI question generator already enforces on the frontend.
export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 300;
export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 6;

const nonEmptyString = z
    .string('must be a non-empty string')
    .refine((value) => value.trim().length > 0, 'must be a non-empty string');

const timeLimitMessage = `must be a whole number from ${MIN_TIME_LIMIT} to ${MAX_TIME_LIMIT}`;
const answersMessage = `must be an array of ${MIN_ANSWERS} to ${MAX_ANSWERS} options`;

const answerSchema = z.object({
    text: nonEmptyString,
    isCorrect: z.boolean('must be true or false'),
});

export const createQuestionSchema = z.object({
    text: nonEmptyString,
    timeLimit: z
        .number(timeLimitMessage)
        .int(timeLimitMessage)
        .min(MIN_TIME_LIMIT, timeLimitMessage)
        .max(MAX_TIME_LIMIT, timeLimitMessage),
    difficulty: z.enum(DIFFICULTIES, 'must be Low, Medium or High').default('Medium'),
    answers: z
        .array(answerSchema, answersMessage)
        .min(MIN_ANSWERS, answersMessage)
        .max(MAX_ANSWERS, answersMessage)
        .refine((answers) => answers.some((answer) => answer.isCorrect), 'needs at least one correct option'),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// One message for the 400 response, starting with the field that failed.
export function parseCreateQuestion(body: unknown):
    | { ok: true; data: CreateQuestionInput }
    | { ok: false; error: string } {
    const result = createQuestionSchema.safeParse(body);
    if (result.success) return { ok: true, data: result.data };

    const issue = result.error.issues[0];
    const field = issue?.path.join('.');
    return { ok: false, error: field ? `${field} ${issue?.message}` : (issue?.message ?? 'Invalid question') };
}
