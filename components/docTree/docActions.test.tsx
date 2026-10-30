import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({
  toasts: [] as { title?: string; description?: string; action?: unknown; variant?: string }[],
  deleteDoc: vi.fn(),
  restoreDoc: vi.fn(),
  duplicateDoc: vi.fn(),
  addPlace: vi.fn(),
  removePlace: vi.fn(),
  deleted: vi.fn(),
  restored: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock("@/hooks/use-toast", () => ({
  toast: (t: (typeof hoisted.toasts)[number]) => {
    hoisted.toasts.push(t)
    return { id: String(hoisted.toasts.length), dismiss: hoisted.dismiss, update: vi.fn() }
  },
}))
vi.mock("@/services/docGraphService", () => ({
  deleteDoc: hoisted.deleteDoc,
  restoreDoc: hoisted.restoreDoc,
  duplicateDoc: hoisted.duplicateDoc,
  addPlace: hoisted.addPlace,
  removePlace: hoisted.removePlace,
}))
vi.mock("@/lib/docCache", () => ({ docDeleted: hoisted.deleted, docRestored: hoisted.restored }))

import { duplicate, pagesLeftInTrash, purgeWarning, starDoc, trash, unstarDoc } from "./docActions"
import { starPlace, unstarPlace } from "@/store/slice/userSlice"

const plan = { id: "d1", title: "Launch plan" }
const OWN = { ownErrors: true }

beforeEach(() => {
  hoisted.toasts.length = 0
  for (const f of [hoisted.deleteDoc, hoisted.restoreDoc, hoisted.duplicateDoc, hoisted.addPlace, hoisted.removePlace, hoisted.deleted, hoisted.restored, hoisted.dismiss]) f.mockReset()
  cleanup()
})

// One copy of Star, Duplicate and Move to trash for a doc's row and its page
// (batch 16 audit, B6): the row's menu says what More says, and each failure
// is said once, with the server's reason, the app's own toast kept out.
describe("a doc's actions, from its row", () => {
  it("moves it to the trash without leaving the page someone is on, and Undo brings it back there", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1 })
    hoisted.restoreDoc.mockResolvedValue({ restored: 1, parent_uuid: "" })
    const go = vi.fn()
    expect(await trash(vi.fn(), plan, { onItsPage: false, go })).not.toBeNull()
    expect(hoisted.deleteDoc).toHaveBeenCalledWith("d1", OWN)
    expect(hoisted.toasts[0].title).toBe("Moved “Launch plan” to the trash")
    render(<>{hoisted.toasts[0].action as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByText("Undo")))
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
    expect(go).not.toHaveBeenCalled()
  })

  // A delete takes only the pages inside that the person can open (the owner's
  // rule, 15 Oct 2026): the rest stay, moved up to where it was, counted, never
  // named.
  it("says how many pages inside it stayed because they can't be opened", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 3, kept: 1 })
    await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() })
    expect(hoisted.toasts[0].title).toBe("Moved “Launch plan” to the trash with 2 pages inside")
    expect(hoisted.toasts[0].description).toBe("1 page inside that you can't open stays, moved up to where “Launch plan” was.")
    hoisted.toasts.length = 0
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1, kept: 2 })
    await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() })
    expect(hoisted.toasts[0].description).toBe("2 pages inside that you can't open stay, moved up to where “Launch plan” was.")
    hoisted.toasts.length = 0
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1, kept: 0 })
    await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() })
    expect(hoisted.toasts[0].description).toBeUndefined()
  })

  it("words a delete for good the same wherever it is asked, and what it left", () => {
    expect(purgeWarning("“Old plan”", 0)).toBe("“Old plan” goes for good. Nobody can bring it back.")
    expect(purgeWarning("“Old plan”", 1)).toBe(
      "“Old plan” and the 1 page deleted with it go for good, apart from any you don't have full access to, which stay in the trash. Nobody can bring back what goes.",
    )
    expect(pagesLeftInTrash(0)).toBeUndefined()
    expect(pagesLeftInTrash(1)).toBe("1 page you don't have full access to stays in the trash.")
  })

  it("says when Undo couldn't bring it back, and where it is", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1 })
    hoisted.restoreDoc.mockRejectedValue({ response: { status: 500, data: { msg: "Failed to restore doc" } } })
    await trash(vi.fn(), plan, { onItsPage: true, go: vi.fn() })
    render(<>{hoisted.toasts[0].action as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByText("Undo")))
    expect(hoisted.toasts[1]).toEqual({ variant: "destructive", title: "Couldn't bring “Launch plan” back", description: "It's still in the trash. Restore it from there." })
    expect(hoisted.restored).not.toHaveBeenCalled()
  })

  // A sub-page block deleted from its parent's body (docs C7a): its page goes
  // only while it is that page's child, and Undo brings back the block too.
  it("puts a block's page in the trash only while it is the page's child, and Undo brings back both", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 3 })
    hoisted.restoreDoc.mockResolvedValue({ restored: 3, parent_uuid: "p1" })
    const putBack = vi.fn()
    const gone = await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() }, { parent: "p1", putBack })
    expect(hoisted.deleteDoc).toHaveBeenCalledWith("d1", { ...OWN, under: "p1" })
    expect(hoisted.toasts[0].title).toBe("Moved “Launch plan” to the trash with 2 pages inside")
    render(<>{hoisted.toasts[0].action as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByText("Undo")))
    expect(hoisted.restoreDoc).toHaveBeenCalledWith("d1", { ...OWN, placed: true })
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
    expect(putBack).toHaveBeenCalledTimes(1)
    // The editor's own Undo after the toast's: nothing comes back twice.
    await gone?.undo()
    expect(hoisted.restoreDoc).toHaveBeenCalledTimes(1)
    expect(putBack).toHaveBeenCalledTimes(1)
  })

  it("leaves a block that was a link, or whose page is gone already, without a word", async () => {
    for (const refusal of [{ status: 409, data: { code: "not_under", msg: "That page isn't inside this one any more." } }, { status: 410, data: { msg: "This doc was deleted." } }]) {
      hoisted.deleteDoc.mockRejectedValueOnce({ response: refusal })
      expect(await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() }, { parent: "p1", putBack: vi.fn() })).toBeNull()
    }
    expect(hoisted.toasts).toEqual([])
    expect(hoisted.deleted).not.toHaveBeenCalled()
  })

  it("says why a block's page stays when the person may not delete it", async () => {
    hoisted.deleteDoc.mockRejectedValue({ response: { status: 403, data: { msg: "You can't change that page." } } })
    expect(await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() }, { parent: "p1", putBack: vi.fn() })).toBeNull()
    expect(hoisted.toasts).toEqual([{ variant: "destructive", title: "Couldn't move “Launch plan” to the trash", description: "You can't change that page." }])
  })

  // The editor's Undo (Ctrl+Z) brings the block back first: undo restores the
  // page and takes the toast away, so its Undo can't run a second time.
  it("undoes from the editor once, taking the toast away", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1 })
    hoisted.restoreDoc.mockResolvedValue({ restored: 1, parent_uuid: "p1" })
    const gone = await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() }, { parent: "p1", putBack: vi.fn() })
    await Promise.all([gone?.undo(), gone?.undo()])
    expect(hoisted.dismiss).toHaveBeenCalled()
    expect(hoisted.restoreDoc).toHaveBeenCalledTimes(1)
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
  })

  // Brought back another way meanwhile (from the trash page), the page is back:
  // what Undo asked for is done, so nothing says it failed and the block
  // comes back with it (CR-13, 23 Oct).
  it("counts a page already brought back from the trash as brought back", async () => {
    hoisted.deleteDoc.mockResolvedValue({ batch_id: "b", count: 1 })
    hoisted.restoreDoc.mockRejectedValue({ response: { status: 409, data: { code: "not_in_trash", msg: "That doc isn't in the trash." } } })
    const putBack = vi.fn()
    const gone = await trash(vi.fn(), plan, { onItsPage: false, go: vi.fn() }, { parent: "p1", putBack })
    await gone?.undo()
    expect(hoisted.toasts.map((t) => t.title)).toEqual(["Moved “Launch plan” to the trash"])
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
    expect(putBack).toHaveBeenCalledTimes(1)
  })

  it("offers the copy from a list rather than opening it", async () => {
    hoisted.duplicateDoc.mockResolvedValue({ doc_uuid: "copy", count: 2 })
    const open = vi.fn()
    expect(await duplicate(plan, open)).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(hoisted.toasts[0].title).toBe("Copied “Launch plan” and 1 page inside")
    render(<>{hoisted.toasts[0].action as ReactNode}</>)
    fireEvent.click(screen.getByText("Open"))
    expect(open).toHaveBeenCalledWith("/app/doc/copy")
  })

  it("puts a star back in Starred when the server refuses it, and says why once", async () => {
    hoisted.addPlace.mockRejectedValue({ response: { status: 403, data: {} } })
    const dispatch = vi.fn()
    expect(await starDoc(dispatch, plan)).toBe(false)
    expect(dispatch.mock.calls.map((c) => c[0].type)).toEqual([starPlace.type, unstarPlace.type])
    expect(hoisted.toasts).toEqual([{ variant: "destructive", title: "Couldn't star “Launch plan”", description: "You don't have permission to do that." }])

    hoisted.removePlace.mockRejectedValue(new Error("Network Error"))
    const was = { kind: "star", resource_kind: "doc", resource_uuid: "d1", position: "a", title: "Launch plan", href: "/app/doc/d1" } as const
    expect(await unstarDoc(dispatch, plan, was)).toBe(false)
    expect(dispatch).toHaveBeenLastCalledWith(starPlace({ place: was }))
  })
})
