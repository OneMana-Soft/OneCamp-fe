import { afterEach, describe, expect, it } from "vitest"
import { placeOf } from "./taskSequence"

afterEach(() => {
  document.body.innerHTML = ""
})

const list = (marked: boolean, ids: string[]) =>
  `<div ${marked ? "data-task-sequence" : ""}>${ids.map((id) => `<div data-task-id="${id}"></div>`).join("")}</div>`

describe("a task's place in the list on screen", () => {
  it("is its position among the list's rows, with the rows either side", () => {
    document.body.innerHTML = list(true, ["a", "b", "c", "b"])
    expect(placeOf("b")).toEqual({ index: 2, total: 3, prev: "a", next: "c" })
    expect(placeOf("a")).toEqual({ index: 1, total: 3, prev: undefined, next: "b" })
  })

  it("is nowhere for a task in no marked list (the panel's own sub-task rows, a search)", () => {
    document.body.innerHTML = list(false, ["a", "b"]) + list(true, ["c"])
    expect(placeOf("a")).toEqual({ index: 0, total: 0 })
    expect(placeOf("zzz")).toEqual({ index: 0, total: 0 })
    expect(placeOf("")).toEqual({ index: 0, total: 0 })
  })

  it("is read from the list that holds it, when two are on screen", () => {
    document.body.innerHTML = list(true, ["a", "b"]) + list(true, ["c", "d", "e"])
    expect(placeOf("d")).toEqual({ index: 2, total: 3, prev: "c", next: "e" })
  })
})
