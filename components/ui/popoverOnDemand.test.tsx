import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popoverOnDemand"

// How many times Radix's popover (components/ui/popover) was loaded: never before a popover is wanted.
const loaded = vi.hoisted(() => ({ n: 0 }))
vi.mock("@/components/ui/popover", async (original) => {
  loaded.n++
  return original()
})

afterEach(cleanup)

// A popover as a page holds one: its open state in the page's state.
function Holding({ anchored = false }: { anchored?: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        {anchored ? (
          <PopoverAnchor asChild>
            <button type="button" onClick={() => setOpen((o) => !o)}>
              Stage
            </button>
          </PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>
            <button type="button">Filter</button>
          </PopoverTrigger>
        )}
        <PopoverContent aria-label="Filters">
          <button type="button">Add a filter</button>
        </PopoverContent>
      </Popover>
      <p>Elsewhere</p>
    </div>
  )
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)))

describe("a popover whose code loads on demand", () => {
  it("draws its trigger as Radix's does, with none of Radix's code until it opens", async () => {
    render(<Holding />)
    const trigger = screen.getByRole("button", { name: "Filter" })
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(trigger.getAttribute("data-state")).toBe("closed")
    expect(trigger.getAttribute("aria-controls")).toBeTruthy()
    await tick()
    expect(loaded.n).toBe(0)
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(trigger)
    const box = await screen.findByRole("dialog", { name: "Filters" })
    expect(loaded.n).toBe(1)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("data-state")).toBe("open")
    expect(box.id).toBe(trigger.getAttribute("aria-controls"))
  })

  it("closes on a press of its trigger, and never opens again from the same press", async () => {
    render(<Holding />)
    const trigger = screen.getByRole("button", { name: "Filter" })
    fireEvent.click(trigger)
    await screen.findByRole("dialog", { name: "Filters" })
    await tick()
    // A press is a pointer down, then a click: the down lands outside the popover.
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    await tick()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("puts the focus back on its trigger when Escape closes it, and leaves it where a click elsewhere put it", async () => {
    render(<Holding />)
    const trigger = screen.getByRole("button", { name: "Filter" })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole("dialog", { name: "Filters" })
    await tick()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))

    fireEvent.click(trigger)
    await screen.findByRole("dialog", { name: "Filters" })
    await tick()
    fireEvent.pointerDown(screen.getByText("Elsewhere"))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await tick()
    expect(document.activeElement).not.toBe(trigger)
  })

  it("opens by its holder's state beside an anchor, which keeps its own words", async () => {
    render(<Holding anchored />)
    const anchor = screen.getByRole("button", { name: "Stage" })
    expect(anchor.hasAttribute("aria-haspopup")).toBe(false)
    fireEvent.click(anchor)
    expect(await screen.findByRole("dialog", { name: "Filters" })).toBeTruthy()
  })
})
