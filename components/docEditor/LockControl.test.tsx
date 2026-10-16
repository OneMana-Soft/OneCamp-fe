import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({ doc: undefined as Record<string, unknown> | undefined, lockDoc: vi.fn(), toasts: [] as { title?: string }[] }))

vi.mock("./chrome/useDoc", () => ({ useDoc: () => hoisted.doc }))
vi.mock("@/services/docAccessService", () => ({ lockDoc: hoisted.lockDoc }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve(), patchCached: () => {} }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => hoisted.toasts.push(t) }))

import LockDialog, { LockChip } from "./LockControl"
import { factsOf, setFacts } from "./chrome/pageFacts"
import { DocBusContext, createDocCommandBus } from "./registry/commandBus"

const editor = { doc_edit_access: 1 }
const full = { doc_edit_access: 1, doc_full_access: 1 }

beforeEach(() => {
  hoisted.lockDoc.mockReset().mockImplementation((_d: string, lock: string) => Promise.resolve({ lock, locked: lock === "hard", level: "edit" }))
  hoisted.toasts.length = 0
})
afterEach(cleanup)

describe("locking a page (D-12)", () => {
  it("lets an editor lock edits, and keeps the hard lock for full access", async () => {
    hoisted.doc = { ...editor }
    render(<LockDialog docId="l1" onClose={() => {}} />)
    const hard = document.querySelector('[data-choice="hard"]') as HTMLButtonElement
    expect(hard.disabled).toBe(true)
    expect(screen.getByText("Needs full access.")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lock page" })))
    expect(hoisted.lockDoc).toHaveBeenCalledWith("l1", "soft")
    expect(factsOf("l1").lock).toBe("soft")
  })

  it("lets full access lock it for everyone", async () => {
    hoisted.doc = { ...full }
    render(<LockDialog docId="l2" onClose={() => {}} />)
    fireEvent.click(document.querySelector('[data-choice="hard"]')!)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lock page" })))
    expect(hoisted.lockDoc).toHaveBeenCalledWith("l2", "hard")
  })

  it("unlocks a soft lock for this person alone, or for everyone", async () => {
    hoisted.doc = { ...editor, doc_lock_level: "soft", doc_locked_by: { user_uuid: "u1", user_name: "Asha" }, doc_locked_at: new Date().toISOString() }
    const view = render(<LockDialog docId="l3" onClose={() => {}} />)
    expect(screen.getByText(/Asha locked it/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Unlock for me" }))
    expect(factsOf("l3").unlockedForMe).toBe(true)
    expect(hoisted.lockDoc).not.toHaveBeenCalled()
    view.unmount()
    render(<LockDialog docId="l3" onClose={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unlock for everyone" })))
    expect(hoisted.lockDoc).toHaveBeenCalledWith("l3", "")
    expect(factsOf("l3")).toMatchObject({ lock: "", unlockedForMe: false })
  })

  it("gives an editor no way past a hard lock; full access lifts it or makes it an edit lock", async () => {
    hoisted.doc = { doc_edit_access: 0, doc_lock_level: "hard" }
    const view = render(<LockDialog docId="l4" onClose={() => {}} />)
    expect(screen.queryByRole("button", { name: /Unlock/ })).toBeNull()
    expect(screen.getByText(/Only people with full access can edit it or unlock it/)).toBeTruthy()
    view.unmount()
    hoisted.doc = { ...full, doc_lock_level: "hard" }
    render(<LockDialog docId="l4" onClose={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make it an edit lock" })))
    expect(hoisted.lockDoc).toHaveBeenCalledWith("l4", "soft")
  })

  it("says why when the server refuses, and keeps the dialog open", async () => {
    hoisted.doc = { ...editor }
    hoisted.lockDoc.mockRejectedValue({ response: { data: { msg: "Everyone who opens the demo shares this doc." } } })
    const close = vi.fn()
    render(<LockDialog docId="l5" onClose={close} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lock page" })))
    expect(screen.getByRole("alert").textContent).toBe("Everyone who opens the demo shares this doc.")
    expect(close).not.toHaveBeenCalled()
  })
})

describe("the lock beside the title", () => {
  it("shows only on a locked doc, says when it is unlocked for this person, and opens the lock", () => {
    const bus = createDocCommandBus("c1")
    const asked: string[] = []
    bus.on("openDialog", ({ id }) => asked.push(id))
    const chip = () => (
      <DocBusContext.Provider value={bus}>
        <LockChip docId="c1" />
      </DocBusContext.Provider>
    )
    hoisted.doc = {}
    const view = render(chip())
    expect(document.querySelector("[data-doc-lock-chip]")).toBeNull()
    hoisted.doc = { doc_lock_level: "soft" }
    view.rerender(chip())
    expect(screen.getByRole("button", { name: "Locked" })).toBeTruthy()
    act(() => setFacts("c1", { lock: "soft", unlockedForMe: true }))
    fireEvent.click(screen.getByRole("button", { name: "Unlocked for you" }))
    expect(asked).toEqual(["doc.lock"])
  })
})
