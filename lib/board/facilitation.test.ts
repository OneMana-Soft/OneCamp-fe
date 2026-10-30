import { describe, expect, it } from "vitest"
import { barForms, formatClock, giveWaySteps, tally, timeLeft, toggleVotes, votableNotes, voteKey } from "./facilitation"
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

  it("votes for several notes at once, takes them all back when each has one, and keeps to the allowance", () => {
    // One note at a time (the facilitation bar's dots): a vote, taken back, and none past the allowance.
    expect(toggleVotes([], ["a"], 2)).toEqual(["a"])
    expect(toggleVotes(["a"], ["a"], 2)).toEqual([])
    expect(toggleVotes(["a", "b"], ["c"], 2)).toBeNull()
    // The missing ones are added, the ones already voted for stay.
    expect(toggleVotes(["a"], ["a", "b"], 3)).toEqual(["a", "b"])
    // Every one has the vote: all of them come back, the rest stay.
    expect(toggleVotes(["a", "b", "c"], ["a", "b"], 3)).toEqual(["c"])
    // Past the allowance nothing changes, not part of it.
    expect(toggleVotes(["a"], ["b", "c"], 2)).toBeNull()
    // A note named twice is one note; none named changes nothing.
    expect(toggleVotes([], ["a", "a"], 1)).toEqual(["a"])
    expect(toggleVotes(["a"], [], 1)).toEqual(["a"])
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

// The compact bar's one priority (design review, 29 Oct): at 390 a viewer's bar cut "started voting" and
// cut the names to nothing. A name gives way first, by itself (down to its first letter and "…"); these
// steps come only when that isn't enough, in one order, each one segment's next shorter form.
describe("the compact bar's give-way priority", () => {
  it("gives way in one order: following's words, the voter's name, the presenter's words, the round's word, the presenter's name", () => {
    expect(giveWaySteps({ presenter: "following", voting: "named" })).toEqual(["followIcon", "votingWord", "votingIcon"])
    expect(giveWaySteps({ presenter: "someone", voting: "named" })).toEqual(["votingWord", "presenterName", "votingIcon", "presenterIcon"])
    expect(giveWaySteps({ presenter: "someone", voting: "count" })).toEqual(["presenterName", "presenterIcon"])
    expect(giveWaySteps({ presenter: "following", voting: null })).toEqual(["followIcon"])
    expect(giveWaySteps({ presenter: null, voting: "named" })).toEqual(["votingWord", "votingIcon"])
  })
  it("never takes your own state's words, or an editor's votes left", () => {
    expect(giveWaySteps({ presenter: "you", voting: "count" })).toEqual([])
    expect(giveWaySteps({ presenter: null, voting: "count" })).toEqual([])
    expect(giveWaySteps({ presenter: null, voting: null })).toEqual([])
  })
  it("draws each segment in the form the steps given leave it", () => {
    const crowded = { presenter: "someone", voting: "named" } as const
    expect(barForms(crowded, 0)).toEqual({ presenter: "full", voting: "full" })
    expect(barForms(crowded, 1)).toEqual({ presenter: "full", voting: "word" })
    expect(barForms(crowded, 2)).toEqual({ presenter: "name", voting: "word" })
    expect(barForms(crowded, 3)).toEqual({ presenter: "name", voting: "icon" })
    expect(barForms(crowded, 4)).toEqual({ presenter: "icon", voting: "icon" })
    expect(barForms(crowded, 9)).toEqual({ presenter: "icon", voting: "icon" })
    // Following, the frame's label names the presenter: the segment's icon is enough, and goes first.
    expect(barForms({ presenter: "following", voting: "named" }, 1)).toEqual({ presenter: "icon", voting: "full" })
    expect(barForms({ presenter: "you", voting: "count" }, 3)).toEqual({ presenter: "full", voting: "full" })
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
