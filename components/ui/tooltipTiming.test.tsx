import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * Tooltips wait 400ms (design v3, admin §8 H6): long enough that a pointer
 * crossing a toolbar doesn't flash a row of labels, short enough that a
 * person who stops on an icon gets its name. Once one is showing, the next
 * opens at once if the pointer moves on within 300ms. The chip is the shell's
 * inverted one: 12/510 at r6, padding 4/8, no arrow.
 */
function Two() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Bold</TooltipTrigger>
        <TooltipContent>Bold text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe("tooltip timing", () => {
  it("opens after 400ms of hover, not before", () => {
    vi.useFakeTimers()
    render(<Two />)
    fireEvent.pointerMove(screen.getByText("Bold"), { pointerType: "mouse" })
    act(() => { vi.advanceTimersByTime(390) })
    expect(screen.queryByRole("tooltip")).toBeNull()
    act(() => { vi.advanceTimersByTime(20) })
    expect(screen.getByRole("tooltip")).toHaveTextContent("Bold text")
  })

  it("is the inverted chip: 12/510, r6, padding 4/8, no arrow", () => {
    vi.useFakeTimers()
    render(<Two />)
    fireEvent.pointerMove(screen.getByText("Bold"), { pointerType: "mouse" })
    act(() => { vi.advanceTimersByTime(410) })
    const chip = document.querySelector("[data-radix-popper-content-wrapper] > *") as HTMLElement
    expect(chip.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-2xs", "font-medium", "rounded-sm", "px-2", "py-1", "bg-[var(--tooltip-bg)]"]))
    expect(document.querySelector("svg[width='10']")).toBeNull()
  })
})
