import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

afterEach(cleanup)

/**
 * A colour theme has to have something to colour. Wave 1 limited the accent to
 * actions, so switching to blue moved the unread badges, one link and a barely
 * visible tint on the active row, and people said the theme picker did
 * nothing. The accent is back on the controls that carry state (switches in
 * switchAccent.test.tsx), still never on headings, icons or decoration.
 */
const CSS = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")

describe("controls that carry state take the accent", () => {
  it("fills a checked box with the accent", () => {
    render(<Checkbox aria-label="Done" defaultChecked />)
    expect(screen.getByRole("checkbox").className).toContain("data-[state=checked]:bg-primary")
  })

  it("marks the picked radio in the accent", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    )
    const radio = screen.getByRole("radio")
    expect(radio.className).toContain("data-[state=checked]:border-primary")
    expect(radio.querySelector("svg")!.getAttribute("class")).toContain("fill-primary")
  })

  it("fills progress with the theme's progress fill, not grey", () => {
    const { container } = render(<Progress value={40} />)
    const indicator = container.firstElementChild!.firstElementChild as HTMLElement
    expect(indicator.className).toContain("bg-progress")
    expect(indicator.className).not.toContain("bg-muted-foreground")
    expect(CSS).toMatch(/@utility bg-progress \{\s*background-image: linear-gradient\(90deg, var\(--progress-from\), var\(--progress-to\)\);/)
  })

  it("gives native checkboxes and radios the theme's accent, on body where the theme is", () => {
    const body = CSS.slice(CSS.indexOf("\nbody {"), CSS.indexOf("\n}", CSS.indexOf("\nbody {")))
    expect(body).toMatch(/accent-color:\s*var\(--brand\);/)
    // On :root it resolved against the house accent and never saw the theme.
    expect(CSS).not.toMatch(/:root \{\s*accent-color/)
  })

  it("tints selected text with the theme's accent under the text's own ink", () => {
    const body = CSS.slice(CSS.indexOf("\nbody {"), CSS.indexOf("\n}", CSS.indexOf("\nbody {")))
    expect(body).toMatch(/--selection:\s*color-mix\(in oklab, var\(--brand\) 26%, var\(--background\)\);/)
    expect(body).toMatch(/--selection-foreground:\s*var\(--foreground\);/)
  })
})

describe("the current place in the navigation", () => {
  const rule = (selector: string) => {
    const at = CSS.indexOf(`${selector} {`)
    return CSS.slice(at, CSS.indexOf("}", at))
  }

  it("is a step of the accent on the wash, with a 2px accent bar at the start edge", () => {
    expect(rule(".nav-active")).toMatch(/background:\s*color-mix\(in oklab, var\(--brand\) 12%, var\(--brand-muted\)\);/)
    const bar = rule(".nav-active::before")
    expect(bar).toMatch(/inset-inline-start:\s*0;/)
    expect(bar).toMatch(/width:\s*2px;/)
    expect(bar).toMatch(/background:\s*var\(--brand\);/)
  })

  it("is the same for a Button in the sidebar", () => {
    const button = readFileSync(join(__dirname, "button.tsx"), "utf8")
    expect(button).toMatch(/sidebarActive:\s*"nav-active"/)
  })
})
