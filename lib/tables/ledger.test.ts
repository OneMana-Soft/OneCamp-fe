import { describe, expect, it } from "vitest"
import { rowsText, undoableWrite, undoneNote, type UndoResult } from "@/lib/tables/ledger"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

const result = (skipped: number): UndoResult => ({ change_set: "u", reversed: "c", kind: "edit", changes: 3, skipped })

describe("an undo's toast", () => {
  it("says it's done, and nothing more when every change came back", () => {
    expect(undoneNote(result(0))).toEqual({ title: "Undone" })
    expect(undoneNote(result(0), true)).toEqual({ title: "Redone" })
  })

  it("says what it left, as it changed again since", () => {
    expect(undoneNote(result(1))).toEqual({ title: "Undone", description: "1 change was left as it is: it changed again since." })
    expect(undoneNote(result(2), true)).toEqual({ title: "Redone", description: "2 changes were left as they are: they changed again since." })
  })
})

describe("a count of rows", () => {
  it("is a row, or rows", () => {
    expect(rowsText(1)).toBe("1 row")
    expect(rowsText(1000)).toBe(`${(1000).toLocaleString()} rows`)
  })
})

// V-381: a toast offers its write's Undo only while that write stands. A write a Ctrl+Z took while it was on its way is
// undone already, and a second Undo of it answers 409 "That change was undone already": so its toast offers none, as
// a range's write offers none then (writeCells' undone).
describe("a write whose toast offers its Undo", () => {
  const into = (o: UndoOrder): UndoOrder["write"] => (what, send, setOf, onTaken) => o.write(what, send, setOf, onTaken)
  /** A write held on its way, with a Ctrl+Z pressed meanwhile: what the toast is offered, and what the Ctrl+Z took. */
  async function takenOnItsWay<T>(answer: T, setOf?: (a: T) => string | null | undefined) {
    const o = new UndoOrder()
    let land!: (a: T) => void
    const going = undoableWrite(into(o), "replace", () => new Promise<T>((r) => (land = r)), setOf)
    const aims: Aim[] = []
    const pressed = o.press(async (aim) => void aims.push(aim))
    land(answer)
    const offered = await going
    await pressed
    return { offered, aims }
  }

  it("offers the change set its answer names, or none when it stored nothing", async () => {
    const o = new UndoOrder()
    expect(await undoableWrite(into(o), "delete", async () => ({ change_set: "c1", deleted: ["r1"] }))).toEqual({ answer: { change_set: "c1", deleted: ["r1"] }, set: "c1" })
    expect((await undoableWrite(into(o), "delete", async () => ({ change_set: null }))).set).toBeNull()
    expect((await undoableWrite(into(o), "replace", async () => ({ change_sets: ["c3", "c4"] }), (t) => t.change_sets[0] ?? null)).set).toBe("c3")
  })

  it("offers none for a write an Undo pressed while it was on its way took, though its answer names one", async () => {
    const { offered, aims } = await takenOnItsWay({ change_set: "c2" })
    expect(offered).toEqual({ answer: { change_set: "c2" }, set: null })
    expect(aims, "the Undo on its way took it, by its change set").toEqual([{ kind: "set", set: "c2" }])
  })

  it("reads the set the order takes by the same setOf (a clean-up's or a replace's first change set)", async () => {
    const { offered, aims } = await takenOnItsWay({ change_sets: ["c5", "c6"] }, (t) => t.change_sets[0] ?? null)
    expect(offered.set).toBeNull()
    expect(aims).toEqual([{ kind: "set", set: "c5" }])
  })
})
