import { describe, expect, it } from 'vitest';
import { parseCreateQuestion } from './questionInput';

const answers = [
    { text: 'a', isCorrect: true },
    { text: 'b', isCorrect: false },
];

const valid = { text: 'Capital of France?', timeLimit: 15, answers };

const errorFor = (body: unknown) => {
    const result = parseCreateQuestion(body);
    return result.ok ? null : result.error;
};

describe('parseCreateQuestion', () => {
    it('accepts a normal question and defaults difficulty to Medium', () => {
        const result = parseCreateQuestion(valid);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.difficulty).toBe('Medium');
    });

    it('accepts what the form and the AI generator send', () => {
        const four = ['a', 'b', 'c', 'd'].map((text, i) => ({ text, isCorrect: i === 2 }));
        expect(parseCreateQuestion({ ...valid, difficulty: 'High', answers: four }).ok).toBe(true);
    });

    it('accepts the time limit bounds and six answers', () => {
        const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((text, i) => ({ text, isCorrect: i === 0 }));
        expect(parseCreateQuestion({ ...valid, timeLimit: 5, answers: six }).ok).toBe(true);
        expect(parseCreateQuestion({ ...valid, timeLimit: 300 }).ok).toBe(true);
    });

    it('rejects an empty or non-string text', () => {
        expect(errorFor({ ...valid, text: '   ' })).toMatch(/^text /);
        expect(errorFor({ ...valid, text: 42 })).toMatch(/^text /);
        expect(errorFor({ timeLimit: 15, answers })).toMatch(/^text /);
    });

    it.each([-5, 0, 4, 301, 99999999999, 10.5, '10', null])('rejects timeLimit %j', (timeLimit) => {
        expect(errorFor({ ...valid, timeLimit })).toMatch(/^timeLimit must be a whole number from 5 to 300/);
    });

    it('rejects answers that are missing, not an array, empty or too few', () => {
        expect(errorFor({ text: 'x', timeLimit: 10 })).toMatch(/^answers /);
        expect(errorFor({ ...valid, answers: 'nope' })).toMatch(/^answers /);
        expect(errorFor({ ...valid, answers: [] })).toMatch(/^answers /);
        expect(errorFor({ ...valid, answers: [answers[0]] })).toMatch(/^answers /);
    });

    it('rejects more than six answers', () => {
        const seven = Array.from({ length: 7 }, (_, i) => ({ text: `a${i}`, isCorrect: i === 0 }));
        expect(errorFor({ ...valid, answers: seven })).toMatch(/^answers /);
    });

    it('rejects answers with no correct option', () => {
        const none = answers.map((a) => ({ ...a, isCorrect: false }));
        expect(errorFor({ ...valid, answers: none })).toBe('answers needs at least one correct option');
    });

    it('allows more than one correct option', () => {
        const both = answers.map((a) => ({ ...a, isCorrect: true }));
        expect(parseCreateQuestion({ ...valid, answers: both }).ok).toBe(true);
    });

    it('names the answer that is malformed', () => {
        expect(errorFor({ ...valid, answers: [answers[0], { text: ' ', isCorrect: false }] })).toMatch(/^answers\.1\.text /);
        expect(errorFor({ ...valid, answers: [answers[0], { text: 'b', isCorrect: 'no' }] })).toMatch(/^answers\.1\.isCorrect /);
    });

    it('rejects an unknown difficulty', () => {
        expect(errorFor({ ...valid, difficulty: 'Extreme' })).toMatch(/^difficulty /);
    });

    it('rejects a missing body', () => {
        expect(parseCreateQuestion(undefined).ok).toBe(false);
    });
});
