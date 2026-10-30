/**
 * What a board's exports hold (miro-36), worked out from its elements. Pure:
 * the export dialog (components/board/boardExport) reads the scene and the
 * shared document, and saves what these make.
 *
 * - Notes as CSV: each note's words, maker, colour, tags, frame, task and,
 *   once a vote has closed, its votes: a vote still open stays hidden, as it
 *   does on the board. A note from before makers were kept has an empty maker.
 * - Frames as PDF pages: the frames in the Frames panel's order.
 */

import { csvLine } from "@/lib/csv"
import { orderFrames, type Box } from "@/lib/board/frames"
import { NOTE_COLOURS, isStickyNote, noteColourOf, type BoardElementLike } from "@/lib/board/notes"
import { noteTags } from "@/lib/board/sticky"
import { tally } from "@/lib/board/facilitation"
import { authorName } from "@/lib/board/authors"
import { app_task_path } from "@/types/paths"

/** An element as the exports read it. */
export type ExportElement = BoardElementLike &
  Box & {
    type: string
    frameId?: string | null
    name?: string | null
    text?: string
    originalText?: string
    backgroundColor?: string
  }

/** One note, as a row of the CSV. */
export interface NoteRow {
  id: string
  text: string
  /** Its maker's name (lib/board/authors); "" for a note from before makers were kept. */
  author: string
  colour: string
  tags: string[]
  frame: string
  task: string
  votes: number | null
}

/** A note's own words: what was typed, not how it wraps. */
function wordsOf(el: ExportElement, byId: Map<string, ExportElement>): string {
  const bound = el.boundElements?.find((b) => b.type === "text")
  const t = bound ? byId.get(bound.id) : undefined
  if (!t || t.isDeleted) return ""
  return (t.originalText ?? t.text ?? "").trim()
}

/**
 * The board's notes, each with what the CSV says of it: frames in the
 * panel's order (frameOrder), then the notes in no frame; in each, top to
 * bottom and left to right. votes are the closed round's counts, by note;
 * authors, the board's note makers (NOTE_AUTHORS), by note.
 */
export function noteRows(
  elements: readonly ExportElement[],
  frameOrder: readonly string[] | null | undefined,
  votes: ReadonlyMap<string, number> | null,
  origin = "",
  authors: { get(id: string): unknown } | null = null,
): NoteRow[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const frames = orderFrames(elements.filter((e) => e.type === "frame" && !e.isDeleted), frameOrder)
  const rank = new Map(frames.map((f, i) => [f.id, i]))
  const notes = elements.filter((e) => isStickyNote(e as never))
  const where = (e: ExportElement) => (e.frameId && rank.has(e.frameId) ? rank.get(e.frameId)! : frames.length)
  notes.sort((a, b) => where(a) - where(b) || a.y - b.y || a.x - b.x)
  return notes.map((el) => {
    const colour = noteColourOf(el)
    const task = typeof el.customData?.taskUuid === "string" ? `${origin}${app_task_path}/${el.customData.taskUuid}` : ""
    return {
      id: el.id,
      text: wordsOf(el, byId),
      author: authors ? authorName(authors.get(el.id)) : "",
      colour: colour ? NOTE_COLOURS[colour].label : (el.backgroundColor ?? ""),
      tags: noteTags(el as never),
      frame: el.frameId ? (byId.get(el.frameId)?.name ?? "") : "",
      task,
      votes: votes ? (votes.get(el.id) ?? 0) : null,
    }
  })
}

/** The notes as CSV, a header first; a Votes column only when a vote has closed. */
export function notesCsv(rows: readonly NoteRow[], withVotes: boolean): string {
  const head = ["Note", "Author", "Colour", "Tags", "Frame", "Task"]
  if (withVotes) head.push("Votes")
  const lines = [csvLine(head)]
  for (const r of rows) {
    const cells: (string | number)[] = [r.text, r.author, r.colour, r.tags.join("; "), r.frame, r.task]
    if (withVotes) cells.push(r.votes ?? 0)
    lines.push(csvLine(cells))
  }
  return lines.join("\r\n") + "\r\n"
}

/** The closed round's votes per note (live notes only), from the board's facilitation and votes maps; null while none has closed. */
export function closedVotes(voting: unknown, votes: Iterable<[string, unknown]>, live: ReadonlySet<string>): Map<string, number> | null {
  const v = voting as { id?: unknown; closedAt?: unknown } | null | undefined
  if (!v || typeof v.id !== "string" || typeof v.closedAt !== "number") return null
  return new Map(tally(votes, v.id, live).map((r) => [r.id, r.count]))
}

/** The frames a PDF prints, a page each, in the Frames panel's order. */
export function pdfFrames<T extends ExportElement>(elements: readonly T[], frameOrder: readonly string[] | null | undefined): T[] {
  return orderFrames(elements.filter((e) => e.type === "frame" && !e.isDeleted), frameOrder)
}
