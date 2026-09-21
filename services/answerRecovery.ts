/**
 * Coming back to an answer that kept being written after you left.
 *
 * THE SERVER SIDE. A streamed answer used to die with its connection: close the
 * tab, lock the phone, navigate to another screen, and the model call was
 * cancelled and nothing was saved. The server now lets the answer finish and
 * records it; only a deliberate stop from the person ends it early. That leaves
 * two things for this side to do, and both are decided here so they can be
 * tested without a browser.
 *
 * ONE: a Stop is a message, not just a closed connection. Pressing Stop tells
 * the server so BEFORE the fetch is aborted, because the server cannot tell an
 * abort apart from a dropped network. Navigating away sends nothing on purpose:
 * that is the case the answer should survive.
 *
 * TWO: a conversation restored while its answer is still being written shows
 * the previous exchanges and nothing for the question that was just asked,
 * because the exchange is recorded when the answer finishes. The session says
 * whether it is live; while it is, keep asking, and adopt the messages when
 * they arrive.
 */

import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "./endPoints"

/** How often to ask again while the answer is being written. */
export const ANSWER_POLL_MS = 2000

/**
 * How long to keep asking before giving up. The server's own ceiling on a
 * stream is the same order, so an answer not here by now is not coming.
 */
export const ANSWER_WAIT_MAX_MS = 10 * 60 * 1000

/** The words shown while waiting, so a returning person knows why the last question has no answer yet. */
export const STILL_WRITING = "Still writing the answer to your last question. It will appear here when it is done."

export type RecoveryStep = "wait" | "adopt" | "give-up"

/**
 * nextRecoveryStep decides what a restored conversation does with the session
 * state it just read. Pure.
 *
 * - live and inside the budget: wait and ask again.
 * - not live: whatever is recorded now is final; adopt it.
 * - live but past the budget: stop asking. The record is adopted as it stands,
 *   which is the honest state of things.
 */
export function nextRecoveryStep(live: boolean, waitedMs: number): RecoveryStep {
    if (!live) return "adopt"
    if (waitedMs >= ANSWER_WAIT_MAX_MS) return "give-up"
    return "wait"
}

/**
 * stopAnswer tells the server the person wants this answer to stop. It is
 * awaited by the caller before the fetch is aborted, and a failure is
 * swallowed: the abort happens either way, and the worst case is the answer
 * finishing on the server, which is what would have happened before Stop
 * existed as a message at all.
 */
export async function stopAnswer(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return
    try {
        await axiosInstance.post(PostEndpointUrl.AIAskStop, { session_id: sessionId })
    } catch {
        /* the abort still happens */
    }
}
