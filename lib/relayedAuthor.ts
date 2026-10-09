import { decodeHtmlEntities } from "@/lib/utils/decodeHtmlEntities"
import { getNameInitials } from "@/lib/utils/getNameInitials"

/**
 * A relayed person's message, read as their own.
 *
 * Two kinds of people write in a channel without being users: channel guests,
 * whose words the Guests bot posts, and people in a linked Slack channel,
 * whose words the Slack bot posts. Either way the message is led by a bold
 * label naming them (botpost.LabelledHTML on the server; the stored shape is
 * pinned by the backend's TestLabelledHTMLSurvivesPosting):
 *
 *   <p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good</p>
 *   <p><strong>[Ana Ruiz]</strong></p><p>On it</p>
 *
 * Drawn as stored, that read as "Guests" said "[Priya (Acme) (guest)] Looks
 * good", with a Guest tag on top: "guest" twice and the person buried in the
 * text. The label stays in what is stored, because every surface that shows a
 * message without its author (quotes, notifications, an agent reading the
 * channel) still needs to say who wrote it. Where the app shows an author it
 * reads the label back out instead: the author is "Priya (Acme)", the body is
 * only what she wrote. Messages written before this read the same way, since
 * their stored form is the same.
 *
 * Only a message whose author is the Guests or Slack bot is read this way (by
 * the bot's kind), so nobody else's bold "[Name]" line can pass them off as
 * someone else.
 */

/** Who relays: a channel guest ("guest") or a person in Slack ("bridge"). */
export type RelayKind = "guest" | "bridge"

export interface RelayedAuthor {
  /** The person's name as the label gives it: "Priya (Acme)", "Ana Ruiz". */
  name: string
  /** What they wrote, without the label. */
  body: string
  kind: RelayKind
}

/** The relay a bot of this kind is, or null for every other author. */
export function relayKindOf(botKind: string | null | undefined): RelayKind | null {
  return botKind === "guest" || botKind === "bridge" ? botKind : null
}

// The label as a paragraph of its own (what a relayed message always is), or
// inline before plain text. The label's text is HTML-escaped by the server and
// can hold neither "<" nor a closing tag, so it runs to "]</strong>" whatever
// brackets the name itself contains.
const BLOCK = /^\s*<p>\s*<strong>\[([^<]*)\]<\/strong>\s*<\/p>/i
const INLINE = /^\s*<p>\s*<strong>\[([^<]*)\]<\/strong>\s*/i

/** The name a label carries: for a guest, without the "(guest)" it ends in. */
function nameFromLabel(label: string, kind: RelayKind): string {
  let name = decodeHtmlEntities(label).replace(/\s+/g, " ").trim()
  if (kind === "guest") {
    name = name.replace(/\s*\(guest\)$/i, "").trim()
    // "A guest" is what the server writes for someone who gave no name.
    return !name || /^a guest$/i.test(name) ? "Guest" : name
  }
  return name || "Someone in Slack"
}

/**
 * The person and their words in a message a relaying bot posted (stored
 * HTML), or null when it carries no label or the kind is no relay. Pure.
 */
export function splitRelayLabel(html: string | null | undefined, kind: RelayKind | null): RelayedAuthor | null {
  if (!html || !kind) return null
  const block = BLOCK.exec(html)
  if (block) {
    return { name: nameFromLabel(block[1], kind), body: html.slice(block[0].length).trim(), kind }
  }
  const inline = INLINE.exec(html)
  if (inline) {
    return { name: nameFromLabel(inline[1], kind), body: "<p>" + html.slice(inline[0].length), kind }
  }
  return null
}

/** splitRelayLabel for an author's bot kind, as the server names kinds. Pure. */
export function relayedAuthorOf(botKind: string | null | undefined, html: string | null | undefined): RelayedAuthor | null {
  return splitRelayLabel(html, relayKindOf(botKind))
}

// The label in text whose tags were stripped (search hits): "[Priya (Acme)
// (guest)]Looks good". A guest's label ends in " (guest)]" (or is "[A
// guest]"), so a name with brackets in it is still read whole; a Slack
// person's runs to the first "]". Search highlights may wrap words of it in
// <em>, so those tags are allowed inside.
const EM = "(?:<\\/?em>)*"
const PLAIN: Record<RelayKind, RegExp> = {
  guest: new RegExp(`^\\s*\\[(?:(.+?) \\(${EM}guest${EM}\\)|(${EM}A${EM} ${EM}guest${EM}))\\]\\s*`, "i"),
  bridge: /^\s*\[([^\]]+)\]\s*/,
}

/**
 * The person and their words in a relayed message's plain text, as search
 * indexes it (tags gone, entities kept), or null. Works on a highlighted hit
 * too; the name then comes without its highlight. Pure.
 */
export function splitPlainRelayLabel(text: string | null | undefined, kind: RelayKind | null): RelayedAuthor | null {
  if (!text || !kind) return null
  const m = PLAIN[kind].exec(text)
  if (!m) return null
  const label = (m[1] ?? m[2] ?? "").replace(/<\/?em>/gi, "")
  return { name: nameFromLabel(label, kind), body: text.slice(m[0].length), kind }
}

/**
 * A relayed person's initials, from their name without anything in brackets:
 * "Priya (Acme)" is "P", not "P(". Pure.
 */
export function relayInitials(name: string): string {
  const bare = name.replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
  return getNameInitials(bare) || "?"
}
