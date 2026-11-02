import { describe, expect, it, vi } from "vitest"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

// V-360 (DB-93's r3 frames, 2 Nov): a Ctrl+Z pressed while a fill was on its
// way took back the edit BEFORE it (the server's latest was that edit), and
// the fill landed afterwards. The table's writes now enter one order when
// they are made, and an Undo pressed meanwhile aims at the last one made.

/** A write's answer, held until the test lets it go. */
function held() {
  let answer!: (a: unknown) => void
  let refuse!: (e: unknown) => void
  const going = new Promise<unknown>((res, rej) => {
    answer = res
    refuse = rej
  })
  return { going, answer, refuse }
}

/** Lets every settled promise's callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** A press's run that records what it was asked to take back, and finishes when the test says. */
function runs() {
  const aims: Aim[] = []
  const finish: (() => void)[] = []
  const run = vi.fn(
    (aim: Aim) =>
      new Promise<string>((res) => {
        aims.push(aim)
        finish.push(() => res(`ran ${aims.length}`))
      }),
  )
  return { run, aims, finish }
}

describe("an Undo in the table's order of writes", () => {
  it("takes back the reader's latest at once when nothing is on its way, as before", async () => {
    const order = new UndoOrder()
    const r = runs()
    void order.press(r.run)
    await settle()
    expect(r.aims).toEqual([{ kind: "latest" }])
  })

  it("pressed while a fill is on its way, waits for it and takes back THAT fill by its change set", async () => {
    const order = new UndoOrder()
    const fill = held()
    order.made("fill", fill.going)
    const r = runs()
    void order.press(r.run)
    await settle()
    expect(r.run, "nothing is taken back while the fill is on its way").not.toHaveBeenCalled()
    fill.answer({ change_set: "c9" })
    await settle()
    expect(r.aims).toEqual([{ kind: "set", set: "c9" }])
  })

  it("pressed while an edit answered by a server from before V-360 (no change set in its answer) is on its way, waits for it, then takes back the reader's latest (that edit), as before: mid-deploy", async () => {
    const order = new UndoOrder()
    const edit = held()
    order.made("edit", edit.going)
    const r = runs()
    void order.press(r.run)
    await settle()
    expect(r.run).not.toHaveBeenCalled()
    edit.answer({})
    await settle()
    expect(r.aims).toEqual([{ kind: "latest" }])
  })

  it("aimed at a fill that wasn't saved, takes back nothing and says what it was: never the edit before it", async () => {
    const order = new UndoOrder()
    order.made("edit", Promise.resolve({}))
    await settle()
    const fill = held()
    order.made("fill", fill.going)
    const r = runs()
    void order.press(r.run)
    fill.refuse(new Error("400"))
    await settle()
    expect(r.aims).toEqual([{ kind: "lost", what: "fill" }])
  })

  it("a write refused before any Undo leaves the order: a later Undo takes back the reader's latest, as before", async () => {
    const order = new UndoOrder()
    order.made("fill", Promise.reject(new Error("400")))
    await settle()
    const r = runs()
    void order.press(r.run)
    await settle()
    expect(r.aims).toEqual([{ kind: "latest" }])
  })

  it("two quick Undos take back the last two writes, one after the other", async () => {
    const order = new UndoOrder()
    const edit = held()
    const fill = held()
    order.made("edit", edit.going)
    order.made("fill", fill.going)
    const r = runs()
    void order.press(r.run)
    void order.press(r.run)
    fill.answer({ change_set: "c2" })
    edit.answer({ change_set: "c1" })
    await settle()
    expect(r.aims, "the first waits for both, then takes the fill").toEqual([{ kind: "set", set: "c2" }])
    r.finish[0]()
    await settle()
    expect(r.aims, "the second runs once the first has, and takes the edit by its own change set").toEqual([
      { kind: "set", set: "c2" },
      { kind: "set", set: "c1" },
    ])
  })

  it("tells the write it takes at once, so its cells can go back before any answer", () => {
    const order = new UndoOrder()
    const fill = held()
    const taken = vi.fn()
    const w = order.made("fill", fill.going, taken)
    expect(w.taken()).toBe(false)
    void order.press(runs().run)
    expect(taken).toHaveBeenCalledTimes(1)
    expect(w.taken()).toBe(true)
  })

  it("holds a write made while an Undo is running until it has run, and never one made before it", async () => {
    const order = new UndoOrder()
    expect(order.ready(), "with no Undo running, a write goes at once").toBeNull()
    const r = runs()
    void order.press(r.run)
    const ready = order.ready()
    expect(ready, "a write made now waits").not.toBeNull()
    let sent = false
    void ready!.then(() => (sent = true))
    await settle()
    expect(sent).toBe(false)
    r.finish[0]()
    await settle()
    expect(sent).toBe(true)
    expect(order.ready()).toBeNull()
  })

  it("a Redo waits for the writes made before it, takes none of them, and runs in turn", async () => {
    const order = new UndoOrder()
    const fill = held()
    const taken = vi.fn()
    const w = order.made("fill", fill.going, taken)
    const r = runs()
    void order.press(r.run, false)
    await settle()
    expect(r.run).not.toHaveBeenCalled()
    fill.answer({ change_set: "c5" })
    await settle()
    expect(r.aims).toEqual([{ kind: "latest" }])
    expect(taken).not.toHaveBeenCalled()
    expect(w.taken()).toBe(false)
  })

  it("answers with what its run did, and a run that fails stops none of the presses after it", async () => {
    const order = new UndoOrder()
    const failing = order.press(() => Promise.reject(new Error("offline")))
    const next = order.press(() => Promise.resolve("undone"))
    await expect(failing).rejects.toThrow("offline")
    await expect(next).resolves.toBe("undone")
  })
})

// Main's 3b: a write outside a row's cells (a new row, a delete, a find's
// replace) enters the same order, so an Undo never skips it for the change
// before it.
describe("a write of whole rows, in the table's order", () => {
  it("is what an Undo pressed on its way takes, by the change set its answer names; one made while the Undo runs is sent after it", async () => {
    const order = new UndoOrder()
    let land: (a: { change_set: string }) => void = () => undefined
    void order.write("delete", () => new Promise<{ change_set: string }>((r) => (land = r)))
    const aims: Aim[] = []
    const sent: string[] = []
    const undone = order.press(async (aim) => {
      aims.push(aim)
      sent.push("undo")
      return "undone"
    })
    const after = order.write("row", async () => void sent.push("add"))
    await Promise.resolve()
    expect(aims, "nothing is taken back while the delete is on its way").toEqual([])
    expect(sent, "a row added meanwhile waits for the Undo").toEqual([])
    land({ change_set: "c9" })
    await expect(undone).resolves.toBe("undone")
    await after
    expect(aims).toEqual([{ kind: "set", set: "c9" }])
    expect(sent).toEqual(["undo", "add"])
  })

  it("refused, takes nothing back: never the change before it", async () => {
    const order = new UndoOrder()
    const refused = order.write("row", () => Promise.reject(new Error("refused"))).catch(() => "caught")
    await expect(order.press(async (aim) => aim)).resolves.toEqual({ kind: "lost", what: "row" })
    await expect(refused).resolves.toBe("caught")
  })
})

describe("a step that wrote nothing, in the table's order", () => {
  it("is nothing to take back: an Undo pressed on its way says it changed nothing, never takes the change before it", async () => {
    const order = new UndoOrder()
    let land!: (r: { change_sets: string[] }) => void
    const going = order.write("replace", () => new Promise<{ change_sets: string[] }>((r) => (land = r)), (r) => r.change_sets[0] ?? null)
    const aimed = order.press(async (aim) => aim)
    land({ change_sets: [] })
    await going
    await expect(aimed).resolves.toEqual({ kind: "none", what: "replace" })
  })
})

// CR-190's MUST 1 (a), main's ruling 3 Nov 01:0x: every row write's answer names the change set it stored, so an Undo
// on its way aims exactly, whatever order the writes land in. The server's latest is the last to LAND (CR-190's F1).
describe("an Undo on its way, by the change set each answer names (V-360)", () => {
  it("takes the write made last when two land out of order: by its own change set, never the last to land", async () => {
    const order = new UndoOrder()
    const a = held()
    const b = held()
    order.made("edit", a.going)
    order.made("edit", b.going)
    const aimed = order.press(async (aim) => aim)
    b.answer({ change_set: "cB" })
    await settle()
    a.answer({ change_set: "cA" })
    await expect(aimed).resolves.toEqual({ kind: "set", set: "cB" })
  })

  it("reads each answer's change_set by default: an id is that set, null changed nothing, and none (a server from before V-360) is the reader's latest", async () => {
    const aimOf = (answer: unknown) => {
      const order = new UndoOrder()
      void order.write("row", async () => answer)
      return order.press(async (aim) => aim)
    }
    await expect(aimOf({ id: "r9", change_set: "c3" })).resolves.toEqual({ kind: "set", set: "c3" })
    await expect(aimOf({ id: "r9", change_set: null })).resolves.toEqual({ kind: "none", what: "row" })
    await expect(aimOf({ id: "r9" })).resolves.toEqual({ kind: "latest" })
    await expect(aimOf(undefined)).resolves.toEqual({ kind: "latest" })
  })

  it("counts a write whose answer its setOf can't read as lost, and the presses after it still run", async () => {
    const order = new UndoOrder()
    void order.write("fill", async () => ({}), () => {
      throw new Error("no set")
    })
    await expect(order.press(async (aim) => aim)).resolves.toEqual({ kind: "lost", what: "fill" })
    await expect(order.press(async (aim) => aim)).resolves.toEqual({ kind: "latest" })
  })
})
