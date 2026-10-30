import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t) }))

import { lazyDialog } from "@/lib/lazy/lazyDialog"

afterEach(() => {
  cleanup()
  toast.mockClear()
})

const unmounted = vi.fn()

/** A dialog drawn only while it's open, as the backlog draws Estimates. */
function Feed({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog">
      Show cycles in your calendar
      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  )
}

function Backlog({ load }: { load: () => Promise<typeof Feed> }) {
  const [Lazy] = useState(() => lazyDialog(load, "the calendar feed"))
  const [open, setOpen] = useState(false)
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Add to calendar
      </button>
      {open && <Lazy onClose={() => setOpen(false)} />}
    </main>
  )
}

function Picker({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => unmounted, [])
  return open ? <div role="dialog">Insert a table</div> : <div data-closing="" />
}

function Doc({ load }: { load: () => Promise<typeof Picker> }) {
  const [Lazy] = useState(() => lazyDialog(load, "the table picker"))
  const [open, setOpen] = useState(false)
  return (
    <main>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Table
      </button>
      <Lazy open={open} onOpenChange={setOpen} />
    </main>
  )
}

describe("a dialog fetched when it first opens", () => {
  it("fetches nothing until it opens, then stays mounted when it closes, to close with its own animation", async () => {
    const load = vi.fn(() => Promise.resolve(Picker))
    const { container } = render(<Doc load={load} />)
    await act(async () => {})
    expect(load).not.toHaveBeenCalled()

    act(() => screen.getByRole("button", { name: "Table" }).click())
    expect((await screen.findByRole("dialog")).textContent).toBe("Insert a table")
    expect(load).toHaveBeenCalledTimes(1)

    act(() => screen.getByRole("button", { name: "Table" }).click())
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(container.querySelector("[data-closing]")).not.toBeNull()
    expect(unmounted).not.toHaveBeenCalled()

    act(() => screen.getByRole("button", { name: "Table" }).click())
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("keeps the screen as it was while the code of one drawn only while open comes, then draws it as it lands", async () => {
    let land: (feed: typeof Feed) => void = () => {}
    const load = vi.fn(() => new Promise<typeof Feed>((resolve) => (land = resolve)))
    render(<Backlog load={load} />)
    act(() => screen.getByRole("button", { name: "Add to calendar" }).click())
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Add to calendar" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()

    await act(async () => land(Feed))
    expect(screen.getByRole("dialog").textContent).toContain("Show cycles in your calendar")
    act(() => screen.getByRole("button", { name: "Done" }).click())
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("says so and closes, through onClose, when the code of one drawn only while open can't come", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const load = vi.fn(() => Promise.reject(new Error("offline")))
    render(<Backlog load={load} />)
    await act(async () => screen.getByRole("button", { name: "Add to calendar" }).click())
    expect(toast).toHaveBeenCalledWith({ title: "Couldn't open the calendar feed", description: "Check your connection, then try again.", variant: "destructive" })
    expect(screen.queryByRole("dialog")).toBeNull()
    // Closed, so the next open asks for the code again.
    await act(async () => screen.getByRole("button", { name: "Add to calendar" }).click())
    expect(load).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
