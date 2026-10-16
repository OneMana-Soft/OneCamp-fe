/**
 * An answer from OneCamp AI has started to arrive.
 *
 * The assistant asks over a stream (services/aiService.ts, through fetch), not
 * through the app's axios client, so nothing that watches axios responses can
 * tell that a question was answered. The demo counted wins that way, and its
 * guide's "Ask OneCamp AI" step could never tick: the guide waited for an axios
 * POST to /ai/ask that the panel never makes.
 *
 * This is how the rest of the page hears of it instead: an event on window,
 * fired once per answer, at its first words. Never for a refusal, an error, or
 * a stream that ends with nothing in it. It carries nothing about the question
 * or the answer.
 */
export const AI_ANSWER_STARTED = "onecamp:ai-answer-started"

/** Says an answer has started. Never throws: an answer is worth more than its announcement. */
export function announceAnswerStarted(): void {
    if (typeof window === "undefined") return
    try {
        window.dispatchEvent(new Event(AI_ANSWER_STARTED))
    } catch {
        /* nothing listening is the common case anyway */
    }
}
