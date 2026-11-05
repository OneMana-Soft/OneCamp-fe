import { describe, expect, it } from "vitest"
import { nameList, nameParts } from "@/lib/utils/format/nameList"

describe("names in a sentence", () => {
  it("names everyone up to one past the limit, then counts the rest", () => {
    expect(nameList([])).toBe("")
    expect(nameList(["Maya"])).toBe("Maya")
    expect(nameList(["Maya", "Jonas"])).toBe("Maya and Jonas")
    expect(nameList(["Maya", "Jonas", "Sam"])).toBe("Maya, Jonas and Sam")
    expect(nameList(["Maya", "Jonas", "Sam", "Lee"])).toBe("Maya, Jonas and 2 others")
    expect(nameList(["Maya", "Jonas", "Sam", "Lee"], 3)).toBe("Maya, Jonas, Sam and Lee")
    expect(nameList(["Maya", "Jonas", "Sam", "Lee", "Ana"], 3)).toBe("Maya, Jonas, Sam and 2 others")
    expect(nameList(["Maya", "", "Jonas"])).toBe("Maya and Jonas")
  })

  it("counts people it can't name too, such as a call's guests", () => {
    expect(nameList(["Jonas", "Maya"], 2, 3)).toBe("Jonas, Maya and 1 other")
    expect(nameList(["Maya"], 2, 2)).toBe("Maya and 1 other")
    expect(nameList(["Maya", "Jonas", "Sam"], 2, 5)).toBe("Maya, Jonas and 3 others")
    expect(nameList([], 2, 2)).toBe("2 people")
    expect(nameList([], 2, 1)).toBe("1 person")
    // A total under the names counts the names.
    expect(nameList(["Maya", "Jonas"], 2, 1)).toBe("Maya and Jonas")
    // The parts a line draws apart: the names written, and how many are counted instead.
    expect(nameParts(["Maya", "Jonas", "Sam", "Lee"], 2, 6)).toEqual([["Maya", "Jonas"], 4])
    expect(nameParts(["Maya", "Jonas", "Sam"], 2, 3)).toEqual([["Maya", "Jonas", "Sam"], 0])
  })
})
