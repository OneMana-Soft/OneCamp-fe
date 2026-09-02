/**
 * Which conversation this browser was last in.
 *
 * A reload used to drop the assistant back to a blank panel with no way back,
 * because the conversation only ever existed in React state. The id is the
 * whole of what is kept: the messages are read back from the server, so what
 * returns after a refresh is the same conversation the server has, not a copy
 * of it that can drift.
 *
 * Per browser by design. localStorage is unavailable in a private window or
 * when site data is blocked, and every access here tolerates that by returning
 * to the blank panel, which is exactly the old behaviour.
 */
const KEY = "onecamp.ai.lastConversation";

export function rememberConversation(sessionId: string): void {
    try {
        window.localStorage.setItem(KEY, sessionId);
    } catch {
        // A browser that refuses storage still gets a working assistant.
    }
}

export function readLastConversation(): string | null {
    try {
        return window.localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

export function forgetConversation(): void {
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // Nothing stored is the same outcome as nothing removed.
    }
}
