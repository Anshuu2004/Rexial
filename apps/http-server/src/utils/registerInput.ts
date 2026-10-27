import { z } from 'zod';

const isRequired = 'is required';
const mustBeString = 'must be a string';

// Missing, null and blank all read as "not filled in"; any other type is a
// different mistake and gets its own message.
const requiredString = z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? isRequired : mustBeString) })
    .refine((value) => value.trim().length > 0, isRequired);

export const registerSchema = z.object({
    name: requiredString,
    email: requiredString,
    password: requiredString,
});

export type RegisterInput = z.infer<typeof registerSchema>;

// "password is required", "name and password are required",
// "email must be a string", ...
const sentence = (fields: string[], message: string) => {
    const names =
        fields.length > 1 ? `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}` : fields[0];
    return `${names} ${message === isRequired && fields.length > 1 ? 'are required' : message}`;
};

// Checks the body of POST /auth/register. The values are returned as sent
// (not trimmed), so a valid registration behaves exactly as before.
export function parseRegisterInput(body: unknown):
    | { ok: true; data: RegisterInput }
    | { ok: false; error: string } {
    // A request with no JSON body has no req.body at all.
    const input = typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};

    const result = registerSchema.safeParse(input);
    if (result.success) return { ok: true, data: result.data };

    const byMessage = new Map<string, string[]>();
    for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        const fields = byMessage.get(issue.message) ?? [];
        if (!fields.includes(field)) fields.push(field);
        byMessage.set(issue.message, fields);
    }

    const error = [...byMessage].map(([message, fields]) => sentence(fields, message)).join('; ');
    return { ok: false, error };
}
