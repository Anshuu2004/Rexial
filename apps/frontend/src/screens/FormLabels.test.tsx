import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import JoinQuiz from './JoinQuiz';
import Login from './Login';
import Signup from './Signup';

vi.mock('../components/BgBoss', () => ({
    default: () => null,
}));

const forms = [
    {
        name: 'Login',
        Component: Login,
        fields: [
            { label: 'Email Address', placeholder: 'iamraj@google.com' },
            { label: 'Password', placeholder: '••••••••' },
        ],
    },
    {
        name: 'Signup',
        Component: Signup,
        fields: [
            { label: 'Full Name', placeholder: 'Enter Your Name' },
            { label: 'Email Address', placeholder: 'iamraj@google.com' },
            { label: 'Password', placeholder: '••••••••' },
        ],
    },
    {
        name: 'JoinQuiz',
        Component: JoinQuiz,
        fields: [
            { label: 'Game PIN', placeholder: 'e.g. XY3F12' },
            { label: 'Nickname', placeholder: 'Enter your name' },
        ],
    },
];

describe.each(forms)('$name form labels', ({ Component, fields }) => {
    it.each(fields)('names $label independently of its placeholder', async ({ label, placeholder }) => {
        const user = userEvent.setup();
        render(<MemoryRouter><Component /></MemoryRouter>);

        const input = screen.getByPlaceholderText(placeholder);
        input.removeAttribute('placeholder');

        expect(input).toHaveAccessibleName(label);
        expect(screen.getByLabelText(label)).toBe(input);

        await user.type(input, 'Example123');

        expect(input).toHaveAccessibleName(label);
        expect(screen.getByLabelText(label)).toBe(input);
    });

    it.each(fields)('focuses $label when its visible label is clicked', async ({ label, placeholder }) => {
        const user = userEvent.setup();
        render(<MemoryRouter><Component /></MemoryRouter>);

        const input = screen.getByPlaceholderText(placeholder);
        expect(input).not.toHaveFocus();

        await user.click(screen.getByText(label, { selector: 'label' }));

        expect(input).toHaveFocus();
    });
});
