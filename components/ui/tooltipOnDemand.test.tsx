import { renders } from "@/lib/testing/reactRenders"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SCREENS, putOnScreen } from "@/lib/testing/screens"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, warmTooltip } from "@/components/ui/tooltip"
import { warmBeforeTests } from "@/lib/testing/lazyCode"

// Its asserts are synchronous under fake timers: the Radix side is here before they start.
warmBeforeTests(warmTooltip)

// A TOOLTIP ON DEMAND (FLUIDITY H2, 5 Nov 2026). A closed Radix tooltip cost
// about 16 components (its root, popper, anchor, slots, portal and presence),
// and every shell, list row and toolbar drew one per labelled control on each
// of its renders. Until its trigger is first pointed at with a mouse or
// focused from the keys, a tooltip draws its trigger alone; Radix's tooltip
// joins on that intent, on the same node, and leaves after it closes. What a
// person sees is unchanged: 400 ms over a control, at once within the
// provider's 300 ms of another, at once with keyboard focus, Escape hides it,
// nothing on a tap, and the trigger is never drawn again.

let undo = () => {}
afterEach(() => {
  cleanup()
  undo()
  undo = () => {}
  vi.useRealTimers()
})

const label = () => document.querySelector("[data-radix-popper-content-wrapper] > [data-state$='open']")
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

let mounts = 0
function Inside() {
  React.useEffect(() => void mounts++, [])
  return <span>B</span>
}

function Tip({ name, text, buttonRef }: { name: string; text: string; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" ref={buttonRef} aria-label={name}>
          <Inside />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

function Bar({ count = 2, buttonRef }: { count?: number; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <TooltipProvider>
      {Array.from({ length: count }, (_, i) => (
        <Tip key={i} name={`Tool ${i}`} text={`Tool ${i} tip`} buttonRef={i === 0 ? buttonRef : undefined} />
      ))}
    </TooltipProvider>
  )
}

const tool = (i: number) => screen.getByRole("button", { name: `Tool ${i}` })

describe("a closed tooltip", () => {
  // A row is the test's Tip and Inside, and the tooltip's Tooltip, TooltipTrigger, Slot, SlotClone and TooltipContent: 7 (18 on Radix's whole).
  it("draws its trigger and nothing of Radix's", () => {
    renders.reset()
    render(<Bar count={20} />)
    expect(renders.count / 20, renders.top()).toBeLessThanOrEqual(7.5)
  })

  it("on a touch screen, a tap and the focus after it bring nothing of Radix's", () => {
    vi.useFakeTimers()
    undo = putOnScreen(SCREENS["a phone in portrait"])
    const { rerender } = render(<Bar count={20} />)
    fireEvent.pointerDown(tool(0), { pointerType: "touch" })
    act(() => tool(0).focus())
    fireEvent.pointerUp(tool(0), { pointerType: "touch" })
    fireEvent.click(tool(0))
    wait(600)
    expect(label()).toBeNull()
    renders.reset()
    rerender(<Bar count={20} />)
    expect(renders.count / 20, renders.top()).toBeLessThanOrEqual(7.5)
  })
})

describe("a tooltip on demand", () => {
  it("opens 400 ms after a mouse comes onto its trigger, on the same node, and leaves after it closes", () => {
    vi.useFakeTimers()
    mounts = 0
    const ref = React.createRef<HTMLButtonElement>()
    const { rerender } = render(<Bar buttonRef={ref} />)
    const node = tool(0)
    expect(node.getAttribute("data-state")).toBe("closed")
    fireEvent.pointerMove(node, { pointerType: "mouse" })
    wait(390)
    expect(label()).toBeNull()
    wait(20)
    expect(label()?.textContent).toContain("Tool 0 tip")
    expect(node.getAttribute("data-state")).toBe("delayed-open")
    expect(node.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    fireEvent.pointerDown(node, { pointerType: "mouse" })
    fireEvent.pointerLeave(node, { pointerType: "mouse" })
    wait(400)
    expect(label()).toBeNull()
    expect(node.getAttribute("data-state")).toBe("closed")
    expect(node.hasAttribute("aria-describedby")).toBe(false)
    expect(tool(0)).toBe(node)
    expect(ref.current).toBe(node)
    expect(mounts).toBe(2)
    // Gone again: drawing the bar costs what it did before the hover.
    renders.reset()
    rerender(<Bar buttonRef={ref} />)
    expect(renders.count, renders.top()).toBeLessThanOrEqual(20)
  })

  it("opens at once within the provider's 300 ms of another, and waits 400 ms after", () => {
    vi.useFakeTimers()
    render(<Bar />)
    fireEvent.pointerMove(tool(0), { pointerType: "mouse" })
    wait(410)
    expect(label()?.textContent).toContain("Tool 0 tip")
    // Radix's grace area reads the trigger's box, which jsdom has none of: leave once it has closed.
    fireEvent.pointerMove(tool(1), { pointerType: "mouse" })
    expect(label()?.textContent).toContain("Tool 1 tip")
    expect(document.body.textContent).not.toContain("Tool 0 tip")
    fireEvent.pointerLeave(tool(0), { pointerType: "mouse" })
    fireEvent.pointerDown(tool(1), { pointerType: "mouse" })
    fireEvent.pointerLeave(tool(1), { pointerType: "mouse" })
    expect(label()).toBeNull()
    wait(350)
    fireEvent.pointerMove(tool(0), { pointerType: "mouse" })
    wait(390)
    expect(label()).toBeNull()
    wait(20)
    expect(label()?.textContent).toContain("Tool 0 tip")
  })

  it("shows at once with keyboard focus, keeps the focus, and Escape hides it", () => {
    render(<Bar />)
    const node = tool(0)
    act(() => node.focus())
    expect(label()?.textContent).toContain("Tool 0 tip")
    expect(document.activeElement).toBe(node)
    act(() => void fireEvent.keyDown(node, { key: "Escape" }))
    expect(label()).toBeNull()
    expect(document.activeElement).toBe(node)
    expect(tool(0)).toBe(node)
  })

  it("shows nothing for a click's focus", () => {
    vi.useFakeTimers()
    render(<Bar />)
    const node = tool(0)
    fireEvent.pointerDown(node, { pointerType: "mouse" })
    act(() => node.focus())
    fireEvent.pointerUp(node, { pointerType: "mouse" })
    wait(600)
    expect(label()).toBeNull()
  })

  it("still lets a caller's open decide", () => {
    vi.useFakeTimers()
    const asked = vi.fn()
    function Held({ start }: { start: boolean }) {
      const [open, setOpen] = React.useState(start)
      return (
        <TooltipProvider>
          <Tooltip
            open={open}
            onOpenChange={(next) => {
              asked(next)
              setOpen(next)
            }}
          >
            <TooltipTrigger asChild>
              <button type="button">Held</button>
            </TooltipTrigger>
            <TooltipContent>Held tip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    render(<Held start />)
    expect(label()?.textContent).toContain("Held tip")
    cleanup()
    render(<Held start={false} />)
    const node = screen.getByRole("button", { name: "Held" })
    fireEvent.pointerMove(node, { pointerType: "mouse" })
    wait(410)
    expect(asked).toHaveBeenLastCalledWith(true)
    expect(label()?.textContent).toContain("Held tip")
    act(() => void fireEvent.keyDown(node, { key: "Escape" }))
    expect(asked).toHaveBeenLastCalledWith(false)
    expect(label()).toBeNull()
  })
})
