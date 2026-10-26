// Gives questions the orders 1..n in their current play order and returns
// only the ones whose order has to change. Ties (from older duplicate data)
// are broken by id so the result is the same every time.
export function renumberQuestions(questions: { id: string; order: number }[]) {
    return [...questions]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((question, index) => ({ id: question.id, order: index + 1, changed: question.order !== index + 1 }))
        .filter((question) => question.changed)
        .map(({ id, order }) => ({ id, order }));
}
