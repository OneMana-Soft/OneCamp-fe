/**
 * Find and replace on a board (miro-05 to_win 2 and 3): a board's words
 * matched as a doc's Find matches them (lib/text/findPattern), where each
 * match's light falls on the canvas, and what Replace writes. Pure: the
 * canvas's measure is handed in (components/board/findPanel).
 *
 * A board's words are its frames' names and its text elements' words: a
 * note's or a shape's own words (bound text), an arrow's label, and words on
 * their own. A match is listed as the person sees it: on the frame, the note,
 * shape or arrow holding the words, or the words themselves. Frames come
 * first, each followed by what is in it from the top, then everything outside
 * a frame from the top, as the board's text is indexed for search
 * (business/Board/boardText.go).
 */

import { isStickyNote } from "@/lib/board/notes"
import { MAX_MATCHES, matchesIn, patternOf, type FindOptions } from "@/lib/text/findPattern"

/** What Find reads of an element (Excalidraw's own elements have all of it). */
export interface FindElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  frameId?: string | null
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  customData?: Record<string, unknown>
  backgroundColor?: string
  /** A text element's words as drawn, wrapped. */
  text?: string
  /** A text element's words as typed. */
  originalText?: string
  /** A frame's name. */
  name?: string | null
  fontSize?: number
  lineHeight?: number
  textAlign?: string
}

export type FindKind = "frame" | "note" | "shape" | "arrow" | "text"

export interface BoardMatch {
  /** The element the words are on: a text element, or a frame (its name). */
  id: string
  /** Where a jump goes and what it selects: the frame, the note, shape or arrow the words are in, or the words. */
  target: string
  kind: FindKind
  /** Where the match starts in the words as typed (a frame's name), and how long it is. */
  index: number
  length: number
  /** The frame it is in (a frame's own name: that frame). */
  frameId: string | null
  /** The match among the words around it, for the list. */
  preview: { before: string; hit: string; after: string }
}

/** Whether an element is a frame, Excalidraw's own or its magic one: its name is words on the board. */
export const isFrame = (el: { type: string }) => el.type === "frame" || el.type === "magicframe"

/** The words an element holds for Find: a frame's name, a text element's words as typed. */
export function wordsOf(el: FindElement): string {
  if (isFrame(el)) return el.name ?? ""
  return el.type === "text" ? (el.originalText ?? el.text ?? "") : ""
}

/** Characters of context a listed match shows before it (twice that after). */
const AROUND = 24

function previewOf(words: string, index: number, length: number): BoardMatch["preview"] {
  const start = Math.max(0, index - AROUND)
  const end = Math.min(words.length, index + length + AROUND * 2)
  const flat = (s: string) => s.replace(/\s+/g, " ")
  return {
    before: (start > 0 ? "…" : "") + flat(words.slice(start, index)).trimStart(),
    hit: words.slice(index, index + length),
    after: flat(words.slice(index + length, end)) + (end < words.length ? "…" : ""),
  }
}

/** Every match of a query in a board's words, as listed (see the top), at most MAX_MATCHES. */
export function findOnBoard(elements: readonly FindElement[], query: string, options: FindOptions): BoardMatch[] {
  const re = patternOf(query, options)
  if (!re) return []
  const live = elements.filter((e) => !e.isDeleted)
  const byId = new Map(live.map((e) => [e.id, e]))
  const top = (a: FindElement, b: FindElement) => a.y - b.y || a.x - b.x
  const frameRank = new Map(live.filter(isFrame).sort(top).map((f, i) => [f.id, i]))
  const rows = live
    .filter((el) => wordsOf(el) !== "")
    .map((el) => {
      const holder = !isFrame(el) && el.containerId ? byId.get(el.containerId) : undefined
      const target = holder ?? el
      const kind: FindKind = isFrame(el) ? "frame" : !holder ? "text" : holder.type === "arrow" ? "arrow" : isStickyNote(holder) ? "note" : "shape"
      const frameId = isFrame(el) ? el.id : (target.frameId ?? el.frameId ?? null)
      const group = frameId !== null && frameRank.has(frameId) ? frameRank.get(frameId)! : frameRank.size
      return { el, target, kind, frameId: frameId !== null && frameRank.has(frameId) ? frameId : null, group, own: isFrame(el) ? 0 : 1 }
    })
    .sort((a, b) => a.group - b.group || a.own - b.own || top(a.target, b.target))
  const out: BoardMatch[] = []
  for (const r of rows) {
    const words = wordsOf(r.el)
    for (const m of matchesIn(words, re, MAX_MATCHES - out.length)) {
      out.push({ id: r.el.id, target: r.target.id, kind: r.kind, index: m.index, length: m.length, frameId: r.frameId, preview: previewOf(words, m.index, m.length) })
    }
    if (out.length >= MAX_MATCHES) break
  }
  return out
}

/** A line's share of a match, from the words' top left, as Excalidraw's appState.searchMatches holds it. */
export interface MatchedLine {
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/** Excalidraw's appState.searchMatches entry: it lights each line of a match on the canvas, turned with its words. */
export interface SearchMatch {
  id: string
  focus: boolean
  matchedLines: MatchedLine[]
}

/** The width of some of an element's words in its own font (the canvas's measureText, in the panel). */
export type MeasureWords = (text: string, el: FindElement) => number

/**
 * The drawn lines, each padded back to the typed words' indices where a wrap
 * ate a space or a typed line break, as Excalidraw 0.18.1's own search pads
 * them (normalizeWrappedText): line n then starts where its words start in
 * the typed text.
 */
function paddedLines(drawn: string, typed: string): string[] {
  const lines = drawn.split("\n")
  const out: string[] = []
  let at = 0
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const next = lines[i + 1]
    if (next) {
      const nextAt = typed.indexOf(next, at)
      if (nextAt > line.length + at) line += " ".repeat(nextAt - (line.length + at))
    }
    out.push(line)
    at += line.length
  }
  return out
}

/**
 * Where a match's light falls on its words: a box a line, across the lines the
 * words wrap onto, shifted by the words' alignment. A port of Excalidraw
 * 0.18.1's getMatchedLines (it exports no measure), except that an aligned
 * line is measured as drawn, without the padding.
 */
export function matchedLinesOf(el: FindElement, index: number, length: number, measure: MeasureWords): MatchedLine[] {
  const typed = el.originalText ?? el.text ?? ""
  const drawn = el.text ?? typed
  const lines = paddedLines(drawn, typed)
  const shown = drawn.split("\n")
  const height = (el.fontSize ?? 20) * (el.lineHeight ?? 1.25)
  const out: MatchedLine[] = []
  let start = index
  let left = length
  let lineStart = 0
  for (let n = 0; n < lines.length && left > 0; n++) {
    const line = lines[n]
    const lineEnd = lineStart + line.length
    if (start >= lineStart && start < lineEnd) {
      const take = Math.min(left, lineEnd - start)
      const before = line.slice(0, start - lineStart)
      let offsetX = before ? measure(before, el) : 0
      if ((el.textAlign === "center" || el.textAlign === "right") && shown[n]) {
        const room = el.width - measure(shown[n], el)
        offsetX += el.textAlign === "center" ? room / 2 : room
      }
      out.push({ offsetX, offsetY: n * height, width: measure(line.slice(start - lineStart, start - lineStart + take), el), height })
      start += take
      left -= take
    }
    lineStart = lineEnd
  }
  return out
}

/** The canvas's lights for a list of matches: each match's words lit, the current one focused. A frame's name can't be lit. */
export function searchMatchesOf(elements: readonly FindElement[], matches: readonly BoardMatch[], current: number, measure: MeasureWords): SearchMatch[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const out: SearchMatch[] = []
  matches.forEach((m, i) => {
    const el = byId.get(m.id)
    if (el && el.type === "text" && !el.isDeleted) out.push({ id: m.id, focus: i === current, matchedLines: matchedLinesOf(el, m.index, m.length, measure) })
  })
  return out
}

/**
 * What Replace writes: by element, its words with the given matches replaced
 * (a frame's new name, a text element's new words as typed). The replacement
 * is taken literally: a "$&" stays a "$&". A match whose words have changed
 * since it was found is left alone.
 */
export function replaceOnBoard(elements: readonly FindElement[], matches: readonly BoardMatch[], replacement: string): Map<string, string> {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const byElement = new Map<string, BoardMatch[]>()
  for (const m of matches) byElement.set(m.id, [...(byElement.get(m.id) ?? []), m])
  const out = new Map<string, string>()
  for (const [id, found] of byElement) {
    const el = byId.get(id)
    if (!el || el.isDeleted) continue
    let words = wordsOf(el)
    let changed = false
    // From the last, so each earlier match still starts where it was found.
    for (const m of [...found].sort((a, b) => b.index - a.index)) {
      if (words.slice(m.index, m.index + m.length) !== m.preview.hit) continue
      words = words.slice(0, m.index) + replacement + words.slice(m.index + m.length)
      changed = true
    }
    if (changed) out.set(id, words)
  }
  return out
}

/**
 * What Undo of a Replace writes: by element, its words from before, for each
 * element whose words are still the ones the Replace wrote. One changed or
 * deleted since keeps what it has.
 */
export function unreplaceOnBoard(elements: readonly FindElement[], wrote: ReadonlyMap<string, string>, before: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const el of elements) {
    const was = before.get(el.id)
    if (was !== undefined && !el.isDeleted && wordsOf(el) === wrote.get(el.id)) out.set(el.id, was)
  }
  return out
}

/**
 * What Find keeps clear while it dims the rest of the board (V-271): each match's words and what they are in (its
 * target: the frame, the note, shape or arrow), once each, in the order found. Pure.
 */
export function keptOf(matches: readonly BoardMatch[]): string[] {
  const ids = new Set<string>()
  for (const m of matches) {
    ids.add(m.id)
    ids.add(m.target)
  }
  return [...ids]
}
