import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocMovePreview } from "@/types/docGraph"

const hoisted = vi.hoisted(() => ({ preview: vi.fn() }))
vi.mock("@/services/docGraphService", () => ({ previewDocMove: hoisted.preview }))

import { moveReason, movePlanOf, planMove } from "./docMove"

const quiet: DocMovePreview = { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." }
const launch = { kind: "project" as const, uuid: "x", name: "Launch", members: 3 }

beforeEach(() => hoisted.preview.mockReset().mockResolvedValue(quiet))

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
