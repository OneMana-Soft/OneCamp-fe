/**
 * What a send should actually submit, and whether the draft box should be
 * emptied afterwards.
 *
 * Two hazards live in this one decision, which is why it is a function with
 * tests rather than a ternary inside a 900-line component.
 *
 * The argument may not be a string. The same callback is handed to onClick,
 * where React calls it with a MouseEvent. TypeScript rejects that today; the
 * check is what keeps a future refactor from asking the model about
 * "[object Object]".
 *
 * The draft is not always the thing being sent. A suggestion chip sends its own
 * question, and clearing the box then would throw away whatever the person had
 * half-typed before they clicked it.
 */
export interface SendTarget {
    /** The question to ask. Empty means there is nothing to send. */
    text: string
    /** Whether the composer should be emptied and reset after sending. */
    clearDraft: boolean
}

export function sendTarget(explicit: unknown, draft: string): SendTarget {
    if (typeof explicit === "string") {
        return { text: explicit.trim(), clearDraft: false }
    }
    return { text: draft.trim(), clearDraft: true }
}
