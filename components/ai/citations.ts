/**
 * Citations, numbered by first use (hub.md S11 and AI8). Shared by the AI
 * panel and the search answer, so a marker means the same thing in both.
 *
 * A model cites its sources as [1], [2]... in the order it was handed them,
 * which is not the order it uses them: an answer could open with [3]. The
 * reader numbers by what they meet first, so markers are renumbered by first
 * appearance, the source chips follow that order, and every marker that
 * survives points at a chip. A marker naming a source that does not exist is
 * dropped rather than shown as a number that opens nothing.
 */

/** Matches a citation marker, [n], that is not a Markdown link's text. */
export const CITE_RE = /\[(\d{1,2})\](?!\()/g

export interface CitationNumbers {
  /** Source indexes (0-based, into the list the server sent) in first-use order. */
  order: number[]
  /** The model's number (1-based) to the number shown. */
  shown: Map<number, number>
}

export function numberCitations(text: string, sourceCount: number): CitationNumbers {
  const order: number[] = []
  const shown = new Map<number, number>()
  for (const m of text.matchAll(CITE_RE)) {
    const n = Number(m[1])
    if (n < 1 || n > sourceCount || shown.has(n)) continue
    order.push(n - 1)
    shown.set(n, order.length)
  }
  return { order, shown }
}

/**
 * The sources as chips: the cited ones in the order they are first cited,
 * numbered 1, 2, 3..., then the rest, unnumbered, in the server's order.
 */
export function orderSources<T>(sources: T[], numbers: CitationNumbers): Array<{ source: T; n?: number; index: number }> {
  const cited = numbers.order.map((index, i) => ({ source: sources[index], n: i + 1, index }))
  const citedSet = new Set(numbers.order)
  const rest = sources.map((source, index) => ({ source, index })).filter((s) => !citedSet.has(s.index))
  return [...cited, ...rest]
}
