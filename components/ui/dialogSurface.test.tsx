import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

afterEach(cleanup)

/**
 * The dialog's material (design v3, admin §8 H2). A dialog is the top of the
 * elevation ladder: --pop at e4, r16, and no border, because the ring in e4
 * already draws its edge and a grey line on top of it was the wireframe look.
 * Its footer is a strip on --sunken, so the actions read as the dialog's
 * floor. The overlay dims and never blurs: backdrop blur is on the Never list
 * and repaints the whole app under it on every frame the dialog moves.
 */
function Rename(props: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  return (
    <Dialog open>
      <DialogContent {...props}>
        <DialogHeader>
          <DialogTitle>Rename the project?</DialogTitle>
          <DialogDescription>Everyone sees the new name.</DialogDescription>
        </DialogHeader>
        <DialogFooter tertiary={<Button variant="ghost">Learn more</Button>}>
          <Button variant="ghost">Cancel</Button>
          <Button>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const tokens = (el: Element) => el.className.split(/\s+/)

describe("dialog surface", () => {
  it("is --pop at e4 with the 16px radius and no border", () => {
    render(<Rename />)
    const dialog = screen.getByRole("dialog")
    expect(tokens(dialog)).toEqual(expect.arrayContaining(["bg-pop", "shadow-e4", "rounded-[16px]"]))
    expect(tokens(dialog)).not.toContain("border")
    expect(tokens(dialog)).not.toContain("rounded-2xl")
  })

  it("takes a size, md by default, and lets a caller's width win", () => {
    render(<Rename />)
    expect(screen.getByRole("dialog").className).toMatch(/max-w-\[520px\]/)
    cleanup()
    render(<Rename size="sm" />)
    expect(screen.getByRole("dialog").className).toMatch(/max-w-\[400px\]/)
    cleanup()
    render(<Rename size="xl" className="max-w-xl" />)
    expect(tokens(screen.getByRole("dialog"))).toContain("max-w-xl")
    expect(screen.getByRole("dialog").className).not.toMatch(/max-w-\[860px\]/)
  })

  it("sets the title at title-3, even beside a colour a caller passes", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle className="text-foreground">Invite people</DialogTitle>
          <DialogDescription>They get an email.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    expect(tokens(screen.getByRole("heading", { name: "Invite people" }))).toContain("text-title-3")
  })

  it("puts the actions on a sunken footer strip, with the tertiary slot on the left", () => {
    render(<Rename />)
    const footer = screen.getByRole("button", { name: "Rename" }).parentElement!
    expect(footer).toHaveAttribute("data-dialog-footer")
    expect(tokens(footer)).toContain("v3-dlg-footer")
    expect(screen.getByRole("button", { name: "Learn more" }).parentElement!.className).toMatch(/sm:mr-auto/)
    const css = readFileSync(resolve(__dirname, "../../app/styles/admin/feedback.css"), "utf8")
    const rule = css.slice(css.indexOf("> .v3-dlg-footer,"), css.indexOf("}", css.indexOf("> .v3-dlg-footer,")))
    expect(rule).toMatch(/background:\s*var\(--sunken\)/)
    expect(rule).toMatch(/min-height:\s*60px/)
  })

  it("closes from a 28px ghost button", () => {
    render(<Rename />)
    expect(tokens(screen.getByRole("button", { name: "Close" }))).toEqual(expect.arrayContaining(["h-7", "w-7"]))
  })

  it("dims without a blur, in both the dialog and the confirm", () => {
    for (const file of ["dialog.tsx", "alert-dialog.tsx", "sheet.tsx"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8")
      expect(src, file).not.toMatch(/backdrop-blur/)
      expect(src, file).toMatch(/v3-overlay/)
    }
    const css = readFileSync(resolve(__dirname, "../../app/styles/admin/feedback.css"), "utf8")
    expect(css).not.toMatch(/backdrop-filter/)
    expect(css).toMatch(/\.v3-overlay\s*\{\s*background:\s*rgb\(11 12 14 \/ 0\.32\)/)
    expect(css).toMatch(/\.dark \.v3-overlay\s*\{\s*background:\s*rgb\(0 0 0 \/ 0\.6\)/)
  })
})

describe("the dialog's optional tile", () => {
  it("draws its glyph in a 36px r10 tile", async () => {
    const { DialogTile } = await import("@/components/ui/dialog")
    render(<DialogTile tone="danger"><svg data-glyph="" /></DialogTile>)
    const tile = document.querySelector("[data-dialog-tile]")!
    expect(tile.querySelector("[data-glyph]")).not.toBeNull()
    expect(tile.className).toMatch(/\bsize-9\b/)
    expect(tile.className).toMatch(/rounded-\[10px\]/)
  })
})
