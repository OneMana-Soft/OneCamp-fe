/**
 * Notes on a board, read the way people see them: a sticky is a shape with
 * text bound inside it, and the text is a separate element. Selecting either
 * one means "this note". Pure, so turning notes into tasks is tested.
 *
 * A note made by the sticky tool, a template or an import also says so in
 * its customData ({ kind: "note", colour, tags }), which survives copy,
 * export and import; a shape with words in it still counts as a note for
 * voting and for tasks, as before.
 */

import { sceneFinder } from "@/lib/board/scene"

export interface BoardElementLike {
  id: string
  type: string
  text?: string
  isDeleted?: boolean
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  customData?: Record<string, unknown>
}

export interface SelectedNote {
  /** The element that represents the note: the container if there is one. */
  noteId: string
  text: string
  /** Set when this note already became a task, so it is not created twice. */
  taskUuid?: string
}

/**
 * What a "Make tasks" button says for n notes: the selection and frame bars'
 * and the dialog's alike ("Make a task", "Make 3 tasks"; "Make tasks" while
 * none is ticked). One rule, as two copies drifted ("Make task").
 */
export function makeTasksLabel(n: number): string {
  if (n === 1) return "Make a task"
  return n === 0 ? "Make tasks" : `Make ${n} tasks`
}

/**
 * The notes behind a selection, one per note, in scene order, with clean
 * text. Read from the selected elements and their partners (a note's words,
 * a word's note), never by walking the scene: the notes bar reads it on every
 * change while notes are selected, a teammate's included (W-4).
 */
export function selectedNotes(elements: readonly BoardElementLike[], selectedIds: Record<string, boolean>): SelectedNote[] {
  const ids = Object.keys(selectedIds).filter((id) => selectedIds[id])
  if (ids.length === 0) return []
  const find = sceneFinder(elements, ids.length * 2)
  const found = new Map<string, { at: number; note: SelectedNote }>()
  for (const id of ids) {
    const el = find.get(id)
    if (!el || el.isDeleted) continue
    let note: BoardElementLike | undefined
    let textEl: BoardElementLike | undefined
    if (el.type === "text") {
      textEl = el
      note = el.containerId ? find.get(el.containerId) ?? el : el
    } else {
      const bound = el.boundElements?.find((b) => b.type === "text")
      if (!bound) continue
      note = el
      textEl = find.get(bound.id)
    }
    if (!note || !textEl || note.isDeleted || textEl.isDeleted || found.has(note.id)) continue
    const text = (textEl.text ?? "").replace(/\s+/g, " ").trim()
    if (!text) continue
    const taskUuid = typeof note.customData?.taskUuid === "string" ? (note.customData.taskUuid as string) : undefined
    found.set(note.id, { at: Math.min(find.at(note.id), find.at(textEl.id)), note: { noteId: note.id, text: text.slice(0, 200), taskUuid } })
  }
  return [...found.values()].sort((a, b) => a.at - b.at).map((f) => f.note)
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * A note's colours: its paper, a hairline of the hue's strong cut, and the
 * hue's ink for its words, as a tag or an avatar wears its hue everywhere
 * else in the app. Hex, the light theme's values, because the board stores
 * them in the shared document; Excalidraw's dark theme inverts the canvas,
 * which turns a tint into a dark ground and an ink into a light one.
 */
export interface NoteColour {
  /** The name people see. */
  label: string
  fill: string
  edge: string
  ink: string
  /** Miro's name for the sticky colour this one keeps on import (its 16). */
  miro: MiroStickyColour
}

/** Miro's sticky-note colours (REST API v2, StickyNoteStyle.fillColor). */
export type MiroStickyColour =
  | "gray" | "light_yellow" | "yellow" | "orange" | "light_green" | "green" | "dark_green" | "cyan"
  | "light_pink" | "pink" | "violet" | "red" | "light_blue" | "blue" | "dark_blue" | "black"

/**
 * Sixteen colours, so each of Miro's sixteen comes over as itself. The first
 * six are the camp palette's (sun, moss, berry, sky, dusk, and the app's own
 * neutral), the ones the notes bar offers first; their ids are the ones the
 * templates and the demo's board have always stored.
 */
export const NOTE_COLOURS = {
  yellow: { label: "Yellow", fill: "#FFF6D6", edge: "#B98200", ink: "#7A5200", miro: "yellow" },
  green: { label: "Green", fill: "#E6F6EC", edge: "#2F9E5B", ink: "#1D6A3C", miro: "green" },
  red: { label: "Pink", fill: "#FCE8EF", edge: "#D9467C", ink: "#962556", miro: "pink" },
  blue: { label: "Blue", fill: "#E7EFFC", edge: "#3B7DDD", ink: "#1E4E9A", miro: "blue" },
  purple: { label: "Purple", fill: "#EFEBFC", edge: "#7B61D9", ink: "#4B3699", miro: "violet" },
  grey: { label: "Grey", fill: "#F5F6F7", edge: "#D3D5DA", ink: "#14161A", miro: "gray" },
  teal: { label: "Teal", fill: "#E1F5F6", edge: "#0E97A6", ink: "#0B5C65", miro: "cyan" },
  cream: { label: "Cream", fill: "#FFFBEA", edge: "#D9B54A", ink: "#6B5310", miro: "light_yellow" },
  orange: { label: "Orange", fill: "#FFEBD9", edge: "#E07B24", ink: "#8A4310", miro: "orange" },
  mint: { label: "Mint", fill: "#EEFBE5", edge: "#6CBF43", ink: "#36651C", miro: "light_green" },
  forest: { label: "Forest", fill: "#2F6B4A", edge: "#2F6B4A", ink: "#FFFFFF", miro: "dark_green" },
  blush: { label: "Blush", fill: "#FDF0F4", edge: "#E89BB4", ink: "#8A3553", miro: "light_pink" },
  tomato: { label: "Red", fill: "#FDE4E1", edge: "#E5483B", ink: "#A3271D", miro: "red" },
  ice: { label: "Ice", fill: "#EAF6FF", edge: "#6BB3E8", ink: "#1F5A85", miro: "light_blue" },
  navy: { label: "Navy", fill: "#233F7A", edge: "#233F7A", ink: "#FFFFFF", miro: "dark_blue" },
  charcoal: { label: "Charcoal", fill: "#1F2328", edge: "#1F2328", ink: "#FFFFFF", miro: "black" },
} as const satisfies Record<string, NoteColour>

export type NoteColourId = keyof typeof NOTE_COLOURS

/** The camp six, offered first. */
export const CAMP_NOTE_COLOURS: NoteColourId[] = ["yellow", "green", "red", "blue", "purple", "grey"]

/** Every note colour, the camp six first. */
export const ALL_NOTE_COLOURS = Object.keys(NOTE_COLOURS) as NoteColourId[]

const BY_FILL = new Map(ALL_NOTE_COLOURS.map((id) => [NOTE_COLOURS[id].fill.toLowerCase(), id]))
const BY_MIRO = new Map<string, NoteColourId>(ALL_NOTE_COLOURS.map((id) => [NOTE_COLOURS[id].miro, id]))

/** The note colour a fill is, if it is one. */
export function noteColourOfFill(fill: string | null | undefined): NoteColourId | null {
  return fill ? BY_FILL.get(fill.toLowerCase()) ?? null : null
}

/** The note colour that keeps a Miro sticky's colour (yellow for one it doesn't name). */
export function noteColourFromMiro(name: string | null | undefined): NoteColourId {
  return BY_MIRO.get(name ?? "") ?? "yellow"
}

// ---------------------------------------------------------------------------
// Sizes, styles and the note itself
// ---------------------------------------------------------------------------

/** A note's three sizes, square, in scene pixels. Medium is the templates' note. */
export const NOTE_SIZES = { s: 140, m: 180, l: 240 } as const
export type NoteSize = keyof typeof NOTE_SIZES

/** The words' size on each note size. */
export const NOTE_FONT_SIZES: Record<NoteSize, number> = { s: 16, m: 18, l: 24 }

/** The size a note is closest to, from its width. */
export function noteSizeOf(width: number): NoteSize {
  let best: NoteSize = "m"
  for (const s of Object.keys(NOTE_SIZES) as NoteSize[]) {
    if (Math.abs(NOTE_SIZES[s] - width) < Math.abs(NOTE_SIZES[best] - width)) best = s
  }
  return best
}

/** The smallest words a note's fit goes down to: the app's own smallest (text-xs, 12 px). Past it, the note grows. */
export const NOTE_FONT_FLOOR = 12

/**
 * The largest whole font size from `max` down to `floor` at which a note's words fit it, as `fits` says (it lays
 * the words out at a size, and says whether the note keeps its side). The note's own size first, since most words
 * fit it: one ask. Otherwise a halving search, at most five asks for any note size. The floor when nothing fits:
 * the note then grows to hold its words. Pure.
 */
export function fitFontSize({ max, floor, fits }: { max: number; floor: number; fits: (size: number) => boolean }): number {
  if (fits(max)) return max
  let best = floor
  let lo = floor
  let hi = max - 1
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid)) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return best
}

const NEXT_SIZE: Record<NoteSize, NoteSize> = { s: "m", m: "l", l: "s" }

/** The size key's next size: small, medium, large and round again; a selection of mixed sizes goes to medium. Pure. */
export function nextNoteSize(size: NoteSize | null): NoteSize {
  return size ? NEXT_SIZE[size] : "m"
}

/**
 * A board's style (owner, 21 Oct, O4): clean, in a plain sans and straight
 * strokes, for new boards; hand-drawn one switch away. Excalidraw's font
 * families: 6 is Nunito, 5 its hand-drawn Excalifont.
 */
export type BoardStyle = "clean" | "sketch"
export const STYLE_FONT: Record<BoardStyle, number> = { clean: 6, sketch: 5 }
export const STYLE_ROUGHNESS: Record<BoardStyle, number> = { clean: 0, sketch: 1 }

/** What a note says about itself, in its customData. */
export interface NoteData {
  kind: "note"
  colour: NoteColourId
  tags?: string[]
  taskUuid?: string
}

/** An Excalidraw skeleton for a note (a rectangle with its label), as convertToExcalidrawElements takes it. */
export interface NoteSkeleton {
  type: "rectangle"
  id: string
  x: number
  y: number
  width: number
  height: number
  backgroundColor: string
  strokeColor: string
  strokeWidth: number
  roughness: number
  fillStyle: "solid"
  roundness: { type: 3 }
  customData: NoteData
  label: { text: string; fontSize: number; strokeColor: string; fontFamily?: number; textAlign?: string; verticalAlign?: string }
}

/**
 * A note, ready for convertToExcalidrawElements. A clean hairline (roughness
 * 0) whatever the board's style: a note is paper, not a sketch of one; the
 * style chooses its words' font. Pure.
 */
export function noteSkeleton(o: {
  id: string
  x: number
  y: number
  text?: string
  colour?: NoteColourId
  size?: NoteSize
  style?: BoardStyle
  tags?: string[]
}): NoteSkeleton {
  const colour = o.colour ?? "yellow"
  const c = NOTE_COLOURS[colour]
  const size = o.size ?? "m"
  const side = NOTE_SIZES[size]
  const data: NoteData = { kind: "note", colour }
  // Tags as given: the sticky tool normalises them (lib/board/sticky).
  if (o.tags?.length) data.tags = [...o.tags]
  return {
    type: "rectangle",
    id: o.id,
    x: o.x,
    y: o.y,
    width: side,
    height: side,
    backgroundColor: c.fill,
    strokeColor: c.edge,
    strokeWidth: 1,
    roughness: 0,
    fillStyle: "solid",
    roundness: { type: 3 },
    customData: data,
    label: {
      text: o.text ?? "",
      fontSize: NOTE_FONT_SIZES[size],
      strokeColor: c.ink,
      ...(o.style ? { fontFamily: STYLE_FONT[o.style] } : {}),
    },
  }
}

/** A shape that is a sticky note: marked as one, or a filled rectangle in a note colour with words bound in it. */
export function isStickyNote(el: BoardElementLike & { backgroundColor?: string }): boolean {
  if (el.isDeleted || el.type !== "rectangle") return false
  if ((el.customData as { kind?: unknown } | undefined)?.kind === "note") return true
  return !!el.boundElements?.some((b) => b.type === "text") && noteColourOfFill(el.backgroundColor) !== null
}

/** The colour a note shows: its own record of it, else its fill's. */
export function noteColourOf(el: { backgroundColor?: string; customData?: Record<string, unknown> }): NoteColourId | null {
  const c = el.customData?.colour
  if (typeof c === "string" && c in NOTE_COLOURS) return c as NoteColourId
  return noteColourOfFill(el.backgroundColor)
}
