/**
 * A reader's keywords marked in a message body (chat P3 stage 3, TN-53).
 *
 * The same rule as the server's (helpers.KeywordPattern): the whole word, any
 * case, the keyword's characters taken literally; JavaScript's \b without the
 * u flag is ASCII, as Go's is, so a body marked here is one the server told
 * the reader of. Only text is marked: never a tag or an attribute, and never
 * the text inside a mention, a link or code. Drawn by the app's one <mark>
 * rule (app/globals.css), as search's matches are. Pure.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" }
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e])
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c])
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Elements whose text is never marked. */
const SKIP = /^(a|code|pre|mark)$/i
/** Elements that never close. */
const VOID = /^(br|img|hr|input|wbr|source|col|area)$/i
const isMention = (attrs: string) => /\bdata-type="(mention|channelMention|entityMention)"/.test(attrs)

const cache = new Map<string, RegExp | null>()

/** One pattern for all of a reader's keywords; null for none. */
function patternOf(keywords: readonly string[]): RegExp | null {
  const key = keywords.join("\u0000")
  if (cache.has(key)) return cache.get(key)!
  const parts = keywords.map((k) => k.trim()).filter(Boolean).map(escapeRegExp)
  // Longest first, so a phrase wins over a word inside it.
  parts.sort((a, b) => b.length - a.length)
  const re = parts.length ? new RegExp(`\\b(?:${parts.join("|")})\\b`, "gi") : null
  if (cache.size > 20) cache.clear()
  cache.set(key, re)
  return re
}

/** html with each of keywords marked <mark class="keyword-hit">. */
export function markKeywords(html: string, keywords: readonly string[] | undefined | null): string {
  if (!html || !keywords?.length) return html
  const re = patternOf(keywords)
  if (!re) return html
  // Tags and the text between them, in order.
  const tokens = html.split(/(<[^>]*>)/)
  // The open elements whose text is left alone: a stack of their tag names.
  const skipping: string[] = []
  let changed = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.startsWith("<")) {
      const m = /^<(\/?)([a-zA-Z][\w-]*)([^>]*)>$/.exec(t)
      if (!m) continue
      const [, close, name, attrs] = m
      if (close) {
        if (skipping.length && skipping[skipping.length - 1] === name.toLowerCase()) skipping.pop()
      } else if (!/\/$/.test(attrs) && !VOID.test(name) && (SKIP.test(name) || isMention(attrs) || skipping.length)) {
        skipping.push(name.toLowerCase())
      }
      continue
    }
    if (skipping.length) continue
    const text = decode(t)
    re.lastIndex = 0
    if (!re.test(text)) continue
    re.lastIndex = 0
    let out = ""
    let at = 0
    for (const m of text.matchAll(re)) {
      out += escapeHtml(text.slice(at, m.index)) + `<mark class="keyword-hit">${escapeHtml(m[0])}</mark>`
      at = m.index! + m[0].length
    }
    tokens[i] = out + escapeHtml(text.slice(at))
    changed = true
  }
  return changed ? tokens.join("") : html
}
