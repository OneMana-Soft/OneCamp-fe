import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToolbarButton } from "./toolbar-button"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

afterEach(cleanup)

// A formatting button says whether it is on, to the eye and to a screen
// reader, from the editor's state. Inside its tooltip the toggle's own
// data-state belonged to the tooltip, so "on" never showed, and its pressed
// state was the toggle's own guess.
describe("ToolbarButton", () => {
  it.each([
    [true, "true"],
    [false, "false"],
  ])("with isActive %s is pressed %s, inside a tooltip too", (isActive, pressed) => {
    render(
      <TooltipProvider>
        <ToolbarButton isActive={isActive} tooltip="Bold ⌘B" aria-label="Bold">
          B
        </ToolbarButton>
      </TooltipProvider>,
    )
    const button = screen.getByRole("button", { name: "Bold" })
    expect(button.getAttribute("aria-pressed")).toBe(pressed)
    expect(/(^|\s)bg-highlight(\s|$)/.test(button.className)).toBe(isActive)
    expect(button.className).not.toMatch(/(^|\s)bg-accent(\s|$)/)
  })

  it("leaves a plain button that is not told its state alone", () => {
    render(<ToolbarButton aria-label="Image">I</ToolbarButton>)
    expect(screen.getByRole("button", { name: "Image" }).getAttribute("aria-pressed")).toBe("false")
  })
})
