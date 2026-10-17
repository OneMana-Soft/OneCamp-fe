/**
 * Doc comment events, from the one MQTT router to the threads a page shows
 * (docs programme B7). useDocMessageHandlers parses each comment and reaction
 * event once and hands it here; the threads of that doc (useThreads) listen
 * while something shows them. Nothing is kept: a doc whose threads aren't
 * shown reads them fresh when they are.
 *
 * It replaces the doc comment store (createDocCommentSlice), which every page
 * carried for these events. This module is on every page's first load, so it
 * stays this small: the threads code loads with the doc.
 */

/** Who reacted, as the event names them. */
interface EventPerson {
    user_uuid: string
    user_name: string
    user_profile_object_key?: string
}

type DocCommentEvent =
    /** A comment was written: in a thread (its own event names the thread), or on the page the old way. */
    | { kind: "created"; docId: string; commentId: string }
    | { kind: "edited"; docId: string; commentId: string; html: string; at?: string }
    | { kind: "deleted"; docId: string; commentId: string }
    /** A reaction added, or one person's reaction changed to another emoji (the same id). */
    | { kind: "reacted"; docId: string; commentId: string; reactionId: string; emojiId: string; by: EventPerson }
    | { kind: "unreacted"; docId: string; commentId: string; reactionId: string }

type Listener = (event: DocCommentEvent) => void

const listeners = new Map<string, Set<Listener>>()

/** Listens for one doc's comment events; the returned function stops listening. */
export function onDocCommentEvent(docId: string, listener: Listener): () => void {
    let set = listeners.get(docId)
    if (!set) listeners.set(docId, (set = new Set()))
    set.add(listener)
    return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(docId)
    }
}

/** Hands one event to its doc's listeners; one that throws stops no other. */
export function emitDocCommentEvent(event: DocCommentEvent): void {
    if (!event.docId || !event.commentId) return
    for (const listener of [...(listeners.get(event.docId) ?? [])]) {
        try {
            listener(event)
        } catch (error) {
            console.error("[docComments] a listener failed:", error)
        }
    }
}
