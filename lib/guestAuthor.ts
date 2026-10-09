import { decodeHtmlEntities } from "@/lib/utils/decodeHtmlEntities"
import { getNameInitials } from "@/lib/utils/getNameInitials"

/**
 * A channel guest's message, read as the guest's own.
 *
 * Guests are never users: everything one writes is posted by the single
 * "Guests" bot, led by a bold label naming them (botpost.LabelledHTML on the
 * server):
 *
 *   <p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good</p>
 *
 * Drawn as stored, that read as "Guests" said "[Priya (Acme) (guest)] Looks
 * good", with a Guest badge on top: "guest" twice and the person buried in the
 * text. The label stays in what is stored, because every surface that shows a
 * message without its author (search hits, quotes, notifications, an agent
 * reading the channel, the Slack bridge) still needs to say who wrote it. The
 * message list reads it back out instead: the author is "Priya (Acme)", the
 * body is only what she wrote. It works the same for messages written before
 * this, since their stored form is the same.
 */

export interface GuestAuthor {
  /** The guest's name as they gave it: "Priya (Acme)". */
  name: string
  /** What they wrote, without the label. */
  body: string
}

// The label as a paragraph of its own (what a guest's message always is), or
// inline before plain text. The label's text is HTML-escaped by the server and
// can hold neither "<" nor a closing tag, so it runs to "]</strong>" whatever
// brackets the name itself contains.
const BLOCK = /^\s*<p>\s*<strong>\[([^<]*)\]<\/strong>\s*<\/p>/i
const INLINE = /^\s*<p>\s*<strong>\[([^<]*)\]<\/strong>\s*/i

/** The name a guest's label carries, without the "(guest)" it ends in. */
function nameFromLabel(label: string): string {
  const name = decodeHtmlEntities(label)
    .replace(/\s*\(guest\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
  // "A guest" is what the server writes for someone who gave no name.
  return !name || /^a guest$/i.test(name) ? "Guest" : name
}

/**
 * The guest and their words in a message the Guests bot posted, or null when
 * the message carries no label (left as it is). Pure.
 */
export function splitGuestLabel(html: string | null | undefined): GuestAuthor | null {
  if (!html) return null
  const block = BLOCK.exec(html)
  if (block) {
    return { name: nameFromLabel(block[1]), body: html.slice(block[0].length).trim() }
  }
  const inline = INLINE.exec(html)
  if (inline) {
    return { name: nameFromLabel(inline[1]), body: "<p>" + html.slice(inline[0].length) }
  }
  return null
}

/**
 * A guest's initials, from their name without the company in brackets:
 * "Priya (Acme)" is "P", not "P(". Pure.
 */
export function guestInitials(name: string): string {
  const bare = name.replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
  return getNameInitials(bare) || "G"
}
