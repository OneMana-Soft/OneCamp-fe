/**
 * Board templates: the starting layouts teams reach for in Miro (a retro, a
 * brainstorm, a kanban, a user journey, a SWOT), built as Excalidraw element
 * skeletons so they are ordinary, editable shapes on the shared canvas.
 *
 * A blank canvas is where a new board loses people; a template is a first
 * move they can make in one click. Pure, so the layouts are tested.
 */

export type StickyColour = "yellow" | "green" | "red" | "blue" | "purple" | "grey"

/** Excalidraw's own light palette, so templates match notes people draw by hand. */
export const STICKY_FILL: Record<StickyColour, string> = {
  yellow: "#ffec99",
  green: "#b2f2bb",
  red: "#ffc9c9",
  blue: "#a5d8ff",
  purple: "#d0bfff",
  grey: "#e9ecef",
}

/** The subset of Excalidraw's element skeleton the templates use. */
export type Skeleton =
  | {
      type: "rectangle"
      id: string
      x: number
      y: number
      width: number
      height: number
      backgroundColor: string
      strokeColor: string
      fillStyle: "solid"
      roundness: { type: 3 }
      label: { text: string; fontSize: number; strokeColor: string }
    }
  | { type: "text"; id: string; x: number; y: number; text: string; fontSize: number; strokeColor: string }
  | { type: "frame"; id: string; name: string; children: string[] }

export interface BoardTemplate {
  id: string
  name: string
  description: string
  build: (prefix: string) => Skeleton[]
}

export const STICKY = 180
const GAP = 24
const INK = "#1e1e1e"

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

function sticky(id: string, x: number, y: number, text: string, colour: StickyColour, size = STICKY): Skeleton {
  return {
    type: "rectangle",
    id,
    x,
    y,
    width: size,
    height: size,
    backgroundColor: STICKY_FILL[colour],
    strokeColor: "transparent",
    fillStyle: "solid",
    roundness: { type: 3 },
    // A label takes its container's stroke unless told otherwise, and a note
    // has no outline, so the ink is set here or the words are invisible.
    label: { text: wrapLabel(text, Math.floor((size - 20) / 11)), fontSize: 18, strokeColor: INK },
  }
}

function heading(id: string, x: number, y: number, text: string, fontSize = 28): Skeleton {
  return { type: "text", id, x, y, text, fontSize, strokeColor: INK }
}

/**
 * Columns of notes, each wrapped in a named frame. Frames are what Excalidraw
 * moves, exports and presents as a unit, so a column stays a column.
 */
function columns(
  p: string,
  cols: { name: string; colour: StickyColour; notes: string[] }[],
  perRow = 2,
): Skeleton[] {
  const out: Skeleton[] = []
  const colWidth = perRow * STICKY + (perRow - 1) * GAP
  cols.forEach((c, ci) => {
    const x0 = ci * (colWidth + GAP * 4)
    const ids: string[] = []
    c.notes.forEach((text, ni) => {
      const id = `${p}-c${ci}-n${ni}`
      ids.push(id)
      out.push(sticky(id, x0 + (ni % perRow) * (STICKY + GAP), Math.floor(ni / perRow) * (STICKY + GAP), text, c.colour))
    })
    out.push({ type: "frame", id: `${p}-c${ci}`, name: c.name, children: ids })
  })
  return out
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "retro",
    name: "Retrospective",
    description: "What went well, what to improve, and who does what next.",
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
    description: "To do, doing, done. Drag notes across; make them tasks when they're real.",
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
    description: "Stages across, what people do, think and feel down.",
    build: (p) => {
      const stages = ["Discover", "Sign up", "First use", "Grow"]
      const rows: { name: string; colour: StickyColour }[] = [
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
    build: (p) => {
      const quads: { name: string; colour: StickyColour; x: number; y: number }[] = [
        { name: "Strengths", colour: "green", x: 0, y: 0 },
        { name: "Weaknesses", colour: "red", x: 1, y: 0 },
        { name: "Opportunities", colour: "blue", x: 0, y: 1 },
        { name: "Threats", colour: "yellow", x: 1, y: 1 },
      ]
      const span = 2 * STICKY + GAP
      const out: Skeleton[] = []
      quads.forEach((q, qi) => {
        const x0 = q.x * (span + GAP * 4), y0 = q.y * (STICKY + GAP * 6)
        const ids = [`${p}-q${qi}a`, `${p}-q${qi}b`]
        out.push(sticky(ids[0], x0, y0, "", q.colour), sticky(ids[1], x0 + STICKY + GAP, y0, "", q.colour))
        out.push({ type: "frame", id: `${p}-q${qi}`, name: q.name, children: ids })
      })
      return out
    },
  },
]

/** The extent of a template's notes and headings, for centring it in view. */
export function skeletonBounds(sk: Skeleton[]): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of sk) {
    if (s.type === "frame") continue
    const w = s.type === "rectangle" ? s.width : s.text.length * s.fontSize * 0.55
    const h = s.type === "rectangle" ? s.height : s.fontSize * 1.25
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + w); y1 = Math.max(y1, s.y + h)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Moves a template so its centre lands on (cx, cy) in scene coordinates. */
export function centreAt(sk: Skeleton[], cx: number, cy: number): Skeleton[] {
  const b = skeletonBounds(sk)
  const dx = cx - (b.x + b.width / 2), dy = cy - (b.y + b.height / 2)
  return sk.map((s) => (s.type === "frame" ? s : { ...s, x: s.x + dx, y: s.y + dy }))
}
