/**
 * How Find matches a query in text, shared by a doc's Find and Replace
 * (components/minimal-tiptap/extensions/find-replace) and a board's
 * (lib/board/findOnBoard): the query taken literally, Match case, Whole word,
 * and the cap on how many matches are found. Pure: no editor and no canvas.
 */

/** Find's two options. */
export interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

/** At most this many matches are found (a count past it reads "5,000+"). */
export const MAX_MATCHES = 5000

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The pattern a query is searched with. Null for an empty query. */
export function patternOf(query: string, { caseSensitive, wholeWord }: FindOptions): RegExp | null {
  if (!query) return null
  const body = escape(query)
  // A whole word is one no letter, digit or underscore touches, in any script.
  const src = wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body
  return new RegExp(src, caseSensitive ? "gu" : "giu")
}

/** A match in a text: where it starts and how long it is. */
export interface TextMatch {
  index: number
  length: number
}

/** Every match of a pattern (global) in a text, in order, at most `limit`. An empty match is never one. */
export function matchesIn(text: string, re: RegExp, limit = MAX_MATCHES): TextMatch[] {
  const out: TextMatch[] = []
  re.lastIndex = 0
  for (let m = re.exec(text); m && out.length < limit; m = re.exec(text)) {
    if (m[0] === "") {
      re.lastIndex++
      continue
    }
    out.push({ index: m.index, length: m[0].length })
  }
  return out
}
