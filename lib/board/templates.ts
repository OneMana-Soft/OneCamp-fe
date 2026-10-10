/**
 * Board templates: the starting layouts teams reach for in Miro (a retro, a
 * brainstorm, a kanban, a user journey, a SWOT), built as Excalidraw element
 * skeletons so they are ordinary, editable shapes on the shared canvas.
 *
 * A blank canvas is where a new board loses people; a template is a first
 * move they can make in one click. Pure, so the layouts are tested.
 */

export type StickyColour = "yellow" | "green" | "red" | "blue" | "purple" | "grey"

/**
 * A note's colours: the camp palette's tint as its paper, the hue's ink for
 * its words and a hairline of the strong cut round it, the treatment a tag
 * or an avatar has everywhere else in the app (the playful layer). Hex, the
 * light theme's token values (app/globals.css), because a board stores its
 * colours in the shared document; Excalidraw's dark theme inverts the canvas,
 * which turns a tint into a dark ground and an ink into a light one.
 *
 * Yellow is sun, green moss, red berry, blue sky and purple dusk; grey is the
 * app's own neutral, for a note that should not stand out.
 */
export const STICKY_COLOURS: Record<StickyColour, { fill: string; edge: string; ink: string }> = {
  yellow: { fill: "#FFF6D6", edge: "#B98200", ink: "#7A5200" },
  green: { fill: "#E6F6EC", edge: "#2F9E5B", ink: "#1D6A3C" },
  red: { fill: "#FCE8EF", edge: "#D9467C", ink: "#962556" },
  blue: { fill: "#E7EFFC", edge: "#3B7DDD", ink: "#1E4E9A" },
  purple: { fill: "#EFEBFC", edge: "#7B61D9", ink: "#4B3699" },
  grey: { fill: "#F5F6F7", edge: "#D3D5DA", ink: "#14161A" },
}

/** A note's paper colour. */
export const STICKY_FILL: Record<StickyColour, string> = Object.fromEntries(
  Object.entries(STICKY_COLOURS).map(([k, v]) => [k, v.fill]),
) as Record<StickyColour, string>

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
      strokeWidth: number
      roughness: number
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
const INK = "#14161A" // the app's own text colour (--foreground, light)

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
    backgroundColor: STICKY_COLOURS[colour].fill,
    // A clean hairline (roughness 0): a note is paper, not a sketch of one.
    strokeColor: STICKY_COLOURS[colour].edge,
    strokeWidth: 1,
    roughness: 0,
    fillStyle: "solid",
    roundness: { type: 3 },
    // A label takes its container's stroke unless told otherwise, so the
    // words are given the hue's ink here, not its edge.
    label: { text: wrapLabel(text, Math.floor((size - 20) / 11)), fontSize: 18, strokeColor: STICKY_COLOURS[colour].ink },
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
