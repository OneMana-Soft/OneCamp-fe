// Annotation on Call Signals (meet-14, zoom-03; ROWS head S3): strokes over a
// shared screen, between the people in a call. A stroke's points are places
// on the share's own frame (0 to INK_SCALE across and down), so every screen
// draws it on the same spot of what is shared, whatever its tile's size. Who
// drew a stroke is who LiveKit says sent it (readCallSignal): a packet names
// no author and no colour. Anyone the call lets share may draw; a stroke's
// author undoes it; the sharer and whoever runs the call clear everyone's.
// Every screen applies these rules to every packet it reads. Pure, with no
// LiveKit import.

import type { CallSignal } from "./signals"

/** A point's place on a share's frame, in whole steps of this many across and down. */
export const INK_SCALE = 4096
/** Points in one packet. */
export const INK_CHUNK = 64
/** Points in one stroke. */
export const INK_STROKE_MAX = 2000
/** Strokes on one share: past this the oldest goes. */
export const INK_STROKES_MAX = 400
/** Shares with ink at once. */
export const INK_SHARES_MAX = 8
/** How long a laser stroke stays once it ends. */
export const LASER_MS = 1500

export type InkTool = "pen" | "laser"

export interface InkStroke {
  id: string
  /** Who drew it, as LiveKit named the sender. */
  by: string
  tool: InkTool
  /** x, y pairs, each 0 to INK_SCALE across the share's frame. */
  points: readonly number[]
  done: boolean
}

/** Each share's strokes, by the share's stage key (`<identity>|screen_share`). */
export type InkState = ReadonlyMap<string, readonly InkStroke[]>
export const NO_INK: InkState = new Map()

export type InkEvent =
  | { kind: "ink"; share: string; id: string; tool: InkTool; at: number; p: number[]; end: boolean; by: string }
  | { kind: "ink-undo"; share: string; id: string; by: string }
  | { kind: "ink-clear"; share: string; whose: "mine" | "all"; by: string }
  | { kind: "ink-fade"; share: string; id: string; by: string }
  | { kind: "ink-gone"; share: string }

/** What every screen checks a sender against. */
export interface InkRules {
  /** Whether the call holds sharing, and so drawing, for this person. */
  held: (identity: string) => boolean
  /** Whether this person runs the call (a host or a co-host). */
  runs: (identity: string) => boolean
}

/** A stroke's points from `at` on, as sent. */
export interface InkPacket {
  share: string
  id: string
  tool: InkTool
  at: number
  p: number[]
  end?: true
}

const SHARE_END = "|screen_share"
const STROKE_ID = /^[A-Za-z0-9_-]{1,24}$/

/** Whose screen a share is: the identity in its stage key, or null for what isn't a share. Pure. */
export function shareOwner(share: string): string | null {
  return share.length > SHARE_END.length && share.length <= 256 && share.endsWith(SHARE_END) ? share.slice(0, -SHARE_END.length) : null
}

const isShare = (v: unknown): v is string => typeof v === "string" && shareOwner(v) !== null
const isId = (v: unknown): v is string => typeof v === "string" && STROKE_ID.test(v)
const isPoints = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length % 2 === 0 && v.length <= INK_CHUNK * 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= INK_SCALE)

/**
 * An ink signal (read by readCallSignal, so its sender is LiveKit's), or null
 * for anything that isn't one or doesn't hold its shape. Pure.
 */
export function readInk(signal: CallSignal | null): InkEvent | null {
  const p = signal?.payload as Record<string, unknown> | null | undefined
  if (!signal || !p || typeof p !== "object" || !isShare(p.share)) return null
  const by = signal.from.identity
  switch (signal.kind) {
    case "ink": {
      const tool = p.tool ?? "pen"
      const at = p.at
      if (!isId(p.id) || (tool !== "pen" && tool !== "laser") || typeof at !== "number" || !Number.isInteger(at) || at < 0 || at > INK_STROKE_MAX || !isPoints(p.p)) return null
      return { kind: "ink", share: p.share, id: p.id, tool, at, p: p.p, end: p.end === true, by }
    }
    case "ink-undo":
      return isId(p.id) ? { kind: "ink-undo", share: p.share, id: p.id, by } : null
    case "ink-clear":
      return p.whose === "mine" || p.whose === "all" ? { kind: "ink-clear", share: p.share, whose: p.whose, by } : null
    default:
      return null
  }
}

/** Whether someone may clear everyone's ink on a share: it's their screen, or they run the call. Pure. */
export function mayClearAll(identity: string, share: string, runs: boolean): boolean {
  return runs || shareOwner(share) === identity
}

const sameStroke = (k: InkStroke, by: string, id: string) => k.by === by && k.id === id

/** The state with a share's strokes put, or the share gone when it has none. */
function withStrokes(state: InkState, share: string, strokes: readonly InkStroke[]): InkState {
  const next = new Map(state)
  if (strokes.length === 0) next.delete(share)
  else next.set(share, strokes)
  return next
}

/** What's left of a share's strokes, or the state itself when nothing went. */
function keep(state: InkState, share: string, was: readonly InkStroke[], left: readonly InkStroke[]): InkState {
  return left.length === was.length ? state : withStrokes(state, share, left)
}

/**
 * The ink after one event, under `rules`. A stroke's chunk at `at` writes its
 * points from there, so a chunk read twice changes nothing; a stroke is its
 * author's and its id together. The state itself comes back when nothing
 * changes. Pure.
 */
export function inkReduce(state: InkState, e: InkEvent, rules: InkRules): InkState {
  const was = state.get(e.share) ?? []
  switch (e.kind) {
    case "ink": {
      if (rules.held(e.by) || (!state.has(e.share) && state.size >= INK_SHARES_MAX)) return state
      const i = was.findIndex((k) => sameStroke(k, e.by, e.id))
      const old = i >= 0 ? was[i] : undefined
      const kept = old ? old.points.slice(0, Math.min(e.at * 2, old.points.length)) : []
      const stroke: InkStroke = { id: e.id, by: e.by, tool: old?.tool ?? e.tool, points: kept.concat(e.p).slice(0, INK_STROKE_MAX * 2), done: e.end || (old?.done ?? false) }
      return withStrokes(state, e.share, old ? was.map((k, j) => (j === i ? stroke : k)) : [...was, stroke].slice(-INK_STROKES_MAX))
    }
    case "ink-undo":
      return keep(state, e.share, was, was.filter((k) => !sameStroke(k, e.by, e.id)))
    case "ink-clear":
      if (e.whose === "all") return mayClearAll(e.by, e.share, rules.runs(e.by)) ? keep(state, e.share, was, []) : state
      return keep(state, e.share, was, was.filter((k) => k.by !== e.by))
    case "ink-fade":
      return keep(state, e.share, was, was.filter((k) => !(sameStroke(k, e.by, e.id) && k.tool === "laser")))
    case "ink-gone":
      return state.has(e.share) ? withStrokes(state, e.share, []) : state
  }
}

/**
 * A point on screen as a place on a share's frame: the frame is drawn inside
 * `box` as object-contain draws it (as big as fits, in the middle), and a
 * point in the bars beside it is held to the frame's edge. Pure.
 */
export function toFrame(client: { x: number; y: number }, box: { left: number; top: number; width: number; height: number }, frame: { w: number; h: number }): [number, number] {
  const scale = Math.min(box.width / frame.w, box.height / frame.h)
  if (!(scale > 0) || !Number.isFinite(scale)) return [0, 0]
  const w = frame.w * scale
  const h = frame.h * scale
  const step = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * INK_SCALE)
  return [step((client.x - box.left - (box.width - w) / 2) / w), step((client.y - box.top - (box.height - h) / 2) / h)]
}

/**
 * The packets that send a stroke's points from point `from` on, INK_CHUNK
 * points each; the last one ends a done stroke (an empty one when every point
 * has gone already). Pure.
 */
export function inkChunks(share: string, stroke: Pick<InkStroke, "id" | "tool" | "points" | "done">, from: number): InkPacket[] {
  const n = stroke.points.length / 2
  const out: InkPacket[] = []
  for (let at = from; at < n; at += INK_CHUNK) {
    const upto = Math.min(n, at + INK_CHUNK)
    const packet: InkPacket = { share, id: stroke.id, tool: stroke.tool, at, p: stroke.points.slice(at * 2, upto * 2) }
    if (stroke.done && upto === n) packet.end = true
    out.push(packet)
  }
  if (stroke.done && out.length === 0) out.push({ share, id: stroke.id, tool: stroke.tool, at: from, p: [], end: true })
  return out
}

/** One coordinate in the frame's own units, to a tenth. */
const unit = (v: number, size: number) => Math.round((v / INK_SCALE) * size * 10) / 10

/**
 * A stroke as an SVG path in the frame's own units (the layer's viewBox is
 * the frame): smoothed through the middles of its segments, and a tap drawn as
 * a dot (a segment of no length, with round caps). Pure.
 */
export function inkPath(points: readonly number[], frame: { w: number; h: number }): string {
  const n = Math.floor(points.length / 2)
  if (n === 0) return ""
  const x = (i: number) => unit(points[i * 2], frame.w)
  const y = (i: number) => unit(points[i * 2 + 1], frame.h)
  if (n === 1) return `M${x(0)} ${y(0)}L${x(0)} ${y(0)}`
  if (n === 2) return `M${x(0)} ${y(0)}L${x(1)} ${y(1)}`
  let d = `M${x(0)} ${y(0)}`
  for (let i = 1; i < n - 1; i++) d += `Q${x(i)} ${y(i)} ${Math.round(((x(i) + x(i + 1)) / 2) * 10) / 10} ${Math.round(((y(i) + y(i + 1)) / 2) * 10) / 10}`
  return `${d}L${x(n - 1)} ${y(n - 1)}`
}
