/**
 * Frames on a board: the sizes people start them at, how a frame lays out
 * what's in it, the order the Frames panel keeps (and presenting will
 * follow), and a link that opens the board at one. Pure.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The sizes a frame starts at, as Miro offers them (its FrameData formats:
 * desktop, phone, tablet, A4, letter, 1:1, 4:3, 16:9; "custom" is drawing
 * one). Paper at 96 dpi, portrait; screens at today's common CSS sizes.
 */
export const FRAME_PRESETS = [
  { id: "16:9", label: "16:9", hint: "Slide", width: 1920, height: 1080 },
  { id: "4:3", label: "4:3", hint: "Slide", width: 1440, height: 1080 },
  { id: "1:1", label: "1:1", hint: "Square", width: 1080, height: 1080 },
  { id: "a4", label: "A4", hint: "Paper", width: 794, height: 1123 },
  { id: "letter", label: "Letter", hint: "Paper", width: 816, height: 1056 },
  { id: "desktop", label: "Desktop", hint: "1440 × 900", width: 1440, height: 900 },
  { id: "tablet", label: "Tablet", hint: "820 × 1180", width: 820, height: 1180 },
  { id: "phone", label: "Phone", hint: "390 × 844", width: 390, height: 844 },
] as const

export type FramePresetId = (typeof FRAME_PRESETS)[number]["id"]

export function framePreset(id: string) {
  return FRAME_PRESETS.find((p) => p.id === id) ?? null
}

/** "Frame 3": the next name no frame on the board has yet. */
export function nextFrameName(names: readonly (string | null | undefined)[], base = "Frame"): string {
  const taken = new Set(names.filter(Boolean).map((n) => n!.trim().toLowerCase()))
  for (let i = names.length + 1; ; i++) {
    const name = `${base} ${i}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

/** How a frame arranges what's in it (Miro's frame types, less "heap"). */
export type FrameLayout = "grid" | "rows" | "columns"

/** Inside a frame, from its edges, and between items. */
export const FRAME_PAD = 40
export const FRAME_GAP = 24

/** Reading order: top to bottom by middles in bands of `band`, then left to right. */
function readingOrder<T extends Box>(items: readonly T[], band: number): T[] {
  return [...items].sort((a, b) => {
    const ra = Math.floor((a.y + a.height / 2) / band)
    const rb = Math.floor((b.y + b.height / 2) / band)
    return ra - rb || a.x - b.x
  })
}

/**
 * A frame's items laid out: in a grid of equal cells, in rows that wrap at
 * the frame's width, or in columns that wrap at its height, in reading order,
 * from the frame's top left. The frame grows to hold them and never shrinks.
 * Returns each item's new top left, and the frame's size. Pure.
 */
export function layoutFrame<T extends Box & { id: string }>(
  frame: Box,
  items: readonly T[],
  layout: FrameLayout,
  pad = FRAME_PAD,
  gap = FRAME_GAP,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const positions = new Map<string, { x: number; y: number }>()
  if (items.length === 0) return { positions, width: frame.width, height: frame.height }
  const cell = Math.max(...items.map((i) => Math.max(i.width, i.height)))
  const ordered = readingOrder(items, cell)
  const innerW = Math.max(cell, frame.width - pad * 2)
  const innerH = Math.max(cell, frame.height - pad * 2)
  let right = 0
  let bottom = 0
  if (layout === "grid") {
    const cols = Math.max(1, Math.floor((innerW + gap) / (cell + gap)))
    ordered.forEach((it, i) => {
      const x = (i % cols) * (cell + gap)
      const y = Math.floor(i / cols) * (cell + gap)
      positions.set(it.id, { x: frame.x + pad + x, y: frame.y + pad + y })
      right = Math.max(right, x + cell)
      bottom = Math.max(bottom, y + cell)
    })
  } else if (layout === "rows") {
    let x = 0
    let y = 0
    let rowH = 0
    for (const it of ordered) {
      if (x > 0 && x + it.width > innerW) {
        x = 0
        y += rowH + gap
        rowH = 0
      }
      positions.set(it.id, { x: frame.x + pad + x, y: frame.y + pad + y })
      x += it.width + gap
      rowH = Math.max(rowH, it.height)
      right = Math.max(right, x - gap)
      bottom = Math.max(bottom, y + rowH)
    }
  } else {
    let x = 0
    let y = 0
    let colW = 0
    for (const it of ordered) {
      if (y > 0 && y + it.height > innerH) {
        y = 0
        x += colW + gap
        colW = 0
      }
      positions.set(it.id, { x: frame.x + pad + x, y: frame.y + pad + y })
      y += it.height + gap
      colW = Math.max(colW, it.width)
      bottom = Math.max(bottom, y - gap)
      right = Math.max(right, x + colW)
    }
  }
  return {
    positions,
    width: Math.max(frame.width, right + pad * 2),
    height: Math.max(frame.height, bottom + pad * 2),
  }
}

/**
 * The frames in the panel's order: the order the board keeps (frames that
 * are gone skipped), then any not in it yet, in reading order. Pure.
 */
export function orderFrames<T extends Box & { id: string }>(frames: readonly T[], saved: readonly string[] | null | undefined): T[] {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const id of saved ?? []) {
    const f = byId.get(id)
    if (f && !seen.has(id)) {
      out.push(f)
      seen.add(id)
    }
  }
  const rest = frames.filter((f) => !seen.has(f.id))
  const band = Math.max(1, Math.min(...rest.map((f) => f.height), 400))
  return out.concat(readingOrder(rest, band))
}

/** The order after moving the frame at `from` to `to`, as ids. Pure. */
export function moveFrame(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** A link that opens the board at a frame (or any element). */
export function frameLink(origin: string, boardId: string, frameId: string): string {
  return `${origin.replace(/\/+$/, "")}/app/board/${encodeURIComponent(boardId)}?frame=${encodeURIComponent(frameId)}`
}

/**
 * The frame or element a board's address asks to open at, if any: ?frame= (the
 * Frames panel's links) or ?element= (Excalidraw's own "Copy link to object",
 * an element's id or a group's).
 */
export function linkedFromSearch(search: string): string | null {
  const params = new URLSearchParams(search)
  const id = params.get("frame") ?? params.get("element")
  return id && id.length <= 200 ? id : null
}

/** The frames' order the Frames panel keeps in a board's boardMeta, or null when none is kept. */
export function frameOrderOf(meta: { get(key: string): unknown }): string[] | null {
  const order = meta.get("frameOrder")
  return Array.isArray(order) ? order.filter((x): x is string => typeof x === "string") : null
}
