import { z } from "zod";

const emailSchema = z.email();

// Trim + lower case so the same address is always stored (and compared) one way.
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const sameEmail = (a?: string | null, b?: string | null) =>
    !!a && !!b && normalizeEmail(a) === normalizeEmail(b);

// Checks the `email` field of an invite request body.
export const parseInviteEmail = (value: unknown): { email: string } | { error: string } => {
    if (typeof value !== 'string' || !value.trim()) return { error: 'Email is required' };

    const email = normalizeEmail(value);
    if (!emailSchema.safeParse(email).success) return { error: 'Enter a valid email address' };

    return { email };
};
