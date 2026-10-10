import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

afterEach(cleanup)

const pointer = (fine: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("fine") ? fine : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))

function Rename({ onOpenAutoFocus }: { onOpenAutoFocus?: (e: Event) => void }) {
  return (
    <Dialog open>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <DialogTitle>Rename</DialogTitle>
        <DialogDescription>Pick a name.</DialogDescription>
        <Button>Save name</Button>
        <Input aria-label="Name" />
      </DialogContent>
    </Dialog>
  )
}

describe("Dialog initial focus", () => {
  beforeEach(() => vi.unstubAllGlobals())

  it("lands on the first field, not the button before it, with a mouse or trackpad", () => {
    pointer(true)
    render(<Rename />)
    expect(document.activeElement).toBe(screen.getByLabelText("Name"))
  })

  it("leaves Radix's default alone on a touch screen, so no keyboard pops up", () => {
    pointer(false)
    render(<Rename />)
    expect(document.activeElement).not.toBe(screen.getByLabelText("Name"))
  })

  it("lets a caller's onOpenAutoFocus decide", () => {
    pointer(true)
    render(<Rename onOpenAutoFocus={(e) => e.preventDefault()} />)
    expect(document.activeElement).not.toBe(screen.getByLabelText("Name"))
  })
})

describe("focus on filled buttons", () => {
  it("is a thin outline standing off the fill, not a ring pressed against it", () => {
    for (const variant of ["default", "destructive"] as const) {
      const cls = buttonVariants({ variant })
      expect(cls).toContain("focus-visible:outline-offset-2")
      expect(cls).toContain("focus-visible:outline-[1.5px]")
      expect(cls).toContain("focus-visible:ring-0")
    }
    // Unfilled buttons keep the ring; it reads on their own ground.
    expect(buttonVariants({ variant: "outline" })).not.toContain("focus-visible:ring-0")
  })
})
