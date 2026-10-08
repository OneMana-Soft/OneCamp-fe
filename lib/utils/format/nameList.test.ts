import { describe, expect, it } from "vitest"
import { nameList } from "@/lib/utils/format/nameList"

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
})
