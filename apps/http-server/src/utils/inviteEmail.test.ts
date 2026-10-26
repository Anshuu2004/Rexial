import { describe, expect, it } from 'vitest';
import { normalizeEmail, parseInviteEmail, sameEmail } from './inviteEmail';

describe('parseInviteEmail', () => {
    it('trims and lower cases a valid email', () => {
        expect(parseInviteEmail('  Friend@Example.COM ')).toEqual({ email: 'friend@example.com' });
    });

    it.each([undefined, null, '', '   ', 42, {}])('asks for an email when given %j', (value) => {
        expect(parseInviteEmail(value)).toEqual({ error: 'Email is required' });
    });

    it.each(['not-an-email', 'a@b', '@example.com', 'two words@example.com'])(
        'rejects %s as invalid',
        (value) => {
            expect(parseInviteEmail(value)).toEqual({ error: 'Enter a valid email address' });
        }
    );
});

describe('sameEmail', () => {
    it('ignores case and surrounding spaces on both sides', () => {
        expect(sameEmail('Friend@Example.com', ' friend@example.COM')).toBe(true);
    });

    it('is false for different or missing emails', () => {
        expect(sameEmail('a@example.com', 'b@example.com')).toBe(false);
        expect(sameEmail(null, 'b@example.com')).toBe(false);
        expect(sameEmail('a@example.com', undefined)).toBe(false);
    });
});

describe('normalizeEmail', () => {
    it('lower cases and trims', () => {
        expect(normalizeEmail(' A@B.com ')).toBe('a@b.com');
    });
});
