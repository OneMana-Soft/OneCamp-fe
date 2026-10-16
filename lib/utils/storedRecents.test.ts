import { afterEach, describe, expect, it, vi } from "vitest"
import { storedRecents } from "./storedRecents"

const ids = () => storedRecents<string>("test-recents", 3, { valid: (x): x is string => typeof x === "string", same: (a, b) => a === b })

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("a stored recents list", () => {
  it("keeps each item once, newest first, at most its size", () => {
    const r = ids()
    for (const id of ["a", "b", "c", "a", "d"]) r.note(id)
    expect(r.read()).toEqual(["d", "a", "c"])
  })

  it("leaves out what isn't an item, and reads nothing it can't parse", () => {
    localStorage.setItem("test-recents", JSON.stringify(["a", 3, null, "b"]))
    expect(ids().read()).toEqual(["a", "b"])
    localStorage.setItem("test-recents", "{not json")
    expect(ids().read()).toEqual([])
  })

  it("reads as empty and keeps nothing where storage can't be reached", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private window")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private window")
    })
    const r = ids()
    expect(() => r.note("a")).not.toThrow()
    expect(r.read()).toEqual([])
  })
})
