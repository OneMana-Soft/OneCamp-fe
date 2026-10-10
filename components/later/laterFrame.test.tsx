import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { TooltipProvider } from "@/components/ui/tooltip"

// Later's two tabs in one frame (QA_BACKLOG "Tab consistency": Later), and
// that frame where Activity's is.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

let answer: { data?: { data: { items: unknown[]; due: number } }; isLoading: boolean; isError: boolean } = {
  data: { data: { items: [], due: 0 } },
  isLoading: false,
  isError: false,
}
vi.mock("@/hooks/useLater", () => ({
  useLaterList: () => ({ ...answer, mutate: vi.fn() }),
  useLaterActions: () => ({ done: vi.fn(), remove: vi.fn(), save: vi.fn(), remind: vi.fn(), refresh: vi.fn() }),
}))

const { LaterItems } = await import("@/components/later/LaterPage")

const mount = (state: "open" | "done") =>
  render(
    <TooltipProvider>
      <LaterItems state={state} />
    </TooltipProvider>,
  )

afterEach(() => {
  cleanup()
  answer = { data: { data: { items: [], due: 0 } }, isLoading: false, isError: false }
})

describe("Later's tabs", () => {
  it("say they are empty in one frame: a drawing, a title and a sentence, in the same place", () => {
    const saved = mount("open")
    const savedState = saved.container.querySelector("[data-later-state]")!
    expect(savedState.querySelector("[data-empty-illustration]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Nothing saved for later" })).toBeTruthy()
    const frame = { wrapper: savedState.className, empty: savedState.firstElementChild!.className }
    cleanup()

    const done = mount("done")
    const doneState = done.container.querySelector("[data-later-state]")!
    // Done was one grey line where Saved had a drawing and a title.
    expect(doneState.querySelector("[data-empty-illustration]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Nothing done yet" })).toBeTruthy()
    expect({ wrapper: doneState.className, empty: doneState.firstElementChild!.className }).toEqual(frame)
  })

  it("puts a failure where the empty state goes", () => {
    answer = { data: undefined, isLoading: false, isError: true }
    const { container } = mount("done")
    expect(container.querySelector("[data-later-state]")?.textContent).toMatch(/Try again/)
  })

  it("loads in the rows' line boxes: a 20px title and an 18px line, 2px apart", () => {
    answer = { data: undefined, isLoading: true, isError: false }
    const { container } = mount("open")
    const bars = [...container.querySelectorAll("[data-later-skeleton-row] span > *")].map((b) => b.className)
    expect(bars[0]).toContain("h-5")
    expect(bars[1]).toContain("h-[18px]")
    expect(bars[1]).toContain("mt-0.5")
  })

  it("keeps the tab labels still: no count that arrives with the list", () => {
    const src = readFileSync(resolve(__dirname, "LaterPage.tsx"), "utf8")
    expect(src).not.toMatch(/due`/)
    // Activity's column, not a centred one of its own.
    expect(src).toMatch(/<PageContainer data-later-frame=""/)
    expect(src).not.toMatch(/mx-auto w-full max-w-3xl/)
  })
})
