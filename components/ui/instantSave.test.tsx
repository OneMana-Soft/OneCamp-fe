import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState, type ReactElement } from "react"

/**
 * design-14, item 2: every change saved with a tick and undo. A row that saves
 * the moment it changes shows its tick, and the change is offered back on the
 * shared toast; Undo runs the row's own change back to the old value, so the
 * row ticks again (or says why it couldn't). An undo is never offered back.
 */
type Toasted = { title?: string; description?: string; variant?: string; action?: ReactElement<{ onClick: () => Promise<void>; altText?: string }> }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

const { useSaveStatus } = await import("@/components/ui/saveStatus")
const { SwitchRow } = await import("@/components/ui/settingsSection")
const { InstantSwitch } = await import("@/components/ui/instantSwitch")

afterEach(() => {
  cleanup()
  toast.mockReset()
})

const offered = () => toast.mock.calls.map(([t]) => t).filter((t) => t.action)
const titles = () => toast.mock.calls.map(([t]) => t.title)
// The toast's parts load on first use (import()): wait for an offer, or for
// one that would have come.
const anOffer = () => waitFor(() => expect(offered().length).toBeGreaterThan(0))
const settled = () => act(async () => void (await import("@/components/ui/undoToast")))
async function undo(t: Toasted) {
  await act(async () => {
    await t.action!.props.onClick()
  })
  await settled()
}

/** A switch row saved through `save`, the way the settings cards do it. */
function Row({ save }: { save: (v: boolean) => Promise<unknown> }) {
  const [on, setOn] = useState(false)
  const { status, run } = useSaveStatus()
  const change = async (next: boolean): Promise<boolean> => {
    setOn(next)
    const held = await run(() => save(next), { what: next ? "Read receipts on" : "Read receipts off", undo: () => change(!next) })
    if (!held) setOn(!next)
    return held
  }
  return <SwitchRow label="Read receipts" checked={on} status={status} onChange={(v) => void change(v)} />
}

describe("an instant change, saved with a tick and offered back", () => {
  it("names the change on the toast with Undo once it is saved", async () => {
    const save = vi.fn(() => Promise.resolve())
    render(<Row save={save} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    expect(document.querySelector("[data-saved-tick]")).toBeTruthy()
    await anOffer()
    expect(offered()).toHaveLength(1)
    expect(offered()[0].title).toBe("Read receipts on")
    expect(offered()[0].action!.props.altText).toBe("Undo")
  })

  it("puts the old value back through the same save on Undo, ticks again, and offers no undo of it", async () => {
    const save = vi.fn((_: boolean) => Promise.resolve())
    render(<Row save={save} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await anOffer()
    await undo(offered()[0])
    expect(save.mock.calls.map(([v]) => v)).toEqual([true, false])
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect(document.querySelector("[data-saved-tick]")).toBeTruthy()
    expect(offered()).toHaveLength(1)
    expect(titles()).toContain("Undone")
  })

  it("offers nothing when the save fails, and the row says why", async () => {
    render(<Row save={() => Promise.reject({ response: { data: { msg: "Only admins can change this." } } })} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await settled()
    expect(offered()).toHaveLength(0)
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("Only admins can change this.")).toBeTruthy()
  })

  it("says it couldn't undo when the undo's save fails, and keeps the change", async () => {
    let fail = false
    render(<Row save={() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve())} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await anOffer()
    fail = true
    await undo(offered()[0])
    expect(titles()).toContain("Couldn't undo that")
    expect(titles()).not.toContain("Undone")
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
  })
})

describe("a list row's switch (InstantSwitch)", () => {
  function List({ save }: { save: (v: boolean) => Promise<unknown> }) {
    const [on, setOn] = useState(true)
    return (
      <InstantSwitch
        checked={on}
        aria-label="Use GitHub"
        what={(v) => (v ? "GitHub is on" : "GitHub is off")}
        onSave={async (v) => {
          await save(v)
          setOn(v)
        }}
      />
    )
  }

  it("flips at once, ticks beside the switch, and offers the change back", async () => {
    let answer: () => void = () => {}
    const save = vi.fn(() => new Promise<void>((r) => (answer = r)))
    render(<List save={save} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Use GitHub" }))
    })
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("switch").getAttribute("aria-busy")).toBe("true")
    await act(async () => answer())
    expect(document.querySelector("[data-saved-tick]")).toBeTruthy()
    await anOffer()
    expect(offered().map((t) => t.title)).toEqual(["GitHub is off"])
  })

  it("springs back when the save fails, and offers nothing", async () => {
    render(<List save={() => Promise.reject(new Error("offline"))} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await settled()
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
    expect(offered()).toHaveLength(0)
  })

  it("Undo flips it back through the same save", async () => {
    const save = vi.fn((_: boolean) => Promise.resolve())
    render(<List save={save} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    await anOffer()
    await undo(offered()[0])
    expect(save.mock.calls.map(([v]) => v)).toEqual([false, true])
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
  })
})
