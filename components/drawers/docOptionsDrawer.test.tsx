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
vi.mock("@/lib/export/contentIO", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/contentIO")>()),
  knownCapabilities: () => null,
  loadCapabilities: async () => null,
}))

import { DocOptionsDrawer } from "./docOptionsDrawer"
import { createDocCommandBus, holdBus, provideActionContext } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"

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

const sheet = () => render(<DocOptionsDrawer drawerOpenState setOpenState={() => {}} docId="doc-1" isOwner deleteMessage={() => {}} />)
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

  it("offers Share only to someone the page lets share, and Copy link to a reader", () => {
    page({ owner: false, canShare: false, desktop: false }, { canEdit: false })
    sheet()
    expect(rows()).not.toContain("Share")
    expect(rows()).toContain("Copy link")
  })
})
