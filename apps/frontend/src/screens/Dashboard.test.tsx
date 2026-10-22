import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({
    api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../components/BgBoss', () => ({
    default: () => null,
}));

vi.mock('../store/authStore', () => ({
    useAuthStore: () => ({ user: { name: 'Tester' }, logout: vi.fn() }),
}));

const { api } = await import('../services/api');

function renderDashboard() {
    render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>
    );

    return userEvent.setup();
}

beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.get).mockResolvedValue({
        data: { organizedQuizes: [], participated: [] },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'quiz-1' } });
});

describe('Dashboard load and action errors', () => {
    it('shows an error with a retry instead of the empty state when loading fails', async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error('network down'));

        const user = renderDashboard();

        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load your quizzes');
        expect(screen.queryByText("You haven't created any quizzes yet.")).not.toBeInTheDocument();
        expect(screen.queryByText('No played history yet.')).not.toBeInTheDocument();

        vi.mocked(api.get).mockResolvedValueOnce({
            data: { organizedQuizes: [], participated: [] },
        });
        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByText("You haven't created any quizzes yet.")).toBeInTheDocument();
    });

    it('surfaces a failed create inside the create form', async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error('500'));

        const user = renderDashboard();

        await user.click(screen.getByRole('button', { name: 'Create New Quiz' }));
        const titleInput = screen.getByPlaceholderText('Enter quiz title...');
        await user.type(titleInput, 'My quiz');

        const createForm = titleInput.closest('form') as HTMLFormElement;
        const submitButton = createForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        await user.click(submitButton);

        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to create the quiz');
        expect(api.post).toHaveBeenCalledTimes(1);
    });
});
