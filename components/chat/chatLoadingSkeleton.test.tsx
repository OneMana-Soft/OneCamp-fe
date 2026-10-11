import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { ChatLoadingSkeleton } from "./ChatLoadingSkeleton"

// Design v3 chat, C34: a loading conversation on the message row's own grid,
// eight rows that breathe 120 ms apart, shown only after 150 ms so a fast
// load never flashes it.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ChatLoadingSkeleton", () => {
  it("draws eight rows on the row's grid: a 36px disc, a 96px name bar and body bars", () => {
    const { container } = render(<ChatLoadingSkeleton />)
    const rows = container.querySelectorAll("[data-skeleton-row]")
    expect(rows).toHaveLength(8)
    const row = rows[0] as HTMLElement
    for (const c of ["grid-cols-[36px_minmax(0,1fr)]", "gap-x-3", "pl-5", "pr-6", "py-1.5"]) expect(row.className).toContain(c)
    expect(row.querySelector(".size-9.rounded-full.bg-press")).toBeTruthy()
    expect(row.querySelector(".h-2\\.5.w-24")).toBeTruthy()
    expect(row.querySelector(".h-5")).toBeTruthy()
    expect(row.querySelector(".h-\\[23px\\]")).toBeTruthy()
  })

  it("breathes each row 120 ms after the last, only when motion is welcome", () => {
    const { container } = render(<ChatLoadingSkeleton />)
    const rows = [...container.querySelectorAll<HTMLElement>("[data-skeleton-row]")]
    expect(rows.map((r) => r.style.animationDelay)).toEqual(rows.map((_, i) => `${i * 120}ms`))
    for (const r of rows) {
      expect(r.className).toContain("motion-safe:animate-shimmer")
      expect(r.className).not.toMatch(/(^|\s)animate-pulse/)
    }
  })

  it("shows only after 150 ms", () => {
    vi.useFakeTimers()
    const { container } = render(<ChatLoadingSkeleton />)
    const box = container.querySelector<HTMLElement>("[data-message-skeleton]")!
    expect(box.className).toContain("invisible")
    act(() => { vi.advanceTimersByTime(160) })
    expect(box.className).not.toContain("invisible")
  })
})
