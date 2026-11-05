import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { firstProtected, protectedBy, protectionDone, protectionLabel, protectionPlan, putBackCopy, readProtection, PROTECTED } from "@/lib/board/protection"

const ann = { by: "u-ann", name: "Ann Rao", at: 1 }
const record = (entries: Record<string, typeof ann>) => new Map(Object.entries(entries))

describe("readProtection", () => {
  it("reads the server's record, and counts an entry it can't read as protected by nobody named", () => {
    const doc = new Y.Doc()
    const map = doc.getMap<unknown>(PROTECTED)
    map.set("a", ann)
    map.set("b", "junk")
    const r = readProtection(map)
    expect(r.get("a")).toEqual(ann)
    expect(r.get("b")).toEqual({ by: "", name: "", at: 0 })
    expect(readProtection(doc.getMap("empty")).size).toBe(0)
  })
})

describe("protectionPlan", () => {
  it("protects every object selected, its words going with their shape", () => {
    const sel = [{ id: "box" }, { id: "words", containerId: "box" }, { id: "arrow" }, { id: "gone", isDeleted: true }]
    expect(protectionPlan(sel, new Map())).toEqual({ protect: true, ids: ["box", "arrow"] })
  })
  it("lifts only the protected ones once any is", () => {
    const sel = [{ id: "box" }, { id: "arrow" }]
    expect(protectionPlan(sel, record({ arrow: ann }))).toEqual({ protect: false, ids: ["arrow"] })
  })
  it("keeps words whose shape isn't selected", () => {
    expect(protectionPlan([{ id: "words", containerId: "box" }], new Map())).toEqual({ protect: true, ids: ["words"] })
  })
})

describe("words", () => {
  it("names a press by what it acts on", () => {
    expect(protectionLabel(true, 1)).toBe("Protect 1 object")
    expect(protectionLabel(false, 3)).toBe("Lift protection from 3 objects")
  })
  it("names who protected them", () => {
    expect(protectedBy(["a"], record({ a: ann }))).toBe("Protected by Ann Rao")
    expect(protectedBy(["a", "b"], record({ a: ann, b: { ...ann, name: "Sam" } }))).toBe("Protected by Ann Rao and others")
    expect(protectedBy(["a"], record({ a: { ...ann, name: " " } }))).toBe("Protected by the board's owner")
    expect(protectedBy(["x"], record({ a: ann }))).toBe("")
  })
  it("says what a press changed", () => {
    expect(protectionDone(true, 2).title).toBe("Protected 2 objects")
    expect(protectionDone(false, 1).title).toBe("Lifted protection from 1 object")
    expect(protectionDone(true, 0)).toEqual({ title: "Already protected", description: "Nothing changed." })
  })
  it("tells a tab whose change is put back what to do, by who may", () => {
    expect(putBackCopy(ann, true).description).toBe("Lift its protection first, then change it. Ann Rao protected it.")
    expect(putBackCopy(ann, false).description).toMatch(/^Only the board's owner and admins can change it/)
    expect(putBackCopy(undefined, false).description).not.toMatch(/protected it\.$/)
  })
})

describe("firstProtected", () => {
  it("finds a protected id among the changed ones", () => {
    expect(firstProtected(new Set(["x", "a"]), record({ a: ann }))).toBe("a")
    expect(firstProtected(["x"], record({ a: ann }))).toBeNull()
    expect(firstProtected(["a"], new Map())).toBeNull()
  })
})
