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
  // INTERACTION_SPEC D13 (15 Oct 2026): "on" is the theme accent on every
  // control that carries it, from one token. A settings page drew green
  // ticks beside orange switches; green reads as success, not on. (A task's
  // done check is the status glyph's moss, a status, not a control's on.)
  it("fills a checked box with the accent, from the switch's and the radio's token, and springs it back from a press", () => {
    render(<Checkbox aria-label="Email me" defaultChecked />)
    const cls = screen.getByRole("checkbox").className
    expect(cls).toContain("data-[state=checked]:bg-primary")
    expect(cls).toContain("data-[state=checked]:text-primary-foreground")
    expect(cls).not.toMatch(/moss/)
    const sw = readFileSync(join(__dirname, "switch.tsx"), "utf8")
    expect(sw).toContain("data-[state=checked]:bg-primary")
    expect(cls).toContain("rounded-[5px]")
    expect(cls).toContain("transition-spring")
    expect(cls).toContain("active:scale-[0.88]")
  })

  it("marks the picked radio in the accent", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    )
    const radio = screen.getByRole("radio")
    // An inset ring, as Checkbox's edge, turned the accent when picked.
    expect(radio.className).toContain("data-[state=checked]:ring-primary")
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
    expect(body).toMatch(/--selection:\s*color-mix\(in oklab, var\(--brand\) 22%, var\(--background\)\);/)
    expect(body).toMatch(/--selection-foreground:\s*var\(--foreground\);/)
  })
})

describe("the current place in the navigation", () => {
  const rule = (selector: string) => {
    const at = CSS.indexOf(`${selector} {`)
    return CSS.slice(at, CSS.indexOf("}", at))
  }

  // Design v3 (§2a): the peach fill and its orange bar are retired. The
  // current place is a raised chip at e-sel, its label ink and its icon in
  // the accent. Its weight stays (INTERACTION_SPEC D8): the label fills the
  // row, so a heavier one only moved the ellipsis.
  it("is a raised chip at e-sel, with ink and the icon in the accent, one weight, and no bar", () => {
    const chip = rule(".nav-active")
    expect(chip).toMatch(/background:\s*var\(--raised\);/)
    expect(chip).toMatch(/box-shadow:\s*var\(--e-sel\);/)
    expect(chip).toMatch(/color:\s*var\(--ink\);/)
    expect(chip).not.toMatch(/font-weight/)
    // The row's own icon; an identity mark inside keeps its colours (D13, app/identityHue.test.ts),
    // as do a Docs & Files node's mark and a chosen row's check (docs F1b).
    expect(rule(".nav-active svg.lucide:not(:is([data-project-tile], [data-channel-tile], [data-node-mark], [data-tree-check]) *, [data-doc-icon])")).toMatch(/color:\s*var\(--brand\);/)
    expect(CSS).not.toMatch(/\.nav-active::before/)
  })

  it("is the same for a Button in the sidebar", () => {
    const button = readFileSync(join(__dirname, "button.tsx"), "utf8")
    expect(button).toMatch(/sidebarActive:\s*"nav-active"/)
  })
})
