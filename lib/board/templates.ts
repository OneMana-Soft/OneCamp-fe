/**
 * Board templates: the starting layouts teams reach for in Miro, built as
 * Excalidraw element skeletons so they are ordinary, editable shapes on the
 * shared canvas. The five here are the ones the empty board offers; the rest
 * of the library (lib/board/templateLibrary) is loaded with the picker, from
 * the same builders.
 *
 * A blank canvas is where a new board loses people; a template is a first
 * move they can make in one click. Pure, so the layouts are tested.
 */

import { NOTE_COLOURS, noteSkeleton, type NoteColourId, type NoteSkeleton } from "./notes"

export type StickyColour = "yellow" | "green" | "red" | "blue" | "purple" | "grey"

/**
 * The camp six of the note colours (lib/board/notes), as the templates and
 * their previews name them.
 */
export const STICKY_COLOURS: Record<StickyColour, { fill: string; edge: string; ink: string }> = {
  yellow: NOTE_COLOURS.yellow,
  green: NOTE_COLOURS.green,
  red: NOTE_COLOURS.red,
  blue: NOTE_COLOURS.blue,
  purple: NOTE_COLOURS.purple,
  grey: NOTE_COLOURS.grey,
}

/** The subset of Excalidraw's element skeleton the templates use. */
export type Skeleton =
  | NoteSkeleton
  | { type: "text"; id: string; x: number; y: number; text: string; fontSize: number; strokeColor: string }
  | { type: "frame"; id: string; name: string; children: string[] }
  | { type: "arrow"; id: string; x: number; y: number; width: number; height: number; strokeColor: string; strokeWidth: number; roughness: number; start?: { id: string }; end?: { id: string } }

/** The kinds the picker files templates under, in its order. */
export const TEMPLATE_CATEGORIES = ["Retrospectives", "Brainstorming", "Strategy", "Research & product", "Planning", "Meetings & workshops"] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface BoardTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  /** What else it's found by in the picker. */
  keywords?: string
  build: (prefix: string) => Skeleton[]
}

export const STICKY = 180
export const GAP = 24
export const INK = "#14161A" // the app's own text colour (--foreground, light)

/**
 * Line breaks for a note's label. Excalidraw does not re-wrap a label made from
 * a skeleton, so a prompt wider than its note ran off the edge. About 14
 * handwritten characters fit a 180 px note at 18 px; a longer word keeps its
 * own line rather than being split.
 */
export function wrapLabel(text: string, perLine: number): string {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > perLine) {
      lines.push(line)
      line = word
    } else line = line ? line + " " + word : word
  }
  if (line) lines.push(line)
  return lines.join("\n")
}

/** A template's note: the sticky tool's own (lib/board/notes), its words wrapped to fit. */
export function sticky(id: string, x: number, y: number, text: string, colour: NoteColourId, size = STICKY): NoteSkeleton {
  const n = noteSkeleton({ id, x, y, colour, text: wrapLabel(text, Math.floor((size - 20) / 11)) })
  return size === STICKY ? n : { ...n, width: size, height: size }
}

export function heading(id: string, x: number, y: number, text: string, fontSize = 28): Skeleton {
  return { type: "text", id, x, y, text, fontSize, strokeColor: INK }
}

/** An arrow from a point by (dx, dy), bound to shapes at its ends when given. */
export function arrow(id: string, x: number, y: number, dx: number, dy: number, ends: { start?: string; end?: string } = {}): Skeleton {
  return {
    type: "arrow",
    id,
    x,
    y,
    width: dx,
    height: dy,
    strokeColor: INK,
    strokeWidth: 2,
    roughness: 0,
    ...(ends.start ? { start: { id: ends.start } } : {}),
    ...(ends.end ? { end: { id: ends.end } } : {}),
  }
}

/** A named column of notes: what `columns` and `areas` take. */
export interface Column {
  name: string
  colour: NoteColourId
  notes: string[]
  /** Notes side by side in it (default the layout's). */
  perRow?: number
}

/**
 * Rows of named areas, each a frame of notes laid two (or perRow) to a row,
 * side by side, the next row below the tallest area of the one above: a
 * retro's columns, a lean canvas's boxes, an empathy map's quarters. Pure.
 */
export function areas(p: string, rows: Column[][], perRow = 2): Skeleton[] {
  const out: Skeleton[] = []
  let y0 = 0
  rows.forEach((row, ri) => {
    let x0 = 0
    let tallest = 0
    row.forEach((c, ci) => {
      const per = Math.max(1, c.perRow ?? perRow)
      const width = per * STICKY + (per - 1) * GAP
      const ids: string[] = []
      const notes = c.notes.length ? c.notes : [""]
      notes.forEach((text, ni) => {
        // The first row's ids as they always were (`${p}-c${ci}-n${ni}`), so a
        // board laid from a template before keeps the same element ids.
        const id = ri === 0 ? `${p}-c${ci}-n${ni}` : `${p}-r${ri}c${ci}-n${ni}`
        ids.push(id)
        out.push(sticky(id, x0 + (ni % per) * (STICKY + GAP), y0 + Math.floor(ni / per) * (STICKY + GAP), text, c.colour))
      })
      out.push({ type: "frame", id: ri === 0 ? `${p}-c${ci}` : `${p}-r${ri}c${ci}`, name: c.name, children: ids })
      const lines = Math.ceil(notes.length / per)
      tallest = Math.max(tallest, lines * STICKY + (lines - 1) * GAP)
      x0 += width + GAP * 4
    })
    y0 += tallest + GAP * 4
  })
  return out
}

/**
 * Columns of notes, each wrapped in a named frame. Frames are what Excalidraw
 * moves, exports and presents as a unit, so a column stays a column.
 */
export function columns(p: string, cols: Column[], perRow = 2): Skeleton[] {
  return areas(p, [cols], perRow)
}

/** Two by two: four named quarters (a SWOT, a priority matrix). */
export function quadrants(p: string, quads: [Column, Column, Column, Column]): Skeleton[] {
  return areas(p, [quads.slice(0, 2), quads.slice(2, 4)])
}

/** The five the empty board offers, by what teams start with most. */
export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "retro",
    name: "Retrospective",
    description: "What went well, what to improve, who does what.",
    category: "Retrospectives",
    keywords: "retro sprint review lessons",
    build: (p) =>
      columns(p, [
        { name: "Went well", colour: "green", notes: ["What went well?", ""] },
        { name: "To improve", colour: "red", notes: ["What slowed us down?", ""] },
        { name: "Actions", colour: "blue", notes: ["Who does what by when?", ""] },
      ]),
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    description: "One question in the middle, ideas around it.",
    category: "Brainstorming",
    keywords: "ideas ideation",
    build: (p) => {
      const out: Skeleton[] = [sticky(`${p}-topic`, 0, 0, "The question we're answering", "purple", 260)]
      const ids = [`${p}-topic`]
      const r = 380
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2
        const id = `${p}-idea${i}`
        ids.push(id)
        out.push(sticky(id, 130 + Math.cos(a) * r - STICKY / 2, 130 + Math.sin(a) * r - STICKY / 2, i === 0 ? "An idea" : "", "yellow"))
      }
      out.push({ type: "frame", id: `${p}-frame`, name: "Brainstorm", children: ids })
      return out
    },
  },
  {
    id: "kanban",
    name: "Kanban",
    description: "To do, doing, done. Notes become tasks.",
    category: "Planning",
    keywords: "board todo tasks workflow",
    build: (p) =>
      columns(
        p,
        [
          { name: "To do", colour: "yellow", notes: ["A piece of work", "Another one"] },
          // An empty note each: a frame with nothing in it has no size, and
          // Excalidraw drew it as a stray dot.
          { name: "Doing", colour: "blue", notes: [""] },
          { name: "Done", colour: "green", notes: [""] },
        ],
        1,
      ),
  },
  {
    id: "journey",
    name: "User journey",
    description: "Stages across; doing, thinking, feeling down.",
    category: "Research & product",
    keywords: "customer experience map ux",
    build: (p) => {
      const stages = ["Discover", "Sign up", "First use", "Grow"]
      const rows: { name: string; colour: NoteColourId }[] = [
        { name: "Doing", colour: "blue" },
        { name: "Thinking", colour: "yellow" },
        { name: "Feeling", colour: "red" },
        // Short on purpose: template text is measured before the hand font
        // loads, and a long word ("Opportunity") was clipped.
        { name: "Ideas", colour: "green" },
      ]
      const out: Skeleton[] = []
      const ids: string[] = []
      const left = 240
      stages.forEach((s, si) => {
        const id = `${p}-stage${si}`
        ids.push(id)
        out.push(heading(id, left + si * (STICKY + GAP), 0, s, 24))
      })
      rows.forEach((r, ri) => {
        const y = 60 + ri * (STICKY + GAP)
        const hid = `${p}-row${ri}`
        ids.push(hid)
        out.push(heading(hid, 0, y + STICKY / 2 - 14, r.name, 22))
        stages.forEach((_, si) => {
          const id = `${p}-r${ri}s${si}`
          ids.push(id)
          out.push(sticky(id, left + si * (STICKY + GAP), y, "", r.colour))
        })
      })
      out.push({ type: "frame", id: `${p}-frame`, name: "User journey", children: ids })
      return out
    },
  },
  {
    id: "swot",
    name: "SWOT",
    description: "Strengths, weaknesses, opportunities, threats.",
    category: "Strategy",
    keywords: "analysis competition",
    build: (p) =>
      quadrants(p, [
        { name: "Strengths", colour: "green", notes: ["", ""] },
        { name: "Weaknesses", colour: "red", notes: ["", ""] },
        { name: "Opportunities", colour: "blue", notes: ["", ""] },
        { name: "Threats", colour: "yellow", notes: ["", ""] },
      ]),
  },
]

/** The extent of a template's notes, headings and arrows, for centring it in view. */
export function skeletonBounds(sk: Skeleton[]): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of sk) {
    if (s.type === "frame") continue
    const sx = s.type === "arrow" ? Math.min(s.x, s.x + s.width) : s.x
    const sy = s.type === "arrow" ? Math.min(s.y, s.y + s.height) : s.y
    const w = s.type === "rectangle" ? s.width : s.type === "arrow" ? Math.abs(s.width) : s.text.length * s.fontSize * 0.55
    const h = s.type === "rectangle" ? s.height : s.type === "arrow" ? Math.abs(s.height) : s.fontSize * 1.25
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx + w); y1 = Math.max(y1, sy + h)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Moves a template so its centre lands on (cx, cy) in scene coordinates. */
export function centreAt(sk: Skeleton[], cx: number, cy: number): Skeleton[] {
  const b = skeletonBounds(sk)
  const dx = cx - (b.x + b.width / 2), dy = cy - (b.y + b.height / 2)
  return sk.map((s) => (s.type === "frame" ? s : { ...s, x: s.x + dx, y: s.y + dy }))
}
