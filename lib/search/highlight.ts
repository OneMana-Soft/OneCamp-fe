import { decodeHtmlEntities } from "@/lib/utils/removeHtmlTags"

/**
 * Search highlights, as text.
 *
 * The search server answers with fragments of the matched field, the match
 * wrapped in <mark> (older answers used <em>). The fields hold text that was
 * escaped when it was stored, so a fragment can read "everyone&#39;s", and the
 * highlighter even splits an entity when its digits match the query:
 * "everyone&#<mark>39</mark>;s". Rendered as HTML that showed the entity's
 * pieces; rendered as text it showed the tags.
 *
 * Here a fragment becomes runs of plain text, each either a hit or not, which
 * a component renders as text nodes and <mark> elements. No HTML from a hit is
 * ever handed to the DOM. Pure, so it is tested without one.
 */
export interface HighlightRun {
  text: string
  hit: boolean
}

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
const HIT_TAGS = new Set(["mark", "em"])
// Tags that end a line or a block: a space stands in for them, so two
// paragraphs don't run together ("today?Check-in").
const BREAK_TAGS = new Set(["br", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "td", "th", "pre"])
const ENTITY = /^&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/

export function highlightRuns(fragment: string | null | undefined): HighlightRun[] {
  if (!fragment) return []
  // 1. The raw text, character by character, each marked hit or not.
  const chars: string[] = []
  const hits: boolean[] = []
  let depth = 0
  let last = 0
  const push = (text: string) => {
    for (const ch of text) {
      chars.push(ch)
      hits.push(depth > 0)
    }
  }
  for (const m of fragment.matchAll(TAG)) {
    push(fragment.slice(last, m.index))
    last = (m.index ?? 0) + m[0].length
    const name = m[1].toLowerCase()
    const closing = m[0][1] === "/"
    if (HIT_TAGS.has(name)) depth = Math.max(0, depth + (closing ? -1 : 1))
    else if (BREAK_TAGS.has(name)) push(" ")
  }
  push(fragment.slice(last))

  // 2. Entities decoded over the whole text, so one split by a tag still
  //    decodes. A decoded character is a hit only when its "&" was: matching
  //    the digits of "&#39;" is not a match on the apostrophe.
  const outChars: string[] = []
  const outHits: boolean[] = []
  for (let i = 0; i < chars.length; ) {
    if (chars[i] === "&") {
      const rest = chars.slice(i, i + 12).join("")
      const m = ENTITY.exec(rest)
      if (m) {
        const decoded = decodeHtmlEntities(m[0])
        if (decoded !== m[0]) {
          for (const ch of decoded) {
            outChars.push(ch)
            outHits.push(hits[i])
          }
          i += [...m[0]].length
          continue
        }
      }
    }
    outChars.push(chars[i])
    outHits.push(hits[i])
    i++
  }

  // 3. Runs, with whitespace collapsed and the ends trimmed.
  const runs: HighlightRun[] = []
  let prevSpace = true
  for (let i = 0; i < outChars.length; i++) {
    let ch = outChars[i]
    if (/\s/.test(ch)) {
      if (prevSpace) continue
      ch = " "
      prevSpace = true
    } else {
      prevSpace = false
    }
    const hit = outHits[i] && ch !== " "
    const tail = runs[runs.length - 1]
    if (tail && tail.hit === hit) tail.text += ch
    else runs.push({ text: ch, hit })
  }
  // Trailing space.
  const tail = runs[runs.length - 1]
  if (tail) {
    tail.text = tail.text.replace(/\s+$/, "")
    if (!tail.text) runs.pop()
  }
  // A space between two hits belongs to neither ("Q4 launch" reads as one).
  return mergeSpacedHits(runs)
}

function mergeSpacedHits(runs: HighlightRun[]): HighlightRun[] {
  const out: HighlightRun[] = []
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    const prev = out[out.length - 1]
    const next = runs[i + 1]
    if (!r.hit && r.text === " " && prev?.hit && next?.hit) {
      prev.text += " " + next.text
      i++
      continue
    }
    if (prev && prev.hit === r.hit) prev.text += r.text
    else out.push({ ...r })
  }
  return out
}

/** A fragment as plain text, entities decoded and tags gone. */
export function highlightText(fragment: string | null | undefined): string {
  return highlightRuns(fragment)
    .map((r) => r.text)
    .join("")
}

/** Text as it is compared: entities decoded, tags gone, whitespace collapsed. */
function normalised(text: string): string {
  return highlightText(text)
}

/**
 * Whether a fragment is cut off before and after. Against the field's whole
 * text when the answer carries it (a message, a task's description): a
 * fragment that is the whole message gets no ellipsis at all. Otherwise by
 * its shape: the highlighter breaks at sentences, so a fragment that starts
 * with a capital and ends with a full stop is a whole sentence.
 */
export function fragmentEdges(fragmentText: string, fullText?: string | null): { before: boolean; after: boolean } {
  const frag = fragmentText.trim()
  if (!frag) return { before: false, after: false }
  if (fullText) {
    const full = normalised(fullText)
    const at = full.indexOf(frag)
    if (at >= 0) return { before: at > 0, after: at + frag.length < full.length }
  }
  return {
    before: !/^[\p{Lu}\p{N}"'“‘(\[@#]/u.test(frag),
    after: !/[.!?…:)"'”’]$/.test(frag),
  }
}
