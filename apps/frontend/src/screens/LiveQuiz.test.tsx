import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveQuiz from './LiveQuiz';
import { useAuthStore } from '../store/authStore';

vi.mock('../components/BgBoss', () => ({
    default: () => null,
}));

const sockets: FakeSocket[] = [];

class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    sent: { type: string; payload: Record<string, unknown> }[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor() {
        sockets.push(this);
        queueMicrotask(() => this.onopen?.());
    }

    send(raw: string) {
        this.sent.push(JSON.parse(raw));
    }

    close() {}
}

function renderLive(path: string, isOrganizer: boolean) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/live/:sessionId"
                    element={<LiveQuiz isOrganizer={isOrganizer} />}
                />
            </Routes>
        </MemoryRouter>
    );
}

async function firstJoinMessage() {
    await waitFor(() => expect(sockets[0]?.sent.length).toBeGreaterThan(0));
    return sockets[0]!.sent[0];
}

beforeEach(() => {
    sockets.length = 0;
    localStorage.clear();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
    }));
    useAuthStore.setState({
        user: { id: 'user-1', name: 'Host', email: 'host@example.com' },
        token: 'login-token',
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, token: null });
});

describe('LiveQuiz join message', () => {
    it('sends the login token when the host joins as organizer', async () => {
        renderLive('/live/session-1', true);

        const join = await firstJoinMessage();

        expect(join.type).toBe('join');
        expect(join.payload).toMatchObject({
            sessionId: 'session-1',
            role: 'ORGANIZER',
            token: 'login-token',
        });
    });

    it('does not send the login token when a participant joins', async () => {
        localStorage.setItem('rexial:participant:session-1', 'participant-1');
        localStorage.setItem('rexial:username:session-1', 'Sam');
        renderLive('/live/session-1', false);

        const join = await firstJoinMessage();

        expect(join.payload).toMatchObject({
            sessionId: 'session-1',
            role: 'PARTICIPANT',
            participantId: 'participant-1',
        });
        expect(join.payload.token).toBeUndefined();
        expect(JSON.stringify(join)).not.toContain('login-token');
    });
});
