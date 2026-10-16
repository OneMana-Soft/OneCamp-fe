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

import { duplicate, starDoc, trash, unstarDoc } from "./docActions"
import { starPlace, unstarPlace } from "@/store/slice/userSlice"

const plan = { id: "d1", title: "Launch plan" }
const OWN = { ownErrors: true }

beforeEach(() => {
  hoisted.toasts.length = 0
  for (const f of [hoisted.deleteDoc, hoisted.restoreDoc, hoisted.duplicateDoc, hoisted.addPlace, hoisted.removePlace, hoisted.deleted, hoisted.restored]) f.mockReset()
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
    expect(await trash(vi.fn(), plan, { onItsPage: false, go })).toBe(true)
    expect(hoisted.deleteDoc).toHaveBeenCalledWith("d1", OWN)
    expect(hoisted.toasts[0].title).toBe("Moved “Launch plan” to the trash")
    render(<>{hoisted.toasts[0].action as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByText("Undo")))
    expect(hoisted.restored).toHaveBeenCalledWith("d1")
    expect(go).not.toHaveBeenCalled()
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
