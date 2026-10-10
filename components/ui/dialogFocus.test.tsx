import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

afterEach(cleanup)

// jsdom lays nothing out, so no element has a box. A stand-in for layout: an
// element has boxes unless it, or something around it, is display: none
// (Tailwind's "hidden").
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest(".hidden") ? [] : [{}]) as unknown as DOMRectList
  })
})
afterEach(() => vi.restoreAllMocks())

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

  it("passes over a hidden photo input to the first field, as the profile dialog has", () => {
    pointer(true)
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Saved together.</DialogDescription>
          <Input type="file" className="hidden" aria-label="Photo" />
          <Button>Change photo</Button>
          <Input aria-label="Display name" />
        </DialogContent>
      </Dialog>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText("Display name"))
  })

  it("passes over a field that is hidden or disabled by its fieldset, and one that is picked rather than typed", () => {
    pointer(true)
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Filter</DialogTitle>
          <DialogDescription>Narrow the list.</DialogDescription>
          <div className="hidden">
            <Input aria-label="Search" />
          </div>
          <fieldset disabled>
            <Input aria-label="Locked" />
          </fieldset>
          <input type="range" aria-label="Volume" />
          <input type="color" aria-label="Colour" />
          <Input aria-label="Name" />
        </DialogContent>
      </Dialog>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText("Name"))
  })

  it("leaves Radix's default in place when the field does not take the focus", () => {
    pointer(true)
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Pick a name.</DialogDescription>
          <Button>Save name</Button>
          <Input
            aria-label="Name"
            ref={(el) => {
              // A field that refuses focus, as one in a closed section would.
              if (el) el.focus = () => {}
            }}
          />
        </DialogContent>
      </Dialog>,
    )
    // Radix's default: the first tabbable element, inside the dialog.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save name" }))
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
