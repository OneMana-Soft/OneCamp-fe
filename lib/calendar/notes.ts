/**
 * An event's notes as the calendar keeps them: rich text (HTML) where they
 * came from the old forms' editor, a seed or Google Calendar, or plain text
 * where they were typed into a plain field. A field shows them as text with
 * their line breaks, and a change goes back in the form they were kept in,
 * so nothing written as rich text turns into tags, and nothing plain gains
 * them. Pure: no DOM, so it runs on the server and in tests alike.
 */

import { isRichNotes } from "@/lib/calendar/richNotes"

export { isRichNotes }

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£",
}

/** Character references as the characters they name; one it doesn't know stays as written. */
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code === 0xa0 ? 0x20 : code) : whole
    }
    return NAMED[ref.toLowerCase()] ?? whole
  })
}

/** A link's address: Google's redirect (google.com/url?q=…) as where it goes; only web, mail and phone links. */
function addressOf(attrs: string): string {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs)
  let href = decode((m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim())
  if (/^https?:\/\/(www\.)?google\.[a-z.]+\/url\?/i.test(href)) {
    try {
      href = new URL(href).searchParams.get("q") || href
    } catch {
      // Kept as written.
    }
  }
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : ""
}

/** An address without its scheme or a closing slash: "meet.example.com/abc" names https://meet.example.com/abc. */
const bare = (s: string) => s.replace(/^(https?:\/\/|mailto:|tel:)/i, "").replace(/\/$/, "").toLowerCase()

const BLOCK = /^(p|div|h[1-6]|blockquote|pre|table|thead|tbody|tr|section)$/

/**
 * Notes as a field shows them: plain text as it is; rich text with each
 * paragraph and break on a line of its own (an empty paragraph a blank
 * line), list items as "- " lines ("1. " when numbered, indented when
 * nested), a link that names something else followed by its address in
 * brackets, and character references as their characters.
 */
export function notesText(notes: string | undefined | null): string {
  if (!notes) return ""
  if (!isRichNotes(notes)) return notes
  const html = notes.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
  let out = ""
  const lists: { ordered: boolean; n: number }[] = []
  let link: { href: string; from: number } | null = null
  let para = -1
  const atLineStart = () => !out || out.endsWith("\n")
  const breakLine = () => {
    if (!atLineStart()) out += "\n"
  }
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+|<)/g)) {
    if (m[4] !== undefined) {
      // Text: a run of spaces and line ends is one space, as a page draws it, and none starts a line.
      const text = decode(m[4].replace(/\s+/g, " "))
      out += atLineStart() ? text.replace(/^ +/, "") : text
      continue
    }
    const closing = m[1] === "/"
    const tag = m[2].toLowerCase()
    if (tag === "br") out += "\n"
    else if (tag === "hr") breakLine()
    else if (tag === "a") {
      if (!closing) link = { href: addressOf(m[3]), from: out.length }
      else if (link) {
        const words = out.slice(link.from).trim()
        const href = link.href
        if (href && !/^(https?:\/\/|www\.)/i.test(words) && bare(words) !== bare(href)) out += words ? ` (${href})` : href
        link = null
      }
    } else if (tag === "ul" || tag === "ol") {
      if (closing) lists.pop()
      else lists.push({ ordered: tag === "ol", n: 0 })
      breakLine()
    } else if (tag === "li") {
      breakLine()
      if (!closing) {
        const list = lists[lists.length - 1]
        out += "  ".repeat(Math.max(0, lists.length - 1)) + (list?.ordered ? `${++list.n}. ` : "- ")
      }
    } else if ((tag === "td" || tag === "th") && closing) out += " "
    else if (BLOCK.test(tag)) {
      breakLine()
      if (tag === "p" && !closing) para = out.length
      else if (tag === "p" && closing && para === out.length) out += "\n"
    }
  }
  return out
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const escapeAttr = (s: string) => escape(s).replace(/"/g, "&quot;")

/** A line as rich text: its web addresses as links (a full stop or bracket after one is the sentence's). */
function richLine(line: string): string {
  let out = ""
  let at = 0
  for (const m of line.matchAll(/\bhttps?:\/\/[^\s<>"']+/g)) {
    let url = m[0]
    const trail = /[.,;:!?]+$/.exec(url)?.[0] ?? ""
    url = url.slice(0, url.length - trail.length)
    if (url.endsWith(")") && !url.includes("(")) url = url.slice(0, -1)
    out += escape(line.slice(at, m.index)) + `<a href="${escapeAttr(url)}">${escape(url)}</a>`
    at = m.index + url.length
  }
  return out + escape(line.slice(at))
}

/**
 * Text from a field, kept the way its notes were: as typed when they were
 * plain; as rich text when they were, a paragraph a line (an empty one for a
 * blank line) with its web addresses as links.
 */
export function storedNotes(text: string, rich: boolean): string {
  if (!rich) return text
  const body = text.replace(/\s+$/, "")
  if (!body.trim()) return ""
  return body
    .split("\n")
    .map((line) => (line.trim() ? `<p>${richLine(line)}</p>` : "<p></p>"))
    .join("")
}

/**
 * What a save sends for notes a field shows as `text` that opened on
 * `stored`: the notes as kept when the text is unchanged (rich text keeps
 * every mark it had), else the text in their form.
 */
export function notesToSave(text: string, stored: string): string {
  return text === notesText(stored) ? stored : storedNotes(text, isRichNotes(stored))
}
