import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GlobalProgressBar, LoadingProvider, PROGRESS_BAR_DELAY_MS, SheetProgressBar } from "./LoadingContext"
import { loadingBus } from "@/lib/utils/loadingBus"

// The bar showed for every request, so most clicks flashed it; it grew its
// width (layout, every frame). It shows only for a wait somebody would notice,
// and moves by transform. Design v3 (shell §L2) puts it on the sheet's top
// edge, in the accent, as a travelling light.

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const bar = (c: HTMLElement) => c.querySelector("[data-progress-bar]")
const shown = (c: HTMLElement) => c.querySelector(".sheet-progress")?.getAttribute("data-shown") === "true"
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")

describe("the loading bar", () => {
  it("doesn't show for a quick request", () => {
    const view = render(<GlobalProgressBar active />)
    act(() => void vi.advanceTimersByTime(PROGRESS_BAR_DELAY_MS - 50))
    view.rerender(<GlobalProgressBar active={false} />)
    act(() => void vi.advanceTimersByTime(1000))
    expect(shown(view.container)).toBe(false)
    expect(bar(view.container)).toBeNull()
  })

  it("shows for a slow one", () => {
    const view = render(<GlobalProgressBar active />)
    act(() => void vi.advanceTimersByTime(PROGRESS_BAR_DELAY_MS + 10))
    expect(shown(view.container)).toBe(true)
    expect(bar(view.container)).toBeTruthy()
  })

  it("sits on the sheet's edge, 12px in, in the accent, and travels by transform", () => {
    const rule = css.match(/\.sheet-progress\s*\{([\s\S]*?)\}/)?.[1] ?? ""
    expect(rule).toMatch(/left:\s*12px/)
    expect(rule).toMatch(/right:\s*12px/)
    expect(rule).toMatch(/height:\s*2px/)
    expect(rule).toMatch(/position:\s*absolute/)
    expect(css).toMatch(/\.sheet-progress > i\s*\{[^}]*linear-gradient\(90deg, transparent, var\(--brand\), transparent\)[^}]*sheet-progress-sweep 1\.2s/)
    const frames = css.match(/@keyframes sheet-progress-sweep\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(frames).toMatch(/translateX\(-100%\)/)
    expect(frames).not.toMatch(/\bwidth\s*:/)
  })

  it("leaves the window's top to the sheet once a sheet bar is mounted", () => {
    const view = render(
      <LoadingProvider>
        <div className="app-sheet"><SheetProgressBar /></div>
      </LoadingProvider>,
    )
    expect(view.container.querySelectorAll(".sheet-progress")).toHaveLength(1)
    act(() => loadingBus.start())
    act(() => void vi.advanceTimersByTime(PROGRESS_BAR_DELAY_MS + 10))
    expect(view.container.querySelector(".app-sheet [data-progress-bar]")).toBeTruthy()
    act(() => loadingBus.end())
  })
})
