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
    expect(savedState.querySelector("[data-hub-spot]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Nothing saved for later" })).toBeTruthy()
    const frame = { wrapper: savedState.className, empty: savedState.firstElementChild!.className }
    cleanup()

    const done = mount("done")
    const doneState = done.container.querySelector("[data-later-state]")!
    // Done was one grey line where Saved had a drawing and a title.
    expect(doneState.querySelector("[data-hub-spot]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Nothing done yet" })).toBeTruthy()
    expect({ wrapper: doneState.className, empty: doneState.firstElementChild!.className }).toEqual(frame)
  })

  it("puts a failure where the empty state goes", () => {
    answer = { data: undefined, isLoading: false, isError: true }
    const { container } = mount("done")
    expect(container.querySelector("[data-later-state]")?.textContent).toMatch(/Try again/)
  })

  it("loads in the rows' own shape: two-line HubRow skeletons", () => {
    answer = { data: undefined, isLoading: true, isError: false }
    const { container } = mount("open")
    expect(container.querySelectorAll("[data-later-skeleton-row] [data-hub-skeleton][data-density=two-line]")).toHaveLength(3)
  })

  // Later is Activity's frame (hub.md L1), never a second one.
  it("draws in the hub frame, in Activity's 760px column", () => {
    const src = readFileSync(resolve(__dirname, "LaterPage.tsx"), "utf8")
    expect(src).toMatch(/<HubFrame/)
    expect(src).toMatch(/<HubTabs/)
    expect(src).toMatch(/data-later-frame="" [^>]*max-w-\[760px\]/)
    expect(src).not.toMatch(/SectionTabs/)
  })
})
