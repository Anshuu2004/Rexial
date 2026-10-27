import { describe, expect, it } from 'vitest';
import { parseRegisterInput } from './registerInput';

const valid = { name: 'Ada', email: 'ada@example.com', password: 'secret12' };

const errorFor = (body: unknown) => {
    const result = parseRegisterInput(body);
    return result.ok ? null : result.error;
};

describe('parseRegisterInput', () => {
    it('accepts a normal registration and returns the values as sent', () => {
        const result = parseRegisterInput(valid);
        expect(result).toEqual({ ok: true, data: valid });
    });

    it('does not trim what it accepts', () => {
        const body = { name: ' Ada ', email: 'ada@example.com', password: ' secret ' };
        expect(parseRegisterInput(body)).toEqual({ ok: true, data: body });
    });

    it('names a missing field', () => {
        expect(errorFor({ name: 'Ada', email: 'ada@example.com' })).toBe('password is required');
        expect(errorFor({ email: 'ada@example.com', password: 'secret12' })).toBe('name is required');
        expect(errorFor({ name: 'Ada', password: 'secret12' })).toBe('email is required');
    });

    it('names every missing field', () => {
        expect(errorFor({ email: 'a@b.c' })).toBe('name and password are required');
        expect(errorFor({})).toBe('name, email and password are required');
    });

    it.each([[''], ['   '], ['\t\n'], [null]])('treats %j as not filled in', (value) => {
        expect(errorFor({ ...valid, password: value })).toBe('password is required');
        expect(errorFor({ ...valid, name: value })).toBe('name is required');
        expect(errorFor({ ...valid, email: value })).toBe('email is required');
    });

    it.each([[12345678], [true], [['secret12']], [{ a: 1 }]])('rejects a password of type %j', (value) => {
        expect(errorFor({ ...valid, password: value })).toBe('password must be a string');
    });

    it('rejects an email that is not a string', () => {
        expect(errorFor({ ...valid, email: { $ne: 'x' } })).toBe('email must be a string');
    });

    it('reports a missing field and a wrong type together', () => {
        expect(errorFor({ email: 7, password: 'secret12' })).toBe('name is required; email must be a string');
    });

    it.each([[undefined], [null], ['text'], [42], [[]], [[1, 2]]])('treats the body %j as all fields missing', (body) => {
        expect(errorFor(body)).toBe('name, email and password are required');
    });
});
