import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GlobalProgressBar, PROGRESS_BAR_DELAY_MS } from "./LoadingContext"

// The bar along the top showed for every request, background refreshes
// included, so most clicks flashed it; it grew its width (layout, every frame)
// and glowed in a raw blue. It shows only for a wait somebody would notice,
// it is neutral, and it scales a full-width bar.

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const bar = (c: HTMLElement) => c.querySelector("[data-progress-bar]")
const shown = (c: HTMLElement) => (c.firstElementChild as HTMLElement).className.includes("opacity-100")

describe("the loading bar", () => {
  it("doesn't show for a quick request", () => {
    const view = render(<GlobalProgressBar active />)
    act(() => void vi.advanceTimersByTime(PROGRESS_BAR_DELAY_MS - 50))
    view.rerender(<GlobalProgressBar active={false} />)
    act(() => void vi.advanceTimersByTime(1000))
    expect(shown(view.container)).toBe(false)
    expect(bar(view.container)).toBeNull()
  })

  it("shows for a slow one, neutral, scaled rather than widened", () => {
    const view = render(<GlobalProgressBar active />)
    act(() => void vi.advanceTimersByTime(PROGRESS_BAR_DELAY_MS + 10))
    expect(shown(view.container)).toBe(true)
    const cls = bar(view.container)!.className
    expect(cls).toContain("animate-load-progress")
    expect(cls).toContain("origin-left")
    expect(cls).not.toMatch(/bg-(blue|sky|indigo)-\d|shadow-\[/)
  })

  it("animates transform, never width", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const frames = css.match(/@keyframes load-progress\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(frames).toMatch(/transform:\s*scaleX/)
    expect(frames).not.toMatch(/\bwidth\s*:/)
  })
})
