import { describe, expect, it } from "vitest"
import { formatClock, tally, timeLeft, toggleVote, votableNotes, voteKey } from "./facilitation"
import { followView, sceneToLocal, clientToScene, viewCentre } from "./viewport"

describe("dot voting", () => {
  it("votes on notes and loose text, once each", () => {
    const els = [
      { id: "r", type: "rectangle", x: 10, y: 20, width: 100, boundElements: [{ id: "t", type: "text" }] },
      { id: "t", type: "text", text: " Ship it ", containerId: "r" },
      { id: "loose", type: "text", text: "Idea", x: 0, y: 0, width: 40 },
      { id: "empty", type: "rectangle" },
      { id: "gone", type: "text", text: "x", isDeleted: true },
    ]
    expect(votableNotes(els).map((v) => [v.id, v.text])).toEqual([["r", "Ship it"], ["loose", "Idea"]])
  })

  it("keeps to the allowance, one vote per note", () => {
    expect(toggleVote([], "a", 2)).toEqual(["a"])
    expect(toggleVote(["a"], "a", 2)).toEqual([])
    expect(toggleVote(["a", "b"], "c", 2)).toBeNull()
  })

  it("counts one round, ignores deleted notes and repeats", () => {
    const votes: [string, unknown][] = [
      [voteKey("r1", "u1"), ["a", "b", "a"]],
      [voteKey("r1", "u2"), ["a", "gone"]],
      [voteKey("r0", "u1"), ["b", "b"]],
      ["junk", "x"],
    ]
    expect(tally(votes, "r1", new Set(["a", "b"]))).toEqual([{ id: "a", count: 2 }, { id: "b", count: 1 }])
  })
})

describe("timer", () => {
  it("counts down and holds when paused", () => {
    expect(timeLeft({ endsAt: 10_000, durationMs: 60_000, byName: "" }, 4_000)).toBe(6_000)
    expect(timeLeft({ endsAt: 10_000, durationMs: 60_000, byName: "" }, 20_000)).toBe(0)
    expect(timeLeft({ endsAt: 10_000, durationMs: 60_000, pausedLeftMs: 3_000, byName: "" }, 99_000)).toBe(3_000)
  })
  it("reads like a clock", () => {
    expect(formatClock(245_000)).toBe("4:05")
    expect(formatClock(8_200)).toBe("0:09")
    expect(formatClock(3_600_000)).toBe("1:00:00")
  })
})

describe("viewport", () => {
  const v = { scrollX: -100, scrollY: 50, zoom: 2, width: 800, height: 600, offsetLeft: 10, offsetTop: 20 }
  it("maps scene to screen and back", () => {
    const local = sceneToLocal(v, 150, 0)
    expect(local).toEqual({ left: 100, top: 100 })
    expect(clientToScene(v, local.left + v.offsetLeft, local.top + v.offsetTop)).toEqual({ x: 150, y: 0 })
  })
  it("shows a follower the presenter's middle, fitted to their screen", () => {
    const presenter = { scrollX: 0, scrollY: 0, zoom: 1, width: 1600, height: 900 }
    const f = followView(presenter, { width: 800, height: 900 })
    expect(f.zoom).toBe(0.5)
    expect(viewCentre({ ...f, width: 800, height: 900 })).toEqual(viewCentre(presenter))
  })
})
