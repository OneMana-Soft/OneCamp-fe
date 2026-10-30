import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// A TOOLTIP FOLLOWS THE INPUT, NOT THE WIDTH (21 Oct 2026). It read the width
// (isMobile, under 640px), so a phone held sideways (844x390) and a tablet
// showed a label as a mouse's does: on the focus a closing menu gives back,
// and under a pointer passing over, More's label stood over version history's
// Save version (DESIGN-BUILD-3). On a touch screen (lib/ui/touchScreen, the
// sheet rule's coarse pointer) a label shows on a long press only; with a
// mouse, after 400 ms over the control, and with keyboard focus.

let undo = () => {}
afterEach(() => {
  cleanup()
  undo()
  undo = () => {}
  vi.useRealTimers()
})

const pressed = vi.fn()

function Bar() {
  return (
    <MediaQueryProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={pressed}>
              More
            </button>
          </TooltipTrigger>
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </MediaQueryProvider>
  )
}

/** The label as drawn (it holds the copy kept for a screen reader too). */
const label = () => document.querySelector("[data-radix-popper-content-wrapper] > [data-state$='open']")
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
/** A finger, well inside the screen (its sides are the system's back gesture). */
const finger = { touches: [{ clientX: 120, clientY: 200 }] }

function on(name: ScreenName) {
  vi.useFakeTimers()
  undo = putOnScreen(SCREENS[name])
  pressed.mockClear()
  render(<Bar />)
  return screen.getByRole("button", { name: "More" })
}

const TOUCH: ScreenName[] = ["a phone in portrait", "a phone in landscape", "a tablet"]

for (const name of TOUCH) {
  describe(`on ${name}, a touch screen`, () => {
    it("shows no label on a tap, on the focus given back, or under a pointer passing over", () => {
      const more = on(name)
      fireEvent.pointerDown(more, { pointerType: "touch" })
      fireEvent.pointerUp(more, { pointerType: "touch" })
      fireEvent.click(more)
      wait(600)
      expect(label(), "a tap").toBeNull()
      expect(pressed).toHaveBeenCalledTimes(1)
      act(() => more.focus())
      wait(600)
      expect(label(), "the focus a closing menu gives back").toBeNull()
      fireEvent.pointerMove(more, { pointerType: "mouse" })
      wait(600)
      expect(label(), "a pointer passing over").toBeNull()
    })

    it("shows the label on a long press, which presses nothing, until a tap elsewhere", () => {
      const more = on(name)
      fireEvent.touchStart(more, finger)
      wait(520)
      expect(label()?.textContent, "a long press").toContain("More actions")
      fireEvent.touchEnd(more)
      // The click a phone sends as the finger lifts.
      fireEvent.click(more)
      expect(pressed).not.toHaveBeenCalled()
      expect(label()?.textContent, "lifted").toContain("More actions")
      wait(20)
      fireEvent.pointerDown(document.body)
      wait(200)
      expect(label(), "a tap elsewhere").toBeNull()
    })
  })
}

describe("on a computer, with a mouse", () => {
  it("shows the label after 400 ms over the control", () => {
    const more = on("a computer")
    fireEvent.pointerMove(more, { pointerType: "mouse" })
    wait(390)
    expect(label()).toBeNull()
    wait(20)
    expect(label()?.textContent).toContain("More actions")
  })

  it("shows the label with keyboard focus", () => {
    const more = on("a computer")
    act(() => more.focus())
    expect(label()?.textContent).toContain("More actions")
  })
})

describe("a caller's own open", () => {
  it("still decides, for a long press too", () => {
    vi.useFakeTimers()
    undo = putOnScreen(SCREENS["a phone in landscape"])
    const asked = vi.fn()
    // A crumb's tip opens only when its name is cut short (RightPanelTaskHeader's CrumbTip); this one never is.
    function Crumb() {
      const [open, setOpen] = React.useState(false)
      return (
        <MediaQueryProvider>
          <TooltipProvider>
            <Tooltip
              open={open}
              onOpenChange={(next) => {
                asked(next)
                setOpen(false)
              }}
            >
              <TooltipTrigger asChild>
                <button type="button">Launch plan</button>
              </TooltipTrigger>
              <TooltipContent>Launch plan, in full</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </MediaQueryProvider>
      )
    }
    render(<Crumb />)
    fireEvent.touchStart(screen.getByRole("button", { name: "Launch plan" }), finger)
    wait(520)
    expect(asked).toHaveBeenCalledWith(true)
    expect(label()).toBeNull()
  })
})
