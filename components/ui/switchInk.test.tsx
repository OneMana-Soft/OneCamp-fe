import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Switch } from "@/components/ui/switch"

afterEach(cleanup)

// On is ink, not the brand accent (a settings page of switches was an orange
// column), and the thumb takes the page colour on it so it stays visible in
// both themes. Ink on the page is held to at least 4.5:1 by
// paletteContrast.test.ts (about 17:1 in both themes); off (text-3) is the
// 3:1 floor.
describe("Switch", () => {
  it("fills with ink when on, never the accent", () => {
    render(<Switch aria-label="Email me" defaultChecked />)
    const track = screen.getByRole("switch", { name: "Email me" })
    expect(track.className).toContain("data-[state=checked]:bg-foreground")
    expect(track.className).not.toContain("bg-primary")
    const thumb = track.firstElementChild as HTMLElement
    expect(thumb.className).toContain("data-[state=checked]:bg-background")
  })

  it("keeps the off track at text-3", () => {
    render(<Switch aria-label="Email me" />)
    expect(screen.getByRole("switch").className).toContain("data-[state=unchecked]:bg-faint-foreground")
  })
})
