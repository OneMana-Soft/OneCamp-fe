import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The phone's doc sheet (QA DSA-06, DSA-14, 14 Oct 2026). It built a context
// of its own, so it knew nothing of Later, focus mode or who may share, and
// it had no Export, Copy link, Save for later, Notifications, Import or Focus
// mode at all. It draws the doc page's own context now, as More does, with
// the four exports behind one row.

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { doc_title: "Q4 launch plan", doc_edit_access: 1 } } }) }))
// What the person may do comes with the page's context; the sheet's own is only a fallback.
vi.mock("@/hooks/useDocAbilities", () => ({ useDocAbilities: () => ({ level: "edit", view: true, comment: true, edit: true, share: false, askRead: false, askWrite: true, canAsk: () => true }) }))
vi.mock("@/components/docEditor/registry/gate", () => ({ useEditionGate: () => ({ ai: false }) }))
// What B6's page actions do, heard here: Delete is doc.trash (chrome/contributions.ts).
const { trash } = vi.hoisted(() => ({ trash: vi.fn() }))
vi.mock("@/components/docEditor/chrome/actions", () => ({ trash, toggleStar: vi.fn(), duplicate: vi.fn() }))
vi.mock("@/lib/export/contentIOCapabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/contentIOCapabilities")>()),
  knownCapabilities: () => null,
  loadCapabilities: async () => null,
}))

import { DocOptionsDrawer } from "./docOptionsDrawer"
// B6's page actions, which the doc page's guard offers once drawn (Delete among them).
import { offerPageActions } from "@/components/docEditor/chrome/contributions"
import { createDocCommandBus, holdBus, provideActionContext } from "@/components/docEditor/registry/commandBus"
import { registerAction } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { Pin } from "@/lib/icons"

offerPageActions()

const EDITOR = { isEmpty: false, isActive: () => false, can: () => ({ undo: () => false }) } as unknown as ActionContext["editor"]

let release = () => {}
afterEach(() => {
  release()
  cleanup()
})

/** A doc page open on doc-1, giving its context on its bus. */
function page(state: ActionContext["state"], more: Partial<ActionContext> = {}) {
  const bus = createDocCommandBus("doc-1")
  const stopHolding = holdBus(bus)
  const stopGiving = provideActionContext(bus, () => ({ docId: "doc-1", editor: EDITOR, canEdit: true, bus, gate: { ai: false }, state, ...more }))
  release = () => {
    stopGiving()
    stopHolding()
  }
  return bus
}

const sheet = () => render(<DocOptionsDrawer drawerOpenState setOpenState={() => {}} docId="doc-1" isOwner />)
const rows = () => [...document.querySelectorAll("[data-sheet-group] button")].map((b) => b.textContent?.trim())

describe("the phone's doc sheet", () => {
  it("draws the page's own state, as More does", () => {
    page({ owner: true, canShare: true, saved: true, focusMode: true, desktop: false })
    sheet()
    expect(rows()).toEqual(expect.arrayContaining(["Saved for later", "Leave focus mode", "Copy link", "Import files…", "Notifications"]))
  })

  it("gives the four exports one row, which opens them, with a way back", () => {
    page({ owner: true, canShare: true, desktop: false })
    sheet()
    expect(rows()).not.toContain("Export as PDF")
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Export…/ }))
    })
    expect(rows()).toEqual(["Back", "Export as Markdown", "Export as HTML", "Export as PDF", "Export as Word"])
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    })
    expect(rows()).toContain("Export…")
  })

  // 22 Oct, the interaction polish's e2e: a sheet opened before the page's
  // guard offered its actions had no Delete, and never gained it.
  it("gains an action that registers while it is open, as More does", () => {
    page({ owner: true, canShare: true, desktop: false })
    sheet()
    expect(rows()).not.toContain("Pin to Home")
    act(() => {
      registerAction({ id: "test.pin", label: "Pin to Home", icon: Pin, group: "doc", surfaces: ["phoneSheet"], edition: "both", run: () => {} })
    })
    expect(rows()).toContain("Pin to Home")
  })

  it("offers Share only to someone the page lets share, and Copy link to a reader", () => {
    page({ owner: false, canShare: false, desktop: false }, { canEdit: false })
    sheet()
    expect(rows()).not.toContain("Share")
    expect(rows()).toContain("Copy link")
  })

  // Review, 15 Oct 2026: the sheet kept a path for an action "doc.delete" that
  // no package registers, fed a function that did nothing through the Redux
  // store. Delete is B6's doc.trash, run as every other row is.
  it("deletes as More does: Delete runs the doc's trash action, in the page's context", async () => {
    page({ owner: true, canShare: true, desktop: false })
    sheet()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    })
    expect(trash).toHaveBeenCalledWith(expect.objectContaining({ docId: "doc-1" }))
  })
})
