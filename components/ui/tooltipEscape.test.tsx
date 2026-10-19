import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"
import { onEscape } from "@/lib/keys/onEscape"
import { MediaQueryProvider } from "@/context/MediaQueryContext"

// A tooltip closes on Escape (WCAG 1.4.13), and it is no layer of the page's
// (lib/keys/escape): the same press goes on to what the page has open. The
// doc's Here now button, its focus back after its list closed, showed its
// tooltip, which took the Escape meant to stop following someone.

afterEach(cleanup)

function Page({ onPageEscape }: { onPageEscape: () => void }) {
  const [open, setOpen] = React.useState(true)
  React.useEffect(() => onEscape("page", onPageEscape), [onPageEscape])
  return (
    <MediaQueryProvider>
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button type="button">Here now</button>
        </TooltipTrigger>
        <TooltipContent>Who is here</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    </MediaQueryProvider>
  )
}

describe("a tooltip and Escape", () => {
  it("closes the tooltip, and the press reaches the page as well", () => {
    const stop = vi.fn()
    render(<Page onPageEscape={stop} />)
    expect(screen.getAllByText("Who is here").length).toBeGreaterThan(0)
    const button = screen.getByRole("button", { name: "Here now" })
    button.focus()
    act(() => {
      fireEvent.keyDown(button, { key: "Escape" })
    })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-radix-popper-content-wrapper] [data-state="delayed-open"], [data-radix-popper-content-wrapper] [data-state="instant-open"]')).toBeNull()
  })
})
