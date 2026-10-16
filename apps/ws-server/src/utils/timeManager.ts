// utils/timerManager.ts

import { cache, pub, sessionChannel } from '../redis.js';
import { getCachedQuestions, getCachedLeaderboard,
         invalidateLeaderboard } from './cache.js';
import { broadcastToSession } from './broadcastTosession.js';
import { sessionTimers } from '../clients/index.js';

// Redis key that marks "a timer is already running for this question"
const timerLockKey = (sessionId: string, questionIndex: number) =>
    `quiz:timer-lock:${sessionId}:${questionIndex}`;

// Absolute epoch-ms deadline for the question currently in flight. The
// countdown itself lives in a setInterval closure on one instance, which a
// reconnecting client cannot read — this key is what lets any instance answer
// "how much time is left?" during a mid-question rejoin.
export const timerDeadlineKey = (sessionId: string) =>
    `quiz:deadline:${sessionId}`;

// Which question is in flight, so an early finish can prove it is closing the
// question it meant to and not one that already moved on.
const currentQuestionKey = (sessionId: string) =>
    `quiz:current-q:${sessionId}`;

/**
 * Close the question in flight: stop the countdown, reveal the answers, then
 * send the standings.
 *
 * Called both by the countdown reaching zero and by everyone answering early.
 * The Redis delete is what settles a race between those two — `del` returns
 * the number of keys it actually removed, so whichever path gets there first
 * removes the deadline and the other sees 0 and stops. Without that, a last
 * answer landing on the final tick would reveal the results twice.
 */
async function finishQuestion(sessionId: string, questionIndex: number) {
    const lockKey = timerLockKey(sessionId, questionIndex);

    // Claim the close. Only the caller that actually removed the deadline
    // proceeds; anyone else lost the race and must do nothing.
    const claimed = await cache.del(timerDeadlineKey(sessionId));
    if (claimed === 0) return;

    const localTimer = sessionTimers.get(sessionId);
    if (localTimer) {
        clearInterval(localTimer);
        sessionTimers.delete(sessionId);
    }

    // Release the question lock so the next question can start.
    await cache.del(lockKey, currentQuestionKey(sessionId));

    const questions = await getCachedQuestions(sessionId);
    const question = questions[questionIndex];
    if (!question) return;

    await invalidateLeaderboard(sessionId);
    const leaderboard = await getCachedLeaderboard(sessionId);

    broadcastToSession(sessionId, 'quiz:question-results', {
        correctAnswers: question.answers
            .filter((a: any) => a.isCorrect)
            .map((a: any) => a.id),
    });

    setTimeout(() => {
        broadcastToSession(sessionId, 'quiz:leaderboard', { leaderboard });
    }, 2_000);
}

/**
 * End the current question early because everyone present has answered.
 *
 * Waiting out a 20s limit when all 200 people answered by 14s is dead air, so
 * the question closes once nobody is left to answer. The short delay keeps it
 * from cutting off the moment the last person clicks, and gives an answer
 * still in flight on a slow connection a chance to land.
 */
export async function finishQuestionEarly(sessionId: string, questionIndex: number) {
    // Only end early while this question is genuinely the live one: the
    // deadline is deleted the moment it closes by any route.
    const [deadline, current] = await Promise.all([
        cache.get(timerDeadlineKey(sessionId)),
        cache.get(currentQuestionKey(sessionId)),
    ]);
    if (!deadline) return;
    if (current !== null && Number(current) !== questionIndex) return;

    setTimeout(() => {
        finishQuestion(sessionId, questionIndex).catch((err) =>
            console.error('[timer] early finish failed', err),
        );
    }, 1_500);
}

export async function startQuestionTimer(
    sessionId: string,
    questionIndex: number,
) {
    const lockKey = timerLockKey(sessionId, questionIndex);

    // NX = only set if key does NOT exist → only one instance wins the race
    // EX = auto-expire after timeLimit + 10s safety buffer
    const questions  = await getCachedQuestions(sessionId);
    const question   = questions[questionIndex];
    if (!question) return;

    const acquired = await cache.set(
        lockKey,
        '1',
        'EX', question.timeLimit + 10,
        'NX',                           // atomic: only one server wins
    );

    // Another instance already holds the lock — do nothing
    if (acquired !== 'OK') {
        console.log(`[timer] lock already held for ${sessionId}:${questionIndex}`);
        return;
    }

    console.log(`[timer] lock acquired for ${sessionId}:${questionIndex}`);

    // Clear any previous local timer for this session (safety)
    if (sessionTimers.has(sessionId)) {
        clearInterval(sessionTimers.get(sessionId));
    }

    let timeLeft = question.timeLimit;

    // Published so a mid-question rejoin can compute the real remaining time.
    await cache.set(
        timerDeadlineKey(sessionId),
        String(Date.now() + question.timeLimit * 1_000),
        'EX', question.timeLimit + 10,
    );

    // Lets an early finish confirm it is closing the question still in flight.
    await cache.set(
        currentQuestionKey(sessionId),
        String(questionIndex),
        'EX', question.timeLimit + 10,
    );

    broadcastToSession(sessionId, 'quiz:timer-tick', { timeLeft });

    const timer = setInterval(async () => {
        timeLeft--;
        broadcastToSession(sessionId, 'quiz:timer-tick', { timeLeft });

        if (timeLeft <= 0) {
            // Same close as an early finish, so the two cannot diverge; the
            // deadline delete inside settles which of them gets there first.
            await finishQuestion(sessionId, questionIndex);
        }
    }, 1_000);

    sessionTimers.set(sessionId, timer);
}