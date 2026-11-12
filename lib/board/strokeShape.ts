// What a pen's stroke was meant to be (miro-10 2): a stroke held still at its end is fitted to the shape it most
// looks like (a rectangle, an ellipse, a diamond, a triangle, a line or an arrow), or left as ink when it looks like
// none. Pure: points in, a shape or none out; the board's drawing watch (components/board/drawingWatch) swaps the
// stroke for the shape as one undo step, so Ctrl+Z gives the hand's stroke back.

export interface Pt {
  x: number
  y: number
}
/** Where the pen was, and when (ms). */
export interface Sample extends Pt {
  t: number
}

export type StrokeShape =
  | { kind: "rectangle" | "ellipse" | "diamond"; x: number; y: number; width: number; height: number }
  | { kind: "triangle"; points: [Pt, Pt, Pt] }
  | { kind: "line" | "arrow"; from: Pt; to: Pt }

/** A stroke is held when the pen rests this long before it lifts (Miro's and Apple's hold). */
export const HOLD_MS = 500
/** A resting pen still trembles: moves inside this circle (px on screen) are rest. */
export const HOLD_RADIUS = 6
/** A stroke smaller than this, corner to corner, is a dot or a tick: ink. */
const MIN_SIZE = 24
/** A closed shape's outline lies, on average, within this share of its box's diagonal of the stroke. */
const FIT = 0.05
/** A line's ends are this share of its length apart, or more. */
const STRAIGHT = 0.92
/** A line within this many degrees of level or upright is drawn level or upright. */
const SNAP_DEGREES = 6

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function lengthOf(pts: readonly Pt[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i])
  return n
}

function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** How far the stroke lies from a closed outline, on average. */
function offOutline(pts: readonly Pt[], outline: readonly Pt[]): number {
  let sum = 0
  for (const p of pts) {
    let near = Infinity
    for (let i = 0; i < outline.length; i++) near = Math.min(near, toSegment(p, outline[i], outline[(i + 1) % outline.length]))
    sum += near
  }
  return sum / pts.length
}

/**
 * Whether the pen rested before it lifted: from its coming into the circle it ended in to the lift, HOLD_MS or
 * more. A quick stroke, lifted as it moves, is not held and stays ink.
 */
export function heldStill(samples: readonly Sample[], liftAt: number): boolean {
  const last = samples[samples.length - 1]
  if (!last) return false
  let restFrom = samples[0].t
  for (let i = samples.length - 1; i >= 0; i--) {
    if (dist(samples[i], last) > HOLD_RADIUS) {
      restFrom = samples[i + 1].t
      break
    }
  }
  return liftAt - restFrom >= HOLD_MS
}

/** The shape a stroke's points (in the scene) look like, or null: ink. */
export function recognizeStroke(pts: readonly Pt[]): StrokeShape | null {
  if (pts.length < 2) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const width = Math.max(...xs) - x
  const height = Math.max(...ys) - y
  const diagonal = Math.hypot(width, height)
  if (diagonal < MIN_SIZE) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  const length = lengthOf(pts)

  // A closed stroke: its ends meet, and it goes round once.
  if (dist(first, last) <= 0.25 * diagonal && length >= 1.7 * diagonal) {
    const cx = x + width / 2
    const cy = y + height / 2
    const rect = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
    const diamond = [{ x: cx, y }, { x: x + width, y: cy }, { x: cx, y: y + height }, { x, y: cy }]
    // The widest triangle the stroke holds: the point farthest from its middle, the one farthest from that, and the
    // one farthest from the line between them.
    const a = pts.reduce((far, p) => (dist(p, { x: cx, y: cy }) > dist(far, { x: cx, y: cy }) ? p : far), first)
    const b = pts.reduce((far, p) => (dist(p, a) > dist(far, a) ? p : far), first)
    const c = pts.reduce((far, p) => (toSegment(p, a, b) > toSegment(far, a, b) ? p : far), first)
    let round = 0
    if (width > 0 && height > 0) {
      for (const p of pts) round += Math.abs(Math.hypot((p.x - cx) / (width / 2), (p.y - cy) / (height / 2)) - 1)
      round = ((round / pts.length) * (width + height)) / 4
    } else round = Infinity
    const fits: Array<[number, StrokeShape, number]> = [
      [offOutline(pts, rect), { kind: "rectangle", x, y, width, height }, 2 * (width + height)],
      [round, { kind: "ellipse", x, y, width, height }, (Math.PI * (width + height)) / 2],
      [offOutline(pts, diamond), { kind: "diamond", x, y, width, height }, 2 * diagonal],
      [offOutline(pts, [a, b, c]), { kind: "triangle", points: [a, b, c] }, dist(a, b) + dist(b, c) + dist(c, a)],
    ]
    const [off, shape, around] = fits.reduce((best, f) => (f[0] < best[0] ? f : best))
    // Round its outline once, not scribbled over it.
    return off <= FIT * diagonal && length <= 1.5 * around ? shape : null
  }

  // A straight stroke: a line, level or upright when it nearly is.
  const snapped = (to: Pt): Pt => {
    const degrees = Math.abs((Math.atan2(to.y - first.y, to.x - first.x) * 180) / Math.PI)
    if (degrees <= SNAP_DEGREES || degrees >= 180 - SNAP_DEGREES) return { x: to.x, y: first.y }
    if (Math.abs(degrees - 90) <= SNAP_DEGREES) return { x: first.x, y: to.y }
    return to
  }
  if (dist(first, last) >= STRAIGHT * length) return { kind: "line", from: first, to: snapped(last) }

  // A straight shaft with a head drawn back from its tip: an arrow to the tip.
  // The tip is where the stroke first comes as far from its start as it ever gets: a head's strokes pass it again.
  const far = Math.max(...pts.map((p) => dist(p, first)))
  let tip = pts.findIndex((p) => dist(p, first) >= 0.97 * far)
  while (tip + 1 < pts.length && dist(pts[tip + 1], first) > dist(pts[tip], first)) tip++
  const shaft = dist(first, pts[tip])
  const head = pts.slice(tip)
  const barb = head.reduce((far, p) => (dist(p, pts[tip]) > dist(far, pts[tip]) ? p : far), pts[tip])
  const reach = dist(barb, pts[tip])
  if (shaft < MIN_SIZE || shaft < STRAIGHT * lengthOf(pts.slice(0, tip + 1)) || reach < 0.08 * shaft || reach > 0.45 * shaft) return null
  // The head points back along the shaft, within 75 degrees.
  const back = ((barb.x - pts[tip].x) * (first.x - pts[tip].x) + (barb.y - pts[tip].y) * (first.y - pts[tip].y)) / (reach * shaft)
  return back >= Math.cos((75 * Math.PI) / 180) ? { kind: "arrow", from: first, to: snapped(pts[tip]) } : null
}

/** What the fitted shape is drawn in: the stroke's own ink, and the board's style. */
export interface ShapeInk {
  strokeColor: string
  strokeWidth: number
  opacity: number
  roughness: number
  /** Rounded corners, as the canvas makes its own new shapes. */
  round: boolean
  frameId?: string | null
}

/** The shape as a skeleton for Excalidraw's converter. A triangle is a closed line: Excalidraw (0.18) has no triangle. */
export function shapeSkeleton(shape: StrokeShape, ink: ShapeInk): Record<string, unknown> {
  const { round, ...rest } = ink
  const common = { ...rest, backgroundColor: "transparent", strokeStyle: "solid" }
  if ("from" in shape) {
    const points = [[0, 0], [shape.to.x - shape.from.x, shape.to.y - shape.from.y]]
    return { ...common, type: shape.kind, x: shape.from.x, y: shape.from.y, points, roundness: null, ...(shape.kind === "arrow" ? { endArrowhead: "arrow" } : {}) }
  }
  if (shape.kind === "triangle") {
    const [a, b, c] = shape.points
    return { ...common, type: "line", x: a.x, y: a.y, points: [[0, 0], [b.x - a.x, b.y - a.y], [c.x - a.x, c.y - a.y], [0, 0]], roundness: null }
  }
  // Excalidraw's own roundness kinds: 3 a rectangle's adaptive radius, 2 a diamond's proportional one.
  const roundness = !round || shape.kind === "ellipse" ? null : { type: shape.kind === "rectangle" ? 3 : 2 }
  return { ...common, type: shape.kind, x: shape.x, y: shape.y, width: shape.width, height: shape.height, roundness }
}
