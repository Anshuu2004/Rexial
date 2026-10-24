import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import Login from './Login';
import Signup from './Signup';

vi.mock('../services/api', () => ({
    api: { post: vi.fn() },
}));

vi.mock('../components/BgBoss', () => ({
    default: () => null,
}));

const auth = {
    user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
    token: 'test-token',
};

const forms = [
    { path: '/login', Component: Login, endpoint: '/auth/login', button: 'Login', fallback: 'Failed to login...' },
    { path: '/signup', Component: Signup, endpoint: '/auth/register', button: 'Create account', fallback: 'Failed to register...' },
];

beforeEach(() => {
    vi.mocked(api.post).mockReset();
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null });
});

describe.each(forms)('$path form submission', ({ path, Component, endpoint, button, fallback }) => {
    function renderForm() {
        render(
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path={path} element={<Component />} />
                    <Route path="/dashboard" element={<h1>Dashboard</h1>} />
                </Routes>
            </MemoryRouter>
        );
        return userEvent.setup();
    }

    async function fillForm(user: ReturnType<typeof userEvent.setup>) {
        if (path === '/signup') await user.type(screen.getByLabelText('Full Name'), auth.user.name);
        await user.type(screen.getByLabelText('Email Address'), auth.user.email);
        await user.type(screen.getByLabelText('Password'), 'secret123');
    }

    it('submits values entered through labels, disables submission while pending and authenticates', async () => {
        let finishRequest = () => {};
        const pending = new Promise<void>(resolve => { finishRequest = resolve; });
        vi.mocked(api.post).mockImplementationOnce(async () => {
            await pending;
            return { data: auth };
        });

        const user = renderForm();
        const submit = screen.getByRole('button', { name: button });
        await fillForm(user);
        await user.keyboard('{Enter}');

        expect(api.post).toHaveBeenCalledExactlyOnceWith(endpoint, {
            ...(path === '/signup' ? { name: auth.user.name } : {}),
            email: auth.user.email,
            password: 'secret123',
        });
        expect(submit).toBeDisabled();
        await user.click(submit);
        expect(api.post).toHaveBeenCalledTimes(1);

        await act(async () => { finishRequest(); });

        expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(useAuthStore.getState()).toMatchObject(auth);
    });

    it('keeps required fields and email validation before calling the API', async () => {
        const user = renderForm();
        const submit = screen.getByRole('button', { name: button });

        await user.click(submit);
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Email Address')).toBeInvalid();
        expect(screen.getByLabelText('Password')).toBeInvalid();
        if (path === '/signup') expect(screen.getByLabelText('Full Name')).toBeInvalid();

        await fillForm(user);
        await user.clear(screen.getByLabelText('Email Address'));
        await user.type(screen.getByLabelText('Email Address'), 'invalid-email');
        await user.click(submit);

        expect(screen.getByLabelText('Email Address')).toBeInvalid();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('retains entered values and enables retry after a failed request', async () => {
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Network unavailable'));
        const user = renderForm();
        await fillForm(user);
        await user.click(screen.getByRole('button', { name: button }));

        expect(await screen.findByText(fallback)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: button })).toBeEnabled();
        expect(screen.getByLabelText('Email Address')).toHaveValue(auth.user.email);
        expect(screen.getByLabelText('Password')).toHaveValue('secret123');
        expect(useAuthStore.getState().token).toBeNull();
    });
});
