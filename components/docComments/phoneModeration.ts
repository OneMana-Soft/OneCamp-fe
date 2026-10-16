/**
 * Whether the person may remove anyone's comment on a doc whose comments a
 * phone shows (its owner, full access, an admin: the threads say), by doc. The
 * long-press sheet is drawn by a frozen host from what the message row put in
 * it (its author's isOwner alone), so the thread page says it here, for its
 * doc, while it is open, and the sheet asks for the doc in the address: what
 * one doc allows never carries over to another.
 */
const moderated = new Map<string, number>()

/** The thread page of docId says whether its reader moderates; the returned function takes it back. */
export function setPhoneModerator(docId: string, on: boolean): () => void {
    if (!on || !docId) return () => {}
    moderated.set(docId, (moderated.get(docId) ?? 0) + 1)
    return () => {
        const n = (moderated.get(docId) ?? 1) - 1
        if (n > 0) moderated.set(docId, n)
        else moderated.delete(docId)
    }
}

export function isPhoneModerator(docId: string | undefined): boolean {
    return !!docId && moderated.has(docId)
}
