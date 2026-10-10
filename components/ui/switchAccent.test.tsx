import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Switch } from "@/components/ui/switch"

afterEach(cleanup)

// On is the accent, the chosen theme, as a checked box is. Wave 1 made it ink,
// which left a colour theme nothing to colour: switching to blue changed the
// unread badges and one link, and people said the picker did nothing. The
// accent is 4.5:1 or more on the page in every theme, and the thumb takes the
// accent's label colour (paletteContrast.test.ts holds both). Off stays text-3,
// the 3:1 floor for a control.
describe("Switch", () => {
  it("fills with the accent when on", () => {
    render(<Switch aria-label="Email me" defaultChecked />)
    const track = screen.getByRole("switch", { name: "Email me" })
    expect(track.className).toContain("data-[state=checked]:bg-primary")
    expect(track.className).not.toContain("data-[state=checked]:bg-foreground")
    const thumb = track.firstElementChild as HTMLElement
    expect(thumb.className).toContain("data-[state=checked]:bg-primary-foreground")
  })

  it("keeps the off track at text-3", () => {
    render(<Switch aria-label="Email me" />)
    expect(screen.getByRole("switch").className).toContain("data-[state=unchecked]:bg-faint-foreground")
  })
})
