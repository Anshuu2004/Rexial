import { prisma } from "@repo/db";
import WebSocket from "ws";
import type { Client } from "../index.js";
import { cache } from "../redis.js";
import { broadcastToSession } from "./broadcastTosession.js";
import { clients, sessionTimers, indexClient, unindexClient, clientsInSession } from "../clients/index.js";
import { endQuizSession } from "./endQuizSession.js";
import { getLeaderboard } from "./leaderboard.js";
import {
    getCachedSession,
    getCachedQuestions,
    getCachedParticipants,
    getCachedLeaderboard,
    invalidateParticipants,
    appendCachedParticipant,
    invalidateLeaderboard,
    clearSessionCache,
} from './cache.js';
import { startQuestionTimer, timerDeadlineKey, finishQuestionEarly } from "./timeManager.js";


/**
 * Points for the fastest correct answer to a question.
 *
 * A correct answer scores from MAX_POINTS down to 1 as the clock runs out;
 * a wrong answer scores 0. Keeping the per-question maximum small means a
 * leaderboard total reads as roughly "questions answered well" rather than
 * an arbitrary four-digit number.
 */
const MAX_POINTS = 10;




/**
 * Bring a reconnecting participant back to the live question.
 *
 * Sent to the one client rather than broadcast: everyone else is already in
 * the right state, and re-broadcasting a question would reset their timers.
 */
async function sendQuizStateSnapshot(client: Client, sessionId: string) {
    const session = await getCachedSession(sessionId);

    // Nothing in flight before the quiz starts or once it is over: the normal
    // WAITING / ENDED handling already covers those.
    if (!session || session.status !== 'IN_PROGRESS') return;

    const questionIndex = session.currentQuestionIndex ?? 0;
    const questions = await getCachedQuestions(sessionId);
    const question = questions[questionIndex];
    if (!question) return;

    // How long is actually left, from the shared deadline rather than from a
    // countdown living in one instance's memory.
    const rawDeadline = await cache.get(timerDeadlineKey(sessionId));
    const timeLeft = rawDeadline
        ? Math.max(0, Math.ceil((Number(rawDeadline) - Date.now()) / 1_000))
        : 0;

    // Did this participant already answer? There is no unique constraint on
    // (participantId, questionId), so a replayed question they could answer
    // twice would score twice.
    const existingAnswer = client.participantId
        ? await prisma.participantAnswer.findFirst({
            where: { participantId: client.participantId, questionId: question.id },
            select: { answerId: true },
        })
        : null;

    const sanitizedQuestion = {
        ...question,
        answers: question.answers.map((ans: any) => ({
            id: ans.id,
            text: ans.text,
        })),
    };

    if (client.ws.readyState !== WebSocket.OPEN) return;

    client.ws.send(JSON.stringify({
        type: 'quiz:state-snapshot',
        payload: {
            question: sanitizedQuestion,
            questionIndex,
            timeLeft,
            // Already answered, or the window closed while they were away:
            // the client shows the question read-only in both cases.
            alreadyAnswered: !!existingAnswer,
            selectedAnswerId: existingAnswer?.answerId ?? null,
            expired: timeLeft <= 0,
        },
    }));
}


export const handleMessage = async (client: Client, data: any) => {
    const { type, payload } = data;

    switch (type) {
        case 'join': {

            console.log("JOIN EVENT")

            const { sessionId, role, participantId, userId } = payload;

            // A reconnecting client re-joins with the same participantId while
            // its previous socket may still be registered: the heartbeat can
            // take up to two rounds to notice a dead peer, and a background
            // tab that never fired 'close' lingers even longer. Two entries
            // for one person means every broadcast is delivered twice and the
            // participant count is inflated, so retire the stale socket now
            // rather than waiting for the heartbeat.
            if (participantId) {
                for (const existing of clients) {
                    if (existing !== client && existing.participantId === participantId) {
                        clients.delete(existing);
                        unindexClient(existing);
                        existing.ws.terminate();
                    }
                }
            }

            // Index before overwriting sessionId: indexClient uses the old
            // value to remove the client from a previous session's group.
            indexClient(client, sessionId);

            client.sessionId = sessionId;
            client.role = role;
            client.participantId = participantId;
            client.userId = userId;

            if (role === 'ORGANIZER') {

                const session = await getCachedSession(sessionId);
                const participants = await getCachedParticipants(sessionId);




                client.ws.send(JSON.stringify({
                    type: 'participants:sync',
                    payload: {
                        participants,
                        joinCode: session?.quiz.joinCode
                    }
                }));

                // The list above is a snapshot taken at this instant; from
                // here the organizer only hears about new arrivals through
                // 'participant:joined'. Anyone who joined while this socket
                // was still connecting sent their broadcast to nobody, and a
                // single dropped frame is never made up. Both leave the host
                // with a count that stays wrong for the rest of the lobby, so
                // the client can ask for a fresh list with 'participants:refresh'.
            } else if (role === 'PARTICIPANT' && participantId) {
                const participant = await prisma.participant.findUnique({
                    where: { id: participantId }
                });

                const session = await getCachedSession(sessionId);

                // Keep the cache warm across the join rush instead of dropping
                // and rebuilding it for every arrival.
                const participants = await appendCachedParticipant(sessionId, participant);

                // The full list goes to the joiner alone; everyone already
                // connected only needs the one new arrival, which the client
                // appends. Broadcasting the whole list to everyone made this
                // O(n^2) - at 300 per session that is ~720MB of JSON per
                // session just to fill the lobby.
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({
                        type: 'participants:sync',
                        payload: {
                            participants,
                            joinCode: session?.quiz?.joinCode
                        }
                    }));
                }

                broadcastToSession(sessionId, 'participant:joined', { participant });

                // Replay the in-flight question to this client alone. Without
                // it a reconnect lands on a blank screen until the organizer
                // advances, so a brief network blip costs the whole question.
                // Only a live quiz has anything to replay, so a first join
                // into the lobby skips the extra queries entirely.
                if (session?.status === 'IN_PROGRESS') {
                    await sendQuizStateSnapshot(client, sessionId);
                }
            }
            break;
        }


        /**
         * Re-send the participant list to one client.
         *
         * The lobby is otherwise built from a single snapshot at join plus
         * incremental 'participant:joined' events, so a host whose socket
         * connected during a join rush — or who missed one broadcast — shows
         * a count that never corrects itself. This lets the client reconcile
         * without reloading the page.
         *
         * Read from the cache, so a host polling this does not turn into a
         * query per poll.
         */
        case 'participants:refresh': {
            const sessionId = client.sessionId || payload?.sessionId;
            if (!sessionId) break;

            const [session, participants] = await Promise.all([
                getCachedSession(sessionId),
                getCachedParticipants(sessionId),
            ]);

            if (client.ws.readyState !== WebSocket.OPEN) break;

            client.ws.send(JSON.stringify({
                type: 'participants:sync',
                payload: {
                    participants,
                    joinCode: session?.quiz?.joinCode,
                },
            }));
            break;
        }


        case 'quiz:start': {
            const { sessionId } = payload;
            // A session the super-admin cancelled (or one that already
            // ended) must not be revived by a host coming back to the lobby.
            const { count } = await prisma.quizSession.updateMany({
                where: { id: sessionId, status: { in: ['WAITING', 'IN_PROGRESS'] } },
                data: { status: 'IN_PROGRESS', startedAt: new Date() }
            });
            if (count === 0) break;
            broadcastToSession(sessionId, 'quiz:start');
            break;
        }

        case 'quiz:next-question': {
            const { sessionId, questionIndex = 0 } = payload;

            const questions = await getCachedQuestions(sessionId);


            if (!sessionId || !questions[questionIndex]) {
                // now no more question- end quiz and clean up
                await endQuizSession(sessionId);
                await clearSessionCache(sessionId);
                broadcastToSession(sessionId, 'quiz:ended');
                return;
            };

            const question = questions[questionIndex];

            await prisma.quizSession.update({
                where: { id: sessionId },
                data: { currentQuestionIndex: questionIndex }
            });

            // without revealing answers
            const sanitizedQuestion = {
                ...question,
                answers: question.answers.map((ans: any) => ({
                    id: ans.id,
                    text: ans.text
                }))
            }

            broadcastToSession(sessionId, 'quiz:question', { question: sanitizedQuestion })

            await startQuestionTimer(sessionId, questionIndex)
            break;
        }

        case 'quiz:submit-answer': {
            const { sessionId, participantId, questionId, answerId, timeMs } = payload;

            if (!participantId) break;

            // No pre-check for a duplicate submission: the unique constraint
            // on (participantId, questionId) rejects one with P2002, which is
            // handled below. Asking the database first would add a round-trip
            // to every answer and still not settle a race.
            const questions = await getCachedQuestions(sessionId);
            const question = questions.find((q: any) => q.id === questionId);
            const answerMeta = question?.answers.find((a: any) => a.id === answerId);

            const isCorrect = !!answerMeta?.isCorrect;

            // Score across the question's real time limit rather than a fixed
            // 1000ms. `1000 - timeMs` spent its whole range in the first
            // second, so on a 15s question everyone slower than 1s scored the
            // same floor: answering in 2s and in 14s were worth the same, and
            // only a bot could reach the top of the curve.
            //
            // Now a correct answer is worth MAX_POINTS down to 1, scaled over
            // the time actually allowed; a wrong answer is worth 0. Answering
            // at all still scores, so the floor is 1 rather than 0.
            const limitMs = Math.max(1, (question?.timeLimit ?? 15) * 1_000);
            // timeMs comes from the client and is not trusted for anything
            // beyond ordering: clamp it so a negative or oversized value
            // cannot mint points or push the score below the floor.
            const elapsedMs = Math.min(Math.max(Number(timeMs) || 0, 0), limitMs);
            const points = isCorrect
                ? Math.max(1, Math.ceil(MAX_POINTS * (1 - elapsedMs / limitMs)))
                : 0;

            // Insert the answer first and only credit the score if it was
            // actually recorded. Running both concurrently would award points
            // even when the unique constraint rejected the answer, which is
            // exactly the double-scoring this is meant to prevent.
            try {
                await prisma.$transaction([
                    prisma.participantAnswer.create({
                        data: { participantId, questionId, answerId, timeMs, isCorrect, points },
                    }),
                    prisma.participant.update({
                        where: { id: participantId },
                        data: { score: { increment: points } },
                    }),
                ]);
            } catch (err: any) {
                // P2002 = unique constraint: a duplicate submission that raced
                // past the check above. Nothing was written; not an error.
                if (err?.code === 'P2002') break;
                throw err;
            }

            await invalidateLeaderboard(sessionId);

            // Everyone present has answered: close the question instead of
            // making the room watch an empty countdown. Counting live sockets
            // rather than Participant rows means someone who closed their
            // laptop cannot hold the question open to the full limit.
            const connected = [...clientsInSession(sessionId)].filter(
                (c) => c.role === 'PARTICIPANT'
                    && c.participantId
                    && c.ws.readyState === WebSocket.OPEN,
            );

            if (connected.length > 0) {
                const answered = await prisma.participantAnswer.count({
                    where: {
                        questionId,
                        participantId: { in: connected.map((c) => c.participantId as string) },
                    },
                });

                // Progress for the room, from the counts already gathered
                // above: no extra query. It also explains the early finish —
                // without it a question ending before the clock looks like a
                // glitch rather than "everyone has answered".
                // participantId rides along so the room can show whose answer
                // just landed. Avatars are derived from the id on the client,
                // so this costs one field rather than a lookup.
                broadcastToSession(sessionId, 'quiz:answer-progress', {
                    questionId,
                    answered,
                    total: connected.length,
                    participantId,
                });

                if (answered >= connected.length) {
                    // Index of the question just answered, taken from the
                    // question list rather than the cached session: the
                    // session cache is not invalidated when the organizer
                    // advances, so its currentQuestionIndex can be an hour
                    // stale and would close the wrong question.
                    const idx = questions.findIndex((q: any) => q.id === questionId);
                    if (idx >= 0) await finishQuestionEarly(sessionId, idx);
                }
            }

            break;
        }


        case 'quiz:end': {

            const { sessionId } = payload;

            if (!sessionId) break;

            if (sessionTimers.has(sessionId)) {
                clearInterval(sessionTimers.get(sessionId));
                sessionTimers.delete(sessionId);
            }

            // Read the leaderboard before the caches are dropped: both
            // endQuizSession and clearSessionCache clear it, and reading
            // afterwards would re-query the DB and repopulate what we just
            // cleared.
            const leaderboard = await getCachedLeaderboard(sessionId);

            await endQuizSession(sessionId);
            await clearSessionCache(sessionId);

            broadcastToSession(sessionId, 'quiz:leaderboard', { leaderboard });
            broadcastToSession(sessionId, 'quiz:ended');
            break;

        }
    }
}


