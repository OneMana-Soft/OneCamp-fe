import { describe, expect, it } from "vitest"
import { CALL_SIGNAL_TOPIC, encodeSignal, readCallSignal } from "./signals"
import {
  INK_CHUNK,
  INK_STROKES_MAX,
  INK_STROKE_MAX,
  NO_INK,
  inkChunks,
  inkPath,
  inkReduce,
  mayClearAll,
  readInk,
  shareOwner,
  toFrame,
  type InkEvent,
  type InkRules,
  type InkState,
} from "./ink"

// Annotation on Call Signals (meet-14, zoom-03): strokes over a share, drawn by
// anyone the call lets share, cleared by the sharer and whoever runs the call.

const SHARE = "ana|screen_share"
const signal = (kind: string, payload: unknown, from = "ben") => readCallSignal(encodeSignal(kind, payload), { identity: from, name: from }, CALL_SIGNAL_TOPIC)
const free: InkRules = { held: () => false, runs: () => false }
const ink = (by: string, id: string, p: number[], extra: Partial<Extract<InkEvent, { kind: "ink" }>> = {}): InkEvent => ({
  kind: "ink",
  share: SHARE,
  id,
  tool: "pen",
  at: 0,
  p,
  end: false,
  by,
  ...extra,
})
const ids = (s: InkState) => (s.get(SHARE) ?? []).map((k) => k.id)

describe("readInk", () => {
  it("reads a stroke's points from the person LiveKit names", () => {
    expect(readInk(signal("ink", { share: SHARE, id: "s1", tool: "pen", at: 0, p: [0, 0, 4096, 2048], end: true }))).toEqual({
      kind: "ink",
      share: SHARE,
      id: "s1",
      tool: "pen",
      at: 0,
      p: [0, 0, 4096, 2048],
      end: true,
      by: "ben",
    })
  })

  it("never takes an author, a name or a colour from the packet", () => {
    expect(readInk(signal("ink", { share: SHARE, id: "s1", at: 0, p: [1, 2], by: "ana", name: "Ana", color: "#f00" }))).toEqual({
      kind: "ink",
      share: SHARE,
      id: "s1",
      tool: "pen",
      at: 0,
      p: [1, 2],
      end: false,
      by: "ben",
    })
  })

  it("refuses what isn't a stroke over a share", () => {
    expect(readInk(signal("ink", { share: SHARE, id: "s1", at: 0, p: [1, 2] })), "a stroke it reads").not.toBeNull()
    const bad = [
      { share: SHARE, id: "s1", at: 0, p: [0, 4097] },
      { share: SHARE, id: "s1", at: 0, p: [-1, 0] },
      { share: SHARE, id: "s1", at: 0, p: [1, 2, 3] },
      { share: SHARE, id: "s1", at: 0, p: [1.5, 2] },
      { share: SHARE, id: "s1", at: 0, p: Array(INK_CHUNK * 2 + 2).fill(1) },
      { share: SHARE, id: "s1", at: -1, p: [1, 2] },
      { share: SHARE, id: "s1", at: INK_STROKE_MAX + 1, p: [1, 2] },
      { share: SHARE, id: "s1", at: 0, p: "1,2" },
      { share: "ana|camera", id: "s1", at: 0, p: [1, 2] },
      { share: SHARE, id: "x".repeat(25), at: 0, p: [1, 2] },
      { share: SHARE, id: "", at: 0, p: [1, 2] },
      { share: SHARE, id: "s1", tool: "spray", at: 0, p: [1, 2] },
    ]
    for (const b of bad) expect(readInk(signal("ink", b)), JSON.stringify(b).slice(0, 90)).toBeNull()
  })

  it("reads an undo and a clear, and nothing else", () => {
    expect(readInk(signal("ink-undo", { share: SHARE, id: "s1" }))).toEqual({ kind: "ink-undo", share: SHARE, id: "s1", by: "ben" })
    expect(readInk(signal("ink-clear", { share: SHARE, whose: "all" }))).toEqual({ kind: "ink-clear", share: SHARE, whose: "all", by: "ben" })
    expect(readInk(signal("ink-clear", { share: SHARE, whose: "theirs" }))).toBeNull()
    expect(readInk(signal("reaction", { emoji: "👍" }))).toBeNull()
    expect(readInk(null)).toBeNull()
  })
})

describe("inkReduce", () => {
  it("draws a stroke as its chunks come, and a chunk sent twice changes nothing", () => {
    let s = inkReduce(NO_INK, ink("ben", "s1", [0, 0, 10, 10]), free)
    s = inkReduce(s, ink("ben", "s1", [20, 20], { at: 2, end: true }), free)
    expect(s.get(SHARE)).toEqual([{ id: "s1", by: "ben", tool: "pen", points: [0, 0, 10, 10, 20, 20], done: true }])
    expect(inkReduce(s, ink("ben", "s1", [20, 20], { at: 2, end: true }), free).get(SHARE)).toEqual(s.get(SHARE))
  })

  it("keeps two people's strokes apart, even under one id", () => {
    let s = inkReduce(NO_INK, ink("ben", "s1", [0, 0]), free)
    s = inkReduce(s, ink("cy", "s1", [5, 5]), free)
    expect((s.get(SHARE) ?? []).map((k) => [k.by, k.points])).toEqual([
      ["ben", [0, 0]],
      ["cy", [5, 5]],
    ])
  })

  it("drops ink from someone the call holds from sharing", () => {
    const rules: InkRules = { held: (who) => who === "ben", runs: () => false }
    expect(inkReduce(NO_INK, ink("ben", "s1", [0, 0]), rules)).toBe(NO_INK)
    expect(ids(inkReduce(NO_INK, ink("cy", "s1", [0, 0]), rules))).toEqual(["s1"])
  })

  it("caps a stroke's points, and a share's strokes with the oldest going first", () => {
    let s = NO_INK
    for (let at = 0; at < INK_STROKE_MAX + 200; at += INK_CHUNK) s = inkReduce(s, ink("ben", "long", Array(INK_CHUNK * 2).fill(7), { at }), free)
    expect(s.get(SHARE)?.[0]?.points.length).toBe(INK_STROKE_MAX * 2)
    for (let i = 0; i < INK_STROKES_MAX; i++) s = inkReduce(s, ink("ben", `k${i}`, [1, 1], { end: true }), free)
    expect(s.get(SHARE)?.length).toBe(INK_STROKES_MAX)
    expect(s.get(SHARE)?.[0]?.id).toBe("k0")
  })

  it("undoes only the sender's own stroke", () => {
    let s = inkReduce(NO_INK, ink("ben", "s1", [0, 0]), free)
    s = inkReduce(s, ink("cy", "s2", [0, 0]), free)
    expect(inkReduce(s, { kind: "ink-undo", share: SHARE, id: "s2", by: "ben" }, free)).toBe(s)
    expect(ids(inkReduce(s, { kind: "ink-undo", share: SHARE, id: "s1", by: "ben" }, free))).toEqual(["s2"])
  })

  it("clears your own strokes, and everyone's only for the sharer or someone running the call", () => {
    let s = inkReduce(NO_INK, ink("ben", "s1", [0, 0]), free)
    s = inkReduce(s, ink("cy", "s2", [0, 0]), free)
    expect(inkReduce(s, { kind: "ink-clear", share: SHARE, whose: "all", by: "ben" }, free)).toBe(s)
    expect(ids(inkReduce(s, { kind: "ink-clear", share: SHARE, whose: "mine", by: "ben" }, free))).toEqual(["s2"])
    expect(ids(inkReduce(s, { kind: "ink-clear", share: SHARE, whose: "all", by: "ana" }, free))).toEqual([])
    const host: InkRules = { held: () => false, runs: (who) => who === "hal" }
    expect(ids(inkReduce(s, { kind: "ink-clear", share: SHARE, whose: "all", by: "hal" }, host))).toEqual([])
  })

  it("lets a laser stroke fade, never a pen's", () => {
    let s = inkReduce(NO_INK, ink("ben", "l1", [0, 0], { tool: "laser", end: true }), free)
    s = inkReduce(s, ink("ben", "p1", [0, 0], { end: true }), free)
    s = inkReduce(s, { kind: "ink-fade", share: SHARE, id: "l1", by: "ben" }, free)
    s = inkReduce(s, { kind: "ink-fade", share: SHARE, id: "p1", by: "ben" }, free)
    expect(ids(s)).toEqual(["p1"])
  })

  it("forgets a share's ink when the share ends", () => {
    const s = inkReduce(NO_INK, ink("ben", "s1", [0, 0]), free)
    expect(s.has(SHARE)).toBe(true)
    expect(inkReduce(s, { kind: "ink-gone", share: SHARE }, free).has(SHARE)).toBe(false)
  })
})

describe("who may clear everyone's ink", () => {
  it("is the share's owner, or whoever runs the call", () => {
    expect(shareOwner(SHARE)).toBe("ana")
    expect(shareOwner("odd|with|bars|screen_share")).toBe("odd|with|bars")
    expect(mayClearAll("ana", SHARE, false)).toBe(true)
    expect(mayClearAll("ben", SHARE, false)).toBe(false)
    expect(mayClearAll("ben", SHARE, true)).toBe(true)
  })
})

describe("toFrame", () => {
  // A 16:9 share in a 1000 x 1000 box, as object-contain draws it: 562.5 tall, from y 218.75.
  const box = { left: 0, top: 0, width: 1000, height: 1000 }
  const frame = { w: 1920, h: 1080 }

  it("reads a point on screen as a place on the share's own frame", () => {
    expect(toFrame({ x: 500, y: 500 }, box, frame)).toEqual([2048, 2048])
    expect(toFrame({ x: 0, y: 218.75 }, box, frame)).toEqual([0, 0])
    expect(toFrame({ x: 1100, y: 600 }, { ...box, left: 100, top: 100 }, frame)).toEqual([4096, 2048])
  })

  it("holds a point in the letterbox to the frame's edge", () => {
    expect(toFrame({ x: -50, y: 10 }, box, frame)).toEqual([0, 0])
    expect(toFrame({ x: 1200, y: 990 }, box, frame)).toEqual([4096, 4096])
  })
})

describe("inkChunks and inkPath", () => {
  it("sends a stroke from a point on, a chunk at a time, the last one ending it", () => {
    const points = Array.from({ length: (INK_CHUNK + 1) * 2 }, (_, i) => i)
    const chunks = inkChunks(SHARE, { id: "s1", tool: "pen", points, done: true }, 0)
    expect(chunks.map((c) => [c.at, c.p.length / 2, c.end ?? false])).toEqual([
      [0, INK_CHUNK, false],
      [INK_CHUNK, 1, true],
    ])
    expect(inkChunks(SHARE, { id: "s1", tool: "pen", points, done: false }, INK_CHUNK)).toEqual([{ share: SHARE, id: "s1", tool: "pen", at: INK_CHUNK, p: points.slice(INK_CHUNK * 2) }])
    expect(inkChunks(SHARE, { id: "s1", tool: "pen", points: [1, 1], done: true }, 1)).toEqual([{ share: SHARE, id: "s1", tool: "pen", at: 1, p: [], end: true }])
  })

  it("draws in the frame's own units, and a tap as a dot", () => {
    expect(inkPath([0, 0, 4096, 2048], { w: 1920, h: 1080 })).toBe("M0 0L1920 540")
    expect(inkPath([2048, 2048], { w: 1920, h: 1080 })).toBe("M960 540L960 540")
  })
})
