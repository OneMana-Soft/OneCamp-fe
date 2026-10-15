/**
 * What a status may be, as the server's one rule has it
 * (business/User/emojiStatus.go, CheckEmojiStatus): an emoji from the
 * picker, 1 to STATUS_TEXT_MAX characters of words, and when it clears. The
 * menu keeps to it, so it never sends a status the server refuses. Pure.
 */

/** How long a status's words may be, in characters as the server counts them (code points: an emoji counts once). */
export const STATUS_TEXT_MAX = 100

/** The words' length as the server counts it, trimmed. */
export function statusTextLength(text: string): number {
  return Array.from(text.trim()).length
}

/** What is wrong with the words, in the server's own words, or "" for words it keeps. */
export function statusTextProblem(text: string): string {
  const n = statusTextLength(text)
  if (n === 0) return "Write a few words for your status."
  if (n > STATUS_TEXT_MAX) return `Keep your status to ${STATUS_TEXT_MAX} characters.`
  return ""
}

/**
 * A status's end as kept in the store and sent back by the server: an ISO
 * date, or undefined for one not known yet (a "Clear after" length the
 * server counts). The menu once stored epoch seconds here, which no reader
 * could parse: editing that status sent "NaN" and the server refused it.
 */
export function statusEndOf(at: Date | undefined): string | undefined {
  return at && !Number.isNaN(at.getTime()) ? at.toISOString() : undefined
}
