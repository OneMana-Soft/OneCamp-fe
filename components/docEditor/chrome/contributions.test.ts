import { describe, expect, it } from "vitest"
import { actionsFor, dialogFor, slotFor } from "@/components/docEditor/registry/registry"
import { actionGroupsFor } from "@/components/docEditor/registry/readers"
import { NO_BUS } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { MORE_GROUPS, SHEET_GROUPS } from "@/components/docEditor/actions/doc"
import "./register"
import { offerPageActions } from "./contributions"
import { setFacts } from "./pageFacts"

// What the page guard offers once it has handed the router over (PageGuard).
offerPageActions()

const gate = { ai: false }
const ctx = (docId: string, canEdit: boolean): ActionContext => ({ docId, editor: null, canEdit, bus: NO_BUS, gate, state: { desktop: true } })
const ids = (surface: "more" | "phoneSheet" | "palette", c: ActionContext, order: string[] = []) => actionGroupsFor(surface, c, order).flatMap((g) => g.actions.map((a) => a.action.id))
const B6 = ["doc.star", "doc.customize", "doc.lock", "doc.duplicate", "doc.moveTo", "doc.transfer", "doc.trash"]

describe("B6's contributions to the doc's page", () => {
  it("draws the breadcrumb, the lock chip and the page guard from slots", () => {
    expect(slotFor("crumbs", gate).map((s) => s.id)).toContain("b6.breadcrumbs")
    expect(slotFor("titleChips", gate).map((s) => s.id)).toContain("b6.lock")
    expect(slotFor("editorOverlay", gate).map((s) => s.id)).toContain("b6.page")
  })

  it("registers the dialogs it owns, Move to among them (B1's block menu looks it up)", () => {
    for (const id of ["doc.moveTo", "doc.lock", "doc.transfer", "doc.customize"]) expect(dialogFor(id, gate)?.id).toBe(id)
  })

  it("offers an editor its page actions on every surface, and Delete last, alone", () => {
    for (const surface of ["more", "phoneSheet", "palette"] as const) {
      const shown = ids(surface, ctx("e1", true), surface === "phoneSheet" ? SHEET_GROUPS : MORE_GROUPS)
      expect(B6.filter((id) => id !== "doc.transfer").every((id) => shown.includes(id))).toBe(true)
    }
    const groups = actionGroupsFor("more", ctx("e1", true), MORE_GROUPS)
    expect(groups[groups.length - 1].actions.map((a) => a.action.id)).toContain("doc.trash")
  })

  it("gives a reader no way to move, lock or delete, and only an owner a way to hand the doc on", () => {
    const reader = ids("more", ctx("r1", false))
    for (const id of ["doc.moveTo", "doc.lock", "doc.trash", "doc.transfer"]) expect(reader).not.toContain(id)
    expect(reader).toEqual(expect.arrayContaining(["doc.star", "doc.duplicate", "doc.customize"]))
    setFacts("o1", { owner: true })
    expect(ids("more", ctx("o1", true))).toContain("doc.transfer")
    // The owner may delete even where the lock holds them off the text.
    expect(ids("more", ctx("o1", false))).toContain("doc.trash")
  })

  it("says what is on: Starred, and Unlock page… once it is locked", () => {
    setFacts("s1", { starred: true, lock: "soft" })
    const shown = actionGroupsFor("more", ctx("s1", true)).flatMap((g) => g.actions)
    expect(shown.find((a) => a.action.id === "doc.star")).toMatchObject({ label: "Starred", checked: true })
    expect(shown.find((a) => a.action.id === "doc.lock")?.label).toBe("Unlock page…")
    expect(actionsFor("more", gate).find((a) => a.id === "doc.customize")?.label).toBe("Customise page")
  })
})
