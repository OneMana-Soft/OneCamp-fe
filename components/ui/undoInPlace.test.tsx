import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"

/**
 * A change offered back in place, beside its tick, never on a toast (main, 3 Nov 02:0x: a toast must never block
 * the next step; at 390 one lay over a new row's actions for its 8 s). The shared primitive any card that saves at
 * once adopts: the same offer as the toast's (UndoOffer, design-14), the same 8 s, the same words when it can't.
 */
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

const { useSaveStatus, switchOffer } = await import("@/components/ui/saveStatus")
const { SwitchRow } = await import("@/components/ui/settingsSection")
const { UNDO_MS, UndoInPlace, useUndoInPlace } = await import("@/components/ui/undoInPlace")

afterEach(() => {
  cleanup()
  toast.mockReset()
  vi.useRealTimers()
})

/** A switch row the way a card adopts it: its own save, then the change offered back beside its tick once it held. */
function Row({ save }: { save: (v: boolean) => Promise<unknown> }) {
  const [on, setOn] = useState(false)
  const { status, run } = useSaveStatus()
  const back = useUndoInPlace()
  const change = async (next: boolean): Promise<boolean> => {
    setOn(next)
    const held = await run(() => save(next))
    if (held) back.offer(switchOffer("Read receipts", next, change))
    else setOn(!next)
    return held
  }
  return (
    <>
      <SwitchRow label="Read receipts" checked={on} status={status} onChange={(v) => void change(v)} />
      <UndoInPlace back={back} />
    </>
  )
}

/** A bare offer whose undo is `undo`, made at once. */
function Offered({ undo }: { undo: () => unknown }) {
  const back = useUndoInPlace()
  return (
    <>
      <button type="button" onClick={() => back.offer({ what: "Placed Beta matter", undo })}>
        Place
      </button>
      <UndoInPlace back={back} />
    </>
  )
}

const said = (words: string) => screen.queryAllByRole("status").some((s) => s.textContent === words)
// The line in view beside the tick (its live region says the same words, so it's found by its mark, not its text).
const failedLine = () => document.querySelector("[data-undo-failed]")
const undoButton = () => screen.queryByRole("button", { name: /^Undo/ })
const press = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
  })
const refused = (status: number, msg: string) => ({ isAxiosError: true, response: { status, data: { msg } } })

describe("a change offered back in place", () => {
  it("offers it beside its tick once it held, named for what it takes back, and never on the toast", async () => {
    render(<Row save={() => Promise.resolve()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    expect(document.querySelector("[data-saved-tick]")?.textContent).toBe("Saved")
    const undo = screen.getByRole("button", { name: "Undo: Read receipts: On" })
    expect(undo.textContent).toBe("Undo")
    expect(toast).not.toHaveBeenCalled()
  })

  it("offers nothing when the save didn't hold", async () => {
    render(<Row save={() => Promise.reject(refused(403, "Only admins can change this."))} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    expect(screen.getByText("Only admins can change this.")).toBeTruthy()
    expect(undoButton()).toBeNull()
  })

  it("takes it back through the card's own way back, says Undone with the tick, and offers no undo of it", async () => {
    const save = vi.fn<(v: boolean) => Promise<void>>(() => Promise.resolve())
    render(<Row save={save} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await press("Undo: Read receipts: On")
    expect(save.mock.calls.map(([v]) => v)).toEqual([true, false])
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect([...document.querySelectorAll("[data-saved-tick]")].map((t) => t.textContent)).toContain("Undone")
    expect(said("Undone")).toBe(true)
    expect(undoButton()).toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })

  it("is gone from view while it is taken, so one change is never taken back twice", async () => {
    let finish!: () => void
    const undo = vi.fn(() => new Promise<void>((done) => (finish = done)))
    render(<Offered undo={undo} />)
    await press("Place")
    await press("Undo: Placed Beta matter")
    expect(undoButton()).toBeNull()
    // An offer made while one is being taken (an undo that goes through the card's own change) is never shown.
    await press("Place")
    expect(undoButton()).toBeNull()
    await act(async () => finish())
    expect(said("Undone")).toBe(true)
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it("stays as long as the toast's offer does, then the change simply stands", async () => {
    vi.useFakeTimers()
    render(<Offered undo={() => undefined} />)
    await press("Place")
    expect(UNDO_MS).toBe(8000)
    act(() => void vi.advanceTimersByTime(UNDO_MS - 100))
    expect(undoButton()).not.toBeNull()
    act(() => void vi.advanceTimersByTime(200))
    expect(undoButton()).toBeNull()
  })

  it("keeps the change when the undo's own save fails: the row says why, and the offer says it couldn't", async () => {
    let fail = false
    render(<Row save={() => (fail ? Promise.reject(refused(403, "Only admins can change this.")) : Promise.resolve())} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    fail = true
    await press("Undo: Read receipts: On")
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("Only admins can change this.")).toBeTruthy()
    expect(said("Couldn't undo that. Its row says why.")).toBe(true)
    expect(failedLine()?.textContent).toBe("Couldn't undo that. Its row says why.")
    expect(toast).not.toHaveBeenCalled()
  })

  it("says why in place, in the server's words, when an undo of its own throws", async () => {
    render(<Offered undo={() => Promise.reject(refused(409, "That hold was already released."))} />)
    await press("Place")
    await press("Undo: Placed Beta matter")
    expect(said("Couldn't undo that. That hold was already released.")).toBe(true)
    expect(failedLine()?.textContent).toBe("Couldn't undo that. That hold was already released.")
    expect(failedLine()?.className).toContain("text-danger-ink")
    expect(undoButton()).toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })

  it("offers the same go again when the server asks for it (503), as the toast's Retry does", async () => {
    const undo = vi.fn().mockRejectedValueOnce(refused(503, "The workspace is busy. Try again in a moment.")).mockResolvedValueOnce(undefined)
    render(<Offered undo={undo} />)
    await press("Place")
    await press("Undo: Placed Beta matter")
    expect(said("Undo didn't finish. The workspace is busy. Try again in a moment.")).toBe(true)
    await press("Retry: Placed Beta matter")
    expect(undo).toHaveBeenCalledTimes(2)
    expect(said("Undone")).toBe(true)
    expect(screen.queryByRole("button", { name: /^Retry/ })).toBeNull()
  })

  it("keeps a keyboard's place when Undo leaves: focus stays where the offer was", async () => {
    render(<Offered undo={() => Promise.resolve()} />)
    await press("Place")
    const undo = screen.getByRole("button", { name: "Undo: Placed Beta matter" })
    undo.focus()
    await act(async () => {
      fireEvent.click(undo)
    })
    expect(document.activeElement?.closest("[data-undo-in-place]")).not.toBeNull()
  })

  it("is put away by clear, as a card does when its field changes again", async () => {
    function Cleared() {
      const back = useUndoInPlace()
      return (
        <>
          <button type="button" onClick={() => back.offer({ what: "Calendar events removed after 365 days", undo: () => undefined })}>
            Save
          </button>
          <button type="button" onClick={back.clear}>
            Edit
          </button>
          <UndoInPlace back={back} />
        </>
      )
    }
    render(<Cleared />)
    await press("Save")
    expect(undoButton()).not.toBeNull()
    await press("Edit")
    expect(undoButton()).toBeNull()
  })
})
