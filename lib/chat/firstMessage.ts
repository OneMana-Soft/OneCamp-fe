// A first message somewhere is one of the few moments worth a celebration (the
// playful layer, "Celebration"): the sender's first message in a channel or DM
// they have never posted in. Routine sends never celebrate, or it stops
// meaning anything.
//
// Decided from what the client already holds, with no new request: the
// conversation's messages in memory, and whether its latest page from the
// server is all there is (has_more false). Anything less certain (older
// messages that might hold one of theirs) does not celebrate.

const SEEN = "oc_first_message"

/**
 * Whether a message about to be sent is the sender's first in this
 * conversation, as far as can be known for certain.
 *
 * @param mine whether any message held for the conversation is the sender's
 * @param wholeHistory the latest page from the server said there is nothing older
 */
export function isFirstMessage({ mine, wholeHistory }: { mine: boolean; wholeHistory: boolean }): boolean {
    return !mine && wholeHistory
}

/**
 * Claims the celebration for one conversation, once per browser: a second
 * "first" message (after deleting the first, say) does not celebrate again.
 * True when this call claimed it.
 */
export function claimFirstMessage(conversation: string): boolean {
    try {
        const raw = localStorage.getItem(SEEN)
        const seen: string[] = raw ? JSON.parse(raw) : []
        if (seen.includes(conversation)) return false
        // A short list: the newest 200 conversations are plenty to remember.
        localStorage.setItem(SEEN, JSON.stringify([conversation, ...seen].slice(0, 200)))
        return true
    } catch {
        // No storage (a private window): celebrate, since nothing can repeat it
        // within this page.
        return true
    }
}
