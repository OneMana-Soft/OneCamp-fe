import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

/** Save for later (hub.md L4): saved is the bookmark filled in the accent, with a spring. */
let saved: { id: string } | undefined
const spring = vi.fn()
vi.mock("@/lib/celebrate", async (orig) => ({ ...(await orig<typeof import("@/lib/celebrate")>()), springPop: (el: unknown) => spring(el) }))
vi.mock("@/lib/spring", () => ({ springPop: (el: unknown) => spring(el) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/useLater", () => ({
  useSavedEntry: () => saved,
  useLaterActions: () => ({ save: vi.fn(), remind: vi.fn(), done: vi.fn(), remove: vi.fn() }),
}))

import { SaveForLaterButton } from "@/components/later/SaveForLater"

const target = { itemType: "post" as const, itemId: "p1", link: "/app/channel/c1/p1", title: "rollback steps" }
const mount = () => render(<TooltipProvider><SaveForLaterButton target={target} /></TooltipProvider>)

afterEach(() => {
  cleanup()
  saved = undefined
  spring.mockClear()
})

describe("the save-for-later control", () => {
  it("fills the bookmark in the accent once saved", () => {
    saved = { id: "l1" }
    const { container } = mount()
    const btn = container.querySelector("button")!
    expect(btn.getAttribute("aria-pressed")).toBe("true")
    expect(btn.className).toContain("text-brand")
    expect(btn.className).toContain("[&_svg]:fill-current")
  })

  it("springs when it fills, and stands still when it loads filled", () => {
    saved = { id: "l1" }
    mount()
    expect(spring).not.toHaveBeenCalled()
    cleanup()
    saved = undefined
    const { rerender } = mount()
    saved = { id: "l1" }
    rerender(<TooltipProvider><SaveForLaterButton target={target} /></TooltipProvider>)
    expect(spring).toHaveBeenCalledTimes(1)
  })

  // "Tomorrow morning" wrapped to a 52px row in the menu (QA F-38).
  it("keeps each reminder choice on one line", () => {
    const { container } = mount()
    fireEvent.keyDown(container.querySelector("button")!, { key: "Enter" })
    const choice = screen.getByText("Tomorrow morning")
    expect(choice.className).toContain("whitespace-nowrap")
    expect(choice.nextElementSibling?.className).toContain("whitespace-nowrap")
  })
})
