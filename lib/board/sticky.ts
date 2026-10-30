/**
 * The sticky tool's rules (lib/board/notes has the note itself): tags and
 * their colours, where the next note goes, a pasted list into notes, tidying
 * a selection into a grid, and clustering it by tag or colour. Pure. Loaded
 * with the board's tools, never on the board's first screen.
 */

import { FRAME_PAD, layoutFrame } from "./frames"
import { ALL_NOTE_COLOURS, NOTE_COLOURS, NOTE_SIZES, isStickyNote, noteColourOf, type BoardElementLike, type NoteColourId } from "./notes"

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** At most this many tags a note, each this long. Miro's tags are short words too. */
export const MAX_TAGS = 8
export const MAX_TAG_LENGTH = 32

/** A tag's key: a tag is one tag whatever its case ("Risk" and "risk"), on a note, in a filter and in a list. Pure. */
export const tagKey = (tag: string): string => tag.toLowerCase()

/** The keys of some tags, to match others against (tagKey). Pure. */
export const tagKeys = (tags: readonly string[]): Set<string> => new Set(tags.map(tagKey))

/** Whether any of `tags` is one of `wanted` (keys from tagKeys). Pure. */
export const hasAnyTag = (tags: readonly string[], wanted: ReadonlySet<string>): boolean => tags.some((t) => wanted.has(tagKey(t)))

/** `tags` without `tag`, whatever its case. Pure. */
export const withoutTag = (tags: readonly string[], tag: string): string[] => tags.filter((t) => tagKey(t) !== tagKey(tag))

/** Tags as stored: trimmed, without a leading #, case kept, no repeats (by case), at most MAX_TAGS. Pure. */
export function normaliseTags(tags: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tags) {
    if (typeof t !== "string") continue
    const tag = t.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || seen.has(tagKey(tag))) continue
    seen.add(tagKey(tag))
    out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** A note's tags. */
export function noteTags(el: { customData?: Record<string, unknown> }): string[] {
  const t = el.customData?.tags
  return Array.isArray(t) ? normaliseTags(t) : []
}

/** Every tag on a board, most used first, then by name. Pure. */
export function boardTags(elements: readonly (BoardElementLike & { backgroundColor?: string })[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const el of elements) {
    if (!isStickyNote(el)) continue
    for (const tag of noteTags(el)) {
      const k = tagKey(tag)
      const cur = counts.get(k)
      if (cur) cur.count++
      else counts.set(k, { tag, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Where a board keeps the hue picked for a tag (components/board/tagHues reads it): its "boardMeta" map, one key a tag, so two people colouring two tags never undo each other. */
export const TAG_HUE_KEY = "tagHue:"

// ---------------------------------------------------------------------------
// Placing notes
// ---------------------------------------------------------------------------

/** The gap between notes laid side by side. */
export const NOTE_GAP = 24

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * Where the next note goes beside `from`: to its right (or below), past any
 * shape already there, so a quick run of notes never lands on top of
 * another. Pure.
 */
export function nextNoteSpot(from: Box, taken: readonly Box[], direction: "right" | "below" = "right", size = from.width): { x: number; y: number } {
  const step = (direction === "right" ? from.width : from.height) + NOTE_GAP
  for (let i = 1; i <= 50; i++) {
    const spot = direction === "right" ? { x: from.x + step * i, y: from.y } : { x: from.x, y: from.y + step * i }
    const box = { ...spot, width: size, height: size }
    if (!taken.some((t) => overlaps(box, t))) return spot
  }
  return direction === "right" ? { x: from.x + step, y: from.y } : { x: from.x, y: from.y + step }
}

/**
 * Notes from pasted text, one per line, as Miro's bulk mode makes them:
 * blank lines skipped, list marks ("- ", "* ", "• ", "1. ", "[ ] ") dropped,
 * at most `max`. Pure.
 */
export function notesFromText(text: string, max = 100): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*(?:[-*•‣◦]|\d+[.)]|\[[ xX]?\])\s+/, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!line) continue
    out.push(line.slice(0, 500))
    if (out.length === max) break
  }
  return out
}

/** How many columns a grid of n notes takes: about square, a little wider than tall. Pure. */
export function gridColumns(n: number): number {
  if (n <= 1) return 1
  return Math.min(n, Math.ceil(Math.sqrt(n * 1.5)))
}

/** The top-left corners of n notes in a grid, in reading order, centred on (cx, cy). Pure. */
export function noteGrid(n: number, cx: number, cy: number, side: number = NOTE_SIZES.m, gap = NOTE_GAP): { x: number; y: number }[] {
  const cols = gridColumns(n)
  const rows = Math.ceil(n / cols)
  const w = cols * side + (cols - 1) * gap
  const h = rows * side + (rows - 1) * gap
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (side + gap), y: y0 + Math.floor(i / cols) * (side + gap) }))
}

/**
 * Tidy up: the selected notes in an even grid, in reading order (rows by
 * their middles, then left to right), from the top left of where they are
 * now. A row stays a row and a column a column; anything else takes as many
 * columns as its widest row. Returns each note's new top left, by id. Pure.
 */
export function tidyNotes(notes: readonly (Box & { id: string })[], gap = NOTE_GAP): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (notes.length === 0) return out
  const cell = Math.max(...notes.map((n) => Math.max(n.width, n.height)))
  const sorted = [...notes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x)
  const rows: (Box & { id: string })[][] = []
  for (const n of sorted) {
    const mid = n.y + n.height / 2
    const row = rows.find((r) => Math.abs(r[0].y + r[0].height / 2 - mid) < cell / 2)
    if (row) row.push(n)
    else rows.push([n])
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x)
  const ordered = rows.flat()
  const cols = rows.length === 1 ? ordered.length : Math.max(...rows.map((r) => r.length))
  const left = Math.min(...notes.map((n) => n.x))
  const top = Math.min(...notes.map((n) => n.y))
  ordered.forEach((n, i) => {
    out.set(n.id, { x: left + (i % cols) * (cell + gap), y: top + Math.floor(i / cols) * (cell + gap) })
  })
  return out
}


// ---------------------------------------------------------------------------
// Clusters (miro-07 5)
// ---------------------------------------------------------------------------

export type ClusterBy = "tag" | "colour"

/** A group of notes a cluster makes, named as its frame will be. */
export interface ClusterGroup {
  key: string
  name: string
  ids: string[]
}

/**
 * Notes grouped for a cluster, by tag or by colour, as Miro's Cluster by Tag
 * and by Color group them, but with every group named, and every note in one
 * group only: by tag, a note goes with its first tag in the board's order
 * (most used first, as the Tags picker lists them; Miro copies a note into
 * each of its tags), and notes without a tag come last, as "No tag". By
 * colour, groups follow the palette's order and its names; notes in a colour
 * the palette doesn't have come last. Pure.
 */
export function clusterGroups(
  notes: readonly (BoardElementLike & { backgroundColor?: string })[],
  by: ClusterBy,
  tagOrder: readonly string[] = [],
): ClusterGroup[] {
  const groups = new Map<string, ClusterGroup>()
  const add = (key: string, name: string, id: string) => {
    const g = groups.get(key)
    if (g) g.ids.push(id)
    else groups.set(key, { key, name, ids: [id] })
  }
  if (by === "tag") {
    const rank = new Map(tagOrder.map((t, i) => [tagKey(t), i]))
    const named = new Map(tagOrder.map((t) => [tagKey(t), t]))
    const order = (k: string) => (k === "" ? Infinity : rank.get(k) ?? tagOrder.length)
    for (const n of notes) {
      const first = noteTags(n)
        .map(tagKey)
        .sort((a, b) => order(a) - order(b))[0]
      if (first === undefined) add("", "No tag", n.id)
      else add(first, named.get(first) ?? noteTags(n).find((t) => tagKey(t) === first)!, n.id)
    }
    return [...groups.values()].sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name))
  }
  for (const n of notes) {
    const c = noteColourOf(n)
    if (c) add(c, NOTE_COLOURS[c].label, n.id)
    else add("", "Other colours", n.id)
  }
  const order = (k: string) => (k === "" ? Infinity : ALL_NOTE_COLOURS.indexOf(k as NoteColourId))
  return [...groups.values()].sort((a, b) => order(a.key) - order(b.key))
}

/** The gap between two clusters' frames. */
export const CLUSTER_GAP = 64

/**
 * Where a cluster puts things: a frame a group, side by side from `at` (the
 * top left of where the notes were), each holding its notes in a grid about
 * as wide as tall, in reading order (lib/board/frames' layoutFrame). Returns
 * the frames' boxes and names in the groups' order, and each note's new top
 * left with its frame's place in that order. Pure.
 */
export function clusterLayout(
  groups: readonly ClusterGroup[],
  boxes: ReadonlyMap<string, Box>,
  at: { x: number; y: number },
  pad = FRAME_PAD,
  gap = NOTE_GAP,
): { frames: (Box & { name: string })[]; places: Map<string, { x: number; y: number; frame: number }> } {
  const frames: (Box & { name: string })[] = []
  const places = new Map<string, { x: number; y: number; frame: number }>()
  let x = at.x
  for (const g of groups) {
    const items = g.ids.flatMap((id) => {
      const b = boxes.get(id)
      return b ? [{ id, x: b.x, y: b.y, width: b.width, height: b.height }] : []
    })
    if (items.length === 0) continue
    const cell = Math.max(...items.map((b) => Math.max(b.width, b.height)))
    const cols = gridColumns(items.length)
    const box = { x, y: at.y, width: pad * 2 + cols * cell + (cols - 1) * gap, height: pad * 2 + cell }
    const laid = layoutFrame(box, items, "grid", pad, gap)
    for (const [id, p] of laid.positions) places.set(id, { ...p, frame: frames.length })
    frames.push({ ...box, width: laid.width, height: laid.height, name: g.name })
    x += laid.width + CLUSTER_GAP
  }
  return { frames, places }
}
