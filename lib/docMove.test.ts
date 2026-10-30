import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocMovePreview } from "@/types/docGraph"

const hoisted = vi.hoisted(() => ({ preview: vi.fn(), move: vi.fn() }))
vi.mock("@/services/docGraphService", () => ({ previewDocMove: hoisted.preview, moveDoc: hoisted.move }))

import { moveAll, moveReason, movePlanOf, placeBack, planMove } from "./docMove"

const quiet: DocMovePreview = { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." }
const launch = { kind: "project" as const, uuid: "x", name: "Launch", members: 3 }

beforeEach(() => hoisted.preview.mockReset().mockResolvedValue(quiet))

// Move to…'s Undo puts what moved back where it was, not at the end of
// where it was (code review of F1b).
describe("putting a move back", () => {
  it("puts an item after the sibling it followed, first when it led, and last only when its place wasn't known", () => {
    expect(placeBack({ id: "a", title: "A", from: "f", after: "x" }, "workspace")).toEqual({ doc_uuid: "a", parent_uuid: "f", after_uuid: "x", access: "keep" })
    expect(placeBack({ id: "a", title: "A", from: null, after: null }, "project:p-1")).toEqual({ doc_uuid: "a", space: "project:p-1", place: "first", access: "keep" })
    expect(placeBack({ id: "a", title: "A", from: "f" }, "workspace")).toEqual({ doc_uuid: "a", parent_uuid: "f", place: "last", access: "keep" })
  })

  it("stops at the first move refused, and Undo puts back only what moved, the last first", async () => {
    hoisted.move.mockReset().mockResolvedValueOnce({ access: "keep" }).mockResolvedValueOnce({ access: "keep" }).mockRejectedValueOnce(new Error("refused"))
    const items = ["a", "b", "c"].map((id) => ({ id, title: id, from: "f", after: "x" }))
    const done = await moveAll(items, (i) => ({ doc_uuid: i.id, parent_uuid: "g", access: "keep" }), "workspace")
    expect(done.moved.map((i) => i.id)).toEqual(["a", "b"])
    expect(done.error).toBeInstanceOf(Error)
    hoisted.move.mockReset().mockResolvedValue({ access: "keep" })
    await done.undo?.()
    expect(hoisted.move.mock.calls.map(([m]) => m.doc_uuid)).toEqual(["b", "a"])
  })

  it("offers no Undo once a page took its new parent's access", async () => {
    hoisted.move.mockReset().mockResolvedValue({ access: "adopt" })
    expect((await moveAll([{ id: "a", title: "A", from: null }], (i) => ({ doc_uuid: i.id, parent_uuid: "g", access: "adopt" }), "workspace")).undo).toBeNull()
  })
})

// Moving a page asks before it changes who can open it (PROGRAM §3.2), the
// same way from every place a page is moved.
describe("planning a move", () => {
  it("moves at once when nobody's access changes: into a page with its access when offered", () => {
    expect(movePlanOf(quiet, true)).toEqual({ ask: false, access: "adopt" })
    expect(movePlanOf(quiet, false)).toEqual({ ask: false, access: "keep" })
    expect(movePlanOf({ ...quiet, available: false, lose: 4 }, true)).toEqual({ ask: false, access: "keep" })
  })

  it("asks when anyone's access would change, whether or not there's an access to take", () => {
    for (const p of [{ ...quiet, lose: 2 }, { ...quiet, gain: 1 }, { ...quiet, everyone: { from: "view", to: "none" } }]) {
      expect(movePlanOf(p, true)).toEqual({ ask: true, preview: p })
    }
    const leaving = { ...quiet, lose: 2, space: null, was: launch, summary: "2 people lose access." }
    expect(movePlanOf(leaving, false)).toEqual({ ask: true, preview: leaving })
  })

  it("keeps a page's access without asking when only adopting would change it and the mover can't adopt", () => {
    expect(movePlanOf({ ...quiet, can_adopt: false, lose: 2 }, true)).toEqual({ ask: false, access: "keep" })
  })

  it("previews adopting under a page only when the question can offer it, and keeping everywhere else", async () => {
    await planMove({ doc_uuid: "d", parent_uuid: "p", place: "last" }, true)
    expect(hoisted.preview).toHaveBeenLastCalledWith({ doc_uuid: "d", parent_uuid: "p", place: "last", access: "adopt" })
    await planMove({ doc_uuid: "d", parent_uuid: "p", place: "last" }, false)
    expect(hoisted.preview).toHaveBeenLastCalledWith({ doc_uuid: "d", parent_uuid: "p", place: "last", access: "keep" })
    await planMove({ doc_uuid: "d", space: "workspace", place: "last" }, true)
    expect(hoisted.preview).toHaveBeenLastCalledWith({ doc_uuid: "d", space: "workspace", place: "last", access: "keep" })
  })

  it("lets a refusal through, so the move is never made past it", async () => {
    hoisted.preview.mockRejectedValueOnce(new Error("needs_full_access"))
    await expect(planMove({ doc_uuid: "d", space: "workspace" }, false)).rejects.toThrow("needs_full_access")
  })

  it("says why a move into or out of a space changes who can open the page", () => {
    expect(moveReason({ space: launch }, "Plan")).toBe("“Plan” goes into “Launch”, and everyone in it can open it there.")
    expect(moveReason({ space: null, was: launch }, "Plan")).toBe("“Plan” leaves “Launch”, and being in it no longer lets people open it.")
    expect(moveReason({}, "Plan")).toBeNull()
  })
})
