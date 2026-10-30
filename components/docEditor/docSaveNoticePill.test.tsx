import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

import type { SaveState } from "@/components/docEditor/SaveDot"
import type { DocSaveSource } from "@/components/docEditor/docSaveState"

// The dot's reading (useDocSaveDot), set by each step. The toasts are the app's
// own, drawn by its Toaster, which closes "Saved" when its time is up.
const dot = vi.hoisted(() => ({ reading: { state: "saved" as SaveState, savedAt: null as Date | null, waiting: 0 } }))
vi.mock("@/components/docEditor/docSaveState", () => ({ useDocSaveDot: () => dot.reading }))

import { DocSaveNotice } from "@/components/docEditor/DocSaveNotice"
import { OfflineNotice } from "@/components/error/OfflineNotice"
import { Toaster } from "@/components/ui/toaster"

// On a phone the save notice (a doc's, V-21; a board's, V-45) is the app's
// toast, which comes in where the connection pill floats: both sit just above
// the screen's foot, so the pill showed under the notice (DESIGN-BUILD-29 M1).
// The notice says what the pill would, so while it shows the pill steps aside
// on a phone. A wide screen keeps both: the pill bottom-left, toasts
// bottom-right.
describe("the save notice and the app's connection pill", () => {
  const source = { provider: null, live: true } as DocSaveSource
  const view = (notice = true) => (
    <>
      <OfflineNotice />
      <Toaster />
      {notice && <DocSaveNotice source={source} />}
    </>
  )
  const read = (state: SaveState, waiting = 0, savedAt: Date | null = null) => (dot.reading = { state, savedAt, waiting })
  const pill = () => {
    const el = document.querySelector<HTMLElement>("[data-connection-pill]")
    if (!el) throw new Error("no connection pill")
    return el
  }
  const classes = () => pill().className.split(/\s+/)
  const asideOnAPhone = () => classes().includes("max-sm:hidden")

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    read("offline")
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("steps aside on a phone while the notice says the changes wait, and comes back when it ends", () => {
    const { rerender } = render(view())
    expect(pill().textContent).toContain("You're offline")
    expect(asideOnAPhone()).toBe(false)

    read("offline", 2)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(screen.getByText("Offline. Changes are kept and will sync")).toBeTruthy()
    expect(asideOnAPhone()).toBe(true)
    // Only on a phone: on a wide screen the two sit apart, and both show.
    expect(classes()).not.toContain("hidden")

    // Nothing waits any more: the notice ends, and the pill has its place back.
    read("offline", 0)
    rerender(view())
    expect(asideOnAPhone()).toBe(false)
  })

  it("stays aside through the notice's last word, until its toast closes", () => {
    const { rerender } = render(view())
    read("offline", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(asideOnAPhone()).toBe(true)

    // Back and stored: "Saved" goes by itself after 4 s, and holds the place while it shows.
    read("saved", 0, new Date())
    rerender(view())
    act(() => void vi.advanceTimersByTime(3_000))
    expect(screen.getByText(/^Saved · /)).toBeTruthy()
    expect(asideOnAPhone()).toBe(true)
    act(() => void vi.advanceTimersByTime(1_500))
    expect(asideOnAPhone()).toBe(false)
  })

  it("says nothing for a blip, so the pill keeps its place", () => {
    const { rerender } = render(view())
    read("offline", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(1_900))
    expect(asideOnAPhone()).toBe(false)
  })

  it("gives the place back when the doc closes with its notice up", () => {
    const { rerender } = render(view())
    read("offline", 1)
    rerender(view())
    act(() => void vi.advanceTimersByTime(2_000))
    expect(asideOnAPhone()).toBe(true)
    rerender(view(false))
    expect(asideOnAPhone()).toBe(false)
  })
})
