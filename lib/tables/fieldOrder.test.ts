import { describe, expect, it } from "vitest"
import { fieldOrder } from "@/lib/tables/fieldOrder"

const field = (id: string, position: number, primary?: boolean) => ({ id, position, primary })

describe("fieldOrder", () => {
  it("puts fields by position", () => {
    expect(fieldOrder([field("c", 3), field("a", 1), field("b", 2)]).map((f) => f.id)).toEqual(["a", "b", "c"])
  })

  it("leads with the primary field, even when a field was given a place before it", () => {
    const fields = [field("moved", -1), field("name", 0, true), field("notes", 1)]
    expect(fieldOrder(fields).map((f) => f.id)).toEqual(["name", "moved", "notes"])
  })

  it("keeps the rest in their places around a primary field further along", () => {
    const fields = [field("a", 0), field("b", 1), field("p", 2, true), field("c", 3)]
    expect(fieldOrder(fields).map((f) => f.id)).toEqual(["p", "a", "b", "c"])
  })

  it("leads with the first by position on a table with none marked, and is empty for no fields", () => {
    expect(fieldOrder([field("b", 1), field("a", 0)])[0].id).toBe("a")
    expect(fieldOrder([])).toEqual([])
  })

  it("never changes the list it was given", () => {
    const fields = [field("b", 1), field("p", 2, true), field("a", 0)]
    fieldOrder(fields)
    expect(fields.map((f) => f.id)).toEqual(["b", "p", "a"])
  })
})
