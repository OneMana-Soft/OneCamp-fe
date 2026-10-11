import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"

afterEach(cleanup)

/**
 * The right sheet (design v3, admin §8 H5). It is a modal surface, so it sits
 * on the top of the ladder with the dialog: e4, no border, on --panel (the
 * right panel's ground, #16171A in dark). It floats like the app's own sheet,
 * 8px off the viewport's top and bottom with r16 on the left corners, at
 * 452px (560 when wide), and moves in from 16px on the panel curve. Its footer
 * is the dialog's. The other sides keep their shapes, and the widths callers
 * pass still win.
 */
function Panel(props: { side?: "top" | "bottom" | "left" | "right"; wide?: boolean; className?: string }) {
  return (
    <Sheet open>
      <SheetContent {...props}>
        <SheetHeader>
          <SheetTitle>Delivery</SheetTitle>
          <SheetDescription>What the endpoint answered.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <button type="button">Resend</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
const tokens = (el: Element) => el.className.split(/\s+/)

describe("sheet surface", () => {
  it("floats on the right at 452px, r16 on the left, e4 on --panel, no border", () => {
    render(<Panel />)
    const sheet = screen.getByRole("dialog")
    expect(sheet).toHaveAttribute("data-side", "right")
    expect(tokens(sheet)).toEqual(expect.arrayContaining(["v3-sheet", "bg-panel", "shadow-e4", "sm:max-w-[452px]", "sm:rounded-l-[16px]", "sm:inset-y-2"]))
    expect(tokens(sheet)).not.toContain("border-l")
    expect(tokens(sheet)).not.toContain("border")
  })

  it("opens wide at 560 on request, and a caller's width still wins", () => {
    render(<Panel wide />)
    expect(tokens(screen.getByRole("dialog"))).toContain("sm:max-w-[560px]")
    cleanup()
    render(<Panel className="sm:max-w-lg" />)
    expect(tokens(screen.getByRole("dialog"))).toContain("sm:max-w-lg")
    expect(tokens(screen.getByRole("dialog"))).not.toContain("sm:max-w-[452px]")
  })

  it("sets the title at title-3 and uses the dialog's footer", () => {
    render(<Panel />)
    expect(tokens(screen.getByRole("heading", { name: "Delivery" }))).toContain("text-title-3")
    expect(tokens(screen.getByRole("button", { name: "Resend" }).parentElement!)).toContain("v3-dlg-footer")
  })

  it("keeps the other sides", () => {
    render(<Panel side="bottom" />)
    expect(tokens(screen.getByRole("dialog"))).toEqual(expect.arrayContaining(["rounded-t-[16px]", "data-[state=open]:slide-in-from-bottom"]))
    cleanup()
    render(<Panel side="left" />)
    expect(tokens(screen.getByRole("dialog"))).toContain("data-[state=open]:slide-in-from-left")
  })

  it("moves in from 16px over 240ms and out over 180ms", () => {
    const css = readFileSync(resolve(__dirname, "../../app/styles/admin/feedback.css"), "utf8")
    expect(css).toMatch(/\.v3-sheet\[data-side="right"\]\[data-state="open"\]\s*\{\s*animation:\s*fb-sheet-in 240ms/)
    expect(css).toMatch(/\.v3-sheet\[data-side="right"\]\[data-state="closed"\]\s*\{\s*animation:\s*fb-sheet-out 180ms/)
    expect(css).toMatch(/@keyframes fb-sheet-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateX\(16px\)/)
  })
})
