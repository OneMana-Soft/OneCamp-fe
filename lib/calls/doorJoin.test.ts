import { afterEach, describe, expect, it } from "vitest"

import { keepDoorJoin, peekDoorJoin, takeDoorJoin } from "./doorJoin"

// "Join as Kai Lin" at a guest link (calls HU13) goes to the member door in
// the app, which joins at once with the choices made at the link. The choice
// is kept in this tab only, for a minute, for that door alone, and taken once:
// an address someone sends can't join anybody to a call.
afterEach(() => sessionStorage.clear())

const door = "/app/meet/join/tok"
const choice = { audioEnabled: true, videoEnabled: false }

describe("a join chosen at a guest link", () => {
  it("is taken once, by its own door, while fresh", () => {
    keepDoorJoin(door, choice, 1_000)
    expect(takeDoorJoin("/app/meet/join/other", 2_000)).toBeNull()
    expect(takeDoorJoin(door, 2_000)).toEqual(choice)
    expect(takeDoorJoin(door, 2_000)).toBeNull()
  })

  it("can be read without taking it, as a door's first render reads it", () => {
    keepDoorJoin(door, choice, 1_000)
    expect(peekDoorJoin(door, 2_000)).toEqual(choice)
    expect(peekDoorJoin(door, 2_000)).toEqual(choice)
    expect(peekDoorJoin("/app/meet/join/other", 2_000)).toBeNull()
    expect(takeDoorJoin(door, 2_000)).toEqual(choice)
    expect(peekDoorJoin(door, 2_000)).toBeNull()
  })

  it("is gone after a minute", () => {
    keepDoorJoin(door, choice, 1_000)
    expect(takeDoorJoin(door, 1_000 + 60_001)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it("is nothing when the tab never chose, or what it kept can't be read", () => {
    expect(takeDoorJoin(door)).toBeNull()
    sessionStorage.setItem("onecamp:door-join", "{not json")
    expect(takeDoorJoin(door)).toBeNull()
    sessionStorage.setItem("onecamp:door-join", JSON.stringify({ path: door, at: Date.now(), audioEnabled: "yes", videoEnabled: false }))
    expect(takeDoorJoin(door)).toBeNull()
  })
})
