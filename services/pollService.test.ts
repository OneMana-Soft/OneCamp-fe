import { describe, expect, it } from "vitest"
import { nextChoice, shares } from "./pollService"

describe("voting in a poll", () => {
  it("replaces the choice in a single-choice poll, and takes it back on a second click", () => {
    expect(nextChoice({ multiple: false, mine: [] }, "1")).toEqual(["1"])
    expect(nextChoice({ multiple: false, mine: ["1"] }, "2")).toEqual(["2"])
    expect(nextChoice({ multiple: false, mine: ["1"] }, "1")).toEqual([])
  })

  it("toggles each option in a multiple-choice poll", () => {
    expect(nextChoice({ multiple: true, mine: ["1"] }, "2")).toEqual(["1", "2"])
    expect(nextChoice({ multiple: true, mine: ["1", "2"] }, "1")).toEqual(["2"])
  })
})

describe("the result bars", () => {
  it("split the votes cast, and stay empty before anyone votes", () => {
    expect(shares([{ id: "1", text: "a", votes: 3 }, { id: "2", text: "b", votes: 1 }])).toEqual([75, 25])
    expect(shares([{ id: "1", text: "a", votes: 0 }, { id: "2", text: "b", votes: 0 }])).toEqual([0, 0])
  })
})
