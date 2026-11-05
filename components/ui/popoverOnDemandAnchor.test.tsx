import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

// CR-206 row 2462 (V-415): with a PopoverAnchor beside a PopoverTrigger, Radix
// anchors the content to the Anchor (react-popover 1.1.15 index.mjs:99,
// hasCustomAnchor). Which element does popoverOnDemand hand Radix?
const seen = vi.hoisted(() => ({ el: null as Element | null }))
vi.mock("@/components/ui/popover", async (original) => {
  const real = (await original()) as typeof import("@/components/ui/popover")
  const PopoverAnchor = (props: React.ComponentProps<typeof real.PopoverAnchor>) => {
    const v = (props as { virtualRef?: React.RefObject<Element> }).virtualRef
    React.useEffect(() => {
      seen.el = v?.current ?? null
    })
    return <real.PopoverAnchor {...props} />
  }
  return { ...real, PopoverAnchor }
})
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popoverOnDemand"

afterEach(cleanup)

function Both() {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div data-testid="anchor">Composer</div>
      </PopoverAnchor>
      <PopoverTrigger asChild>
        <button type="button">AI</button>
      </PopoverTrigger>
      <PopoverContent aria-label="Ask">x</PopoverContent>
    </Popover>
  )
}

it("anchors the content to the Anchor, not the Trigger, as Radix does", async () => {
  render(<Both />)
  fireEvent.click(screen.getByRole("button", { name: "AI" }))
  await screen.findByRole("dialog", { name: "Ask" })
  expect(seen.el?.textContent).toBe("Composer")
})
