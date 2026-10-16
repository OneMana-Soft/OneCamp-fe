/**
 * How often a steady typer says they are still typing, and how long the
 * "is typing" line lasts after the last message about it.
 *
 * A person's composer says so at most every 3 s (hooks/usePublishTyping), and
 * an agent at work every 3 s (the API's mqttBusiness.TypingRepublishInterval).
 * The line lasts twice that, so it never blinks out between two messages,
 * even when one arrives late. At 4 s each way it did.
 */
export const TYPING_REPEAT_MS = 3000
export const TYPING_EXPIRY_MS = 2 * TYPING_REPEAT_MS

/**
 * The sweep for a tab the OS put to sleep (hooks/useTypingHandlers' timers
 * stop with it) drops lines older than this: a little past the expiry, so it
 * never races a timer about to clear the line anyway.
 */
export const TYPING_STALE_MS = Math.round(TYPING_EXPIRY_MS * 1.5)
