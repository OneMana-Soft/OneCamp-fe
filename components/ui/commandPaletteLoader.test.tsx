import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// fluid-13/15 (FLUIDITY-LEAD): the palette, 66 KB of source, was fetched and
// mounted with every page, on a phone too, where it opens from the search
// page. It mounts on its first use: ⌘K or ⌘P, or any opener's request (the
// sidebar pill, the phone's search icon, a 404's Search). On a computer its
// code is fetched once the page is quiet, so the first ⌘K opens at once.
const palette = vi.hoisted(() => ({ loads: 0, mounts: 0 }))
vi.mock("@/components/ui/CommandPalette", () => {
  palette.loads++
  return {
    CommandPalette: () => {
      palette.mounts++
      return <div data-testid="palette" />
    },
  }
})
const quiet = vi.hoisted(() => ({ tasks: [] as Array<() => unknown> }))
vi.mock("@/lib/ui/whenQuiet", () => ({
  runWhenQuiet: (tasks: Array<() => unknown>) => {
    quiet.tasks.push(...tasks)
    return () => {}
  },
}))

const { CommandPaletteLoader } = await import("./CommandPaletteLoader")
const { openPalette, takePendingPaletteRequest } = await import("@/lib/ui/palette")

const fine = (yes: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: fine") ? yes : false, addEventListener() {}, removeEventListener() {} }))

beforeEach(() => {
  palette.mounts = 0
  quiet.tasks = []
  takePendingPaletteRequest()
  fine(true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the palette's loader", () => {
  it("mounts nothing at load", () => {
    render(<CommandPaletteLoader />)
    expect(screen.queryByTestId("palette")).toBeNull()
    expect(palette.mounts).toBe(0)
  })

  it("mounts the palette on the first ⌘K, keeping the press as a request it takes", async () => {
    render(<CommandPaletteLoader />)
    const press = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => void document.dispatchEvent(press))
    expect(press.defaultPrevented).toBe(true)
    expect(await screen.findByTestId("palette")).toBeTruthy()
    expect(takePendingPaletteRequest()).toEqual({ mode: "search" })
  })

  it("leaves a ⌘K another part took (a doc's link key) alone", async () => {
    render(<CommandPaletteLoader />)
    const press = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true })
    press.preventDefault()
    await act(async () => void document.dispatchEvent(press))
    expect(screen.queryByTestId("palette")).toBeNull()
  })

  it("mounts the palette for an opener's request", async () => {
    render(<CommandPaletteLoader />)
    await act(async () => void openPalette({ mode: "search", query: "q4" }))
    expect(await screen.findByTestId("palette")).toBeTruthy()
  })

  it("fetches the palette's code once the page is quiet on a computer, mounting nothing", async () => {
    render(<CommandPaletteLoader />)
    expect(quiet.tasks).toHaveLength(1)
    await act(async () => void (await quiet.tasks[0]()))
    expect(palette.loads).toBe(1)
    expect(palette.mounts).toBe(0)
  })

  it("fetches nothing ahead on a phone, where it opens from the search page", () => {
    fine(false)
    render(<CommandPaletteLoader />)
    expect(quiet.tasks).toHaveLength(0)
  })
})
