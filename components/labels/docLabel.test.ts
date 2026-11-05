import { describe, expect, it, vi } from "vitest"
import { dialogFor, slotFor } from "@/components/docEditor/registry/registry"
import { actionGroupsFor } from "@/components/docEditor/registry/readers"
import type { ActionContext, DocCommandBus } from "@/components/docEditor/registry/types"
import { MORE_GROUPS, SHEET_GROUPS } from "@/components/docEditor/actions/doc"
import "@/components/docEditor/chrome/register"
import { offerPageActions } from "@/components/docEditor/chrome/contributions"

// What the page guard offers once it has handed the router over (PageGuard).
offerPageActions()

const gate = { ai: false }
const ctx = (canEdit: boolean, bus: DocCommandBus = { emit: vi.fn(), on: () => () => {} } as unknown as DocCommandBus): ActionContext => ({ docId: "d-1", editor: null, canEdit, bus, gate, state: { desktop: true } })
const ids = (surface: "more" | "phoneSheet" | "palette", c: ActionContext) =>
  actionGroupsFor(surface, c, surface === "phoneSheet" ? SHEET_GROUPS : MORE_GROUPS).flatMap((g) => g.actions.map((a) => a.action.id))

describe("a doc's sensitivity label in its chrome (miro-44 L)", () => {
  it("draws the label beside the title from the titleChips slot, after the lock, on a computer's header and a phone's title band", () => {
    const chips = slotFor("titleChips", gate).map((s) => s.id)
    expect(chips).toContain("l.label")
    expect(chips.indexOf("l.label")).toBeGreaterThan(chips.indexOf("b6.lock"))
  })

  it("offers Label… to someone who can edit the doc on every surface, and not to a reader", () => {
    for (const surface of ["more", "phoneSheet", "palette"] as const) {
      expect(ids(surface, ctx(true))).toContain("doc.label")
      expect(ids(surface, ctx(false))).not.toContain("doc.label")
    }
  })

  it("opens the doc.label dialog, which is registered for both editions", async () => {
    const emit = vi.fn()
    const c = ctx(true, { emit, on: () => () => {} } as unknown as DocCommandBus)
    const action = actionGroupsFor("more", c, MORE_GROUPS)
      .flatMap((g) => g.actions)
      .find((a) => a.action.id === "doc.label")!
    await action.action.run(c)
    expect(emit).toHaveBeenCalledWith("openDialog", { id: "doc.label" })
    expect(dialogFor("doc.label", gate)?.id).toBe("doc.label")
    expect(dialogFor("doc.label", { ai: true })?.id).toBe("doc.label")
  })
})
