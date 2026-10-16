import { plainText } from "@/lib/chat/pendingSend"
import { clockTime } from "@/lib/utils/date/clock"
import { type PersonNameFields } from "@/lib/personName"
import { messageAuthorName } from "@/lib/utils/userDisplayName"

const INLINE_TAG = /<\/?(a|b|strong|i|em|u|s|del|code|span|mark|sub|sup)(\s[^>]*)?>/gi

/** How many characters of a message a summary reads out, as Slack's does. */
export const SUMMARY_CHARS = 160

/**
 * What a screen reader hears for a message (SD-53, SD-54), as Slack's message
 * summary: who wrote it, when, and what it says (its first 160 characters),
 * with its files counted. The row's label in the message list, and what the
 * list announces when one arrives live. Pure.
 */
export function messageSummary({ from, at, html, files = 0 }: { from?: PersonNameFields | null; at?: string; html?: string; files?: number }): string {
  // Inline markup goes without a trace ("in</strong>," reads "in,"); blocks
  // still part words (plainText).
  const words = plainText((html || "").replace(INLINE_TAG, ""))
  const text = words.length > SUMMARY_CHARS ? `${words.slice(0, SUMMARY_CHARS - 1)}…` : words
  const attached = files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : ""
  const said = [text, attached].filter(Boolean).join(", ")
  const who = [messageAuthorName(from) || "Someone", at ? clockTime(at) : ""].filter(Boolean).join(", ")
  return said ? `${who}: ${said}` : who
}
