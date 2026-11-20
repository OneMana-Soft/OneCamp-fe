import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useState, type FC } from "react"
import { useToastState } from "@/hooks/use-toast"
import { lazyDialog } from "@/lib/lazy/lazyDialog"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"

// DESIGN-BUILD-151 F1: the toast that says an overlay couldn't open is one per
// overlay. A repeat failure replaces it rather than stacking another (up to
// TOAST_LIMIT, three alike), and the overlay's code coming (the next open, a
// warm, the browser back online) takes it down, so it never sits over the
// dialog that did open. The real toast store, as the Toaster reads it.

/** How many toasts with this title are on screen. */
function OnScreen({ title }: { title: string }) {
  const { toasts } = useToastState()
  return <output aria-label={title}>{toasts.filter((t) => t.open && t.title === title).length}</output>
}
const shown = (title: string) => Number(screen.getByRole("status", { name: title }).textContent)

// Each test has a title of its own, so a toast left from another never counts.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Picker({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return open ? <div role="dialog">Insert a table</div> : null
}

/** A screen that opens a dialog made outside it, as the app's confirm and Void's are. */
function Opener({ Lazy, title }: { Lazy: FC<{ open: boolean; onOpenChange: (open: boolean) => void }>; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <main>
      <OnScreen title={title} />
      <button type="button" onClick={() => setOpen(true)}>
        Table
      </button>
      <Lazy open={open} onOpenChange={setOpen} />
    </main>
  )
}

const press = () => act(async () => screen.getByRole("button", { name: "Table" }).click())

describe("the toast that says an overlay couldn't open", () => {
  it("is one, however often the overlay fails: a repeat replaces it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const Lazy = lazyDialog(() => Promise.reject(new Error("offline")), "the table picker")
    render(<Opener Lazy={Lazy} title="Couldn't open the table picker" />)
    await press()
    expect(shown("Couldn't open the table picker")).toBe(1)
    await press()
    await press()
    expect(shown("Couldn't open the table picker")).toBe(1)
  })

  it("is one for an overlay that draws it itself, as Pages and the block menu do", async () => {
    render(<OnScreen title="Pages didn't open" />)
    for (let i = 0; i < 3; i++) {
      const { unmount } = render(<OverlayUnavailable title="Pages didn't open" onClose={() => {}} />)
      unmount()
    }
    expect(shown("Pages didn't open")).toBe(1)
  })

  it("goes as soon as the overlay's code comes on the next open, which then opens", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let offline = true
    const Lazy = lazyDialog(() => (offline ? Promise.reject(new Error("offline")) : Promise.resolve(Picker)), "the cell picker")
    render(<Opener Lazy={Lazy} title="Couldn't open the cell picker" />)
    await press()
    expect(shown("Couldn't open the cell picker")).toBe(1)
    offline = false
    await press()
    expect(screen.getByRole("dialog").textContent).toBe("Insert a table")
    expect(shown("Couldn't open the cell picker")).toBe(0)
  })

  it("goes as soon as a warm brings the code, before any open", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let offline = true
    const Lazy = lazyDialog(() => (offline ? Promise.reject(new Error("offline")) : Promise.resolve(Picker)), "the row picker")
    render(<Opener Lazy={Lazy} title="Couldn't open the row picker" />)
    await press()
    expect(shown("Couldn't open the row picker")).toBe(1)
    offline = false
    await act(async () => void (await Lazy.warm()))
    expect(shown("Couldn't open the row picker")).toBe(0)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("goes as soon as the browser is back online and the code comes, with no press", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let offline = true
    const Lazy = lazyDialog(() => (offline ? Promise.reject(new Error("offline")) : Promise.resolve(Picker)), "the column picker")
    render(<Opener Lazy={Lazy} title="Couldn't open the column picker" />)
    await press()
    expect(shown("Couldn't open the column picker")).toBe(1)
    offline = false
    await act(async () => void window.dispatchEvent(new Event("online")))
    expect(shown("Couldn't open the column picker")).toBe(0)
  })
})
