import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({
  toasts: [] as { title?: string; description?: string; action?: unknown; variant?: string }[],
  deleteDoc: vi.fn(),
  restoreDoc: vi.fn(),
  duplicateDoc: vi.fn(),
  addPlace: vi.fn(),
  removePlace: vi.fn(),
  push: vi.fn(),
  deleted: vi.fn(),
  restored: vi.fn(),
  dispatch: vi.fn(),
}))

vi.mock("@/hooks/use-toast", () => ({ toast: (t: (typeof hoisted.toasts)[number]) => hoisted.toasts.push(t) }))
vi.mock("@/services/docGraphService", () => ({
  deleteDoc: hoisted.deleteDoc,
  restoreDoc: hoisted.restoreDoc,
  duplicateDoc: hoisted.duplicateDoc,
  addPlace: hoisted.addPlace,
  removePlace: hoisted.removePlace,
}))
vi.mock("@/lib/docCache", () => ({ docDeleted: hoisted.deleted, docRestored: hoisted.restored }))
vi.mock("@/store/store", () => ({ default: { dispatch: hoisted.dispatch, getState: () => ({ users: { userSidebar: { userStarred: [] } } }) } }))

import { duplicate, toggleStar, trash } from "./actions"
import { factsOf, provideNavigate, setFacts } from "./pageFacts"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { NO_BUS } from "@/components/docEditor/registry/commandBus"

const ctx = (docId: string, title = "Launch plan"): ActionContext => ({ docId, editor: null, canEdit: true, bus: NO_BUS, state: { title } })
const OWN = { ownErrors: true }

beforeEach(() => {
  hoisted.toasts.length = 0
  for (const f of [hoisted.deleteDoc, hoisted.restoreDoc, hoisted.duplicateDoc, hoisted.addPlace, hoisted.removePlace, hoisted.push, hoisted.deleted, hoisted.restored, hoisted.dispatch]) f.mockReset()
  provideNavigate(hoisted.push)
  cleanup()
})

// More, the phone's sheet and the palette run the doc's row actions
// (components/docTree/docActions): the same requests and the same words.
describe("More's page actions (B6)", () => {
  it("moves a doc to the trash, leaves its page, and puts it back with Undo (N32)", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 3 })
    hoisted.restoreDoc.mockResolvedValue({ restored: 3, parent_uuid: "" })
    await trash(ctx("d1"))
    expect(hoisted.deleteDoc).toHaveBeenCalledWith("d1", OWN)
    expect(hoisted.deleted).toHaveBeenCalled()
    expect(hoisted.push).toHaveBeenCalledWith("/app/doc")
    const t = hoisted.toasts[0]
    expect(t.title).toBe("Moved “Launch plan” to the trash with 2 pages inside")
    render(<>{t.action as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByText("Undo")))
    expect(hoisted.restoreDoc).toHaveBeenCalledWith("d1", OWN)
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
    expect(hoisted.push).toHaveBeenLastCalledWith("/app/doc/d1")
  })

  it("says why a delete was refused, once, and stays on the page", async () => {
    hoisted.deleteDoc.mockRejectedValue({ response: { status: 403, data: { msg: "You can't change that page." } } })
    await trash(ctx("d1"))
    expect(hoisted.push).not.toHaveBeenCalled()
    expect(hoisted.toasts).toEqual([{ title: "Couldn't move “Launch plan” to the trash", description: "You can't change that page.", variant: "destructive" }])
  })

  it("opens the copy a duplicate makes", async () => {
    hoisted.duplicateDoc.mockResolvedValue({ doc_uuid: "copy", count: 1 })
    await duplicate(ctx("d1"))
    expect(hoisted.duplicateDoc).toHaveBeenCalledWith("d1", true, OWN)
    expect(hoisted.push).toHaveBeenCalledWith("/app/doc/copy")
    expect(hoisted.toasts[0]).toEqual({ title: "Copied “Launch plan”" })
  })

  it("stars and unstars at once, and puts the star back when the server says no", async () => {
    hoisted.addPlace.mockResolvedValue({})
    await toggleStar(ctx("s1"))
    expect(hoisted.addPlace).toHaveBeenCalledWith("star", "doc", "s1", undefined, OWN)
    expect(factsOf("s1").starred).toBe(true)
    hoisted.removePlace.mockRejectedValue(new Error("down"))
    await toggleStar(ctx("s1"))
    expect(factsOf("s1").starred).toBe(true)
    expect(hoisted.toasts[0]?.title).toBe("Couldn't remove “Launch plan” from starred")
    setFacts("s1", { starred: false })
  })
})
