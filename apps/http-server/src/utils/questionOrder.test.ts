import { describe, expect, it } from 'vitest';
import { renumberQuestions } from './questionOrder';

describe('renumberQuestions', () => {
    it('changes nothing when the orders are already 1..n', () => {
        expect(renumberQuestions([{ id: 'a', order: 1 }, { id: 'b', order: 2 }])).toEqual([]);
    });

    it('closes the gap left by a deleted question', () => {
        const left = [{ id: 'one', order: 1 }, { id: 'three', order: 3 }, { id: 'four', order: 4 }];
        expect(renumberQuestions(left)).toEqual([{ id: 'three', order: 2 }, { id: 'four', order: 3 }]);
    });

    it('keeps the play order even if the rows come back shuffled', () => {
        const left = [{ id: 'c', order: 5 }, { id: 'a', order: 2 }, { id: 'b', order: 3 }];
        expect(renumberQuestions(left)).toEqual([
            { id: 'a', order: 1 },
            { id: 'b', order: 2 },
            { id: 'c', order: 3 },
        ]);
    });

    it('untangles questions that already share an order', () => {
        const tied = [{ id: 'one', order: 1 }, { id: 'four', order: 3 }, { id: 'three', order: 3 }];
        expect(renumberQuestions(tied)).toEqual([{ id: 'four', order: 2 }]);
    });
});
