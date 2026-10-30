import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Search } from "@/lib/icons"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group"
import { SearchInput } from "./search-input"

afterEach(cleanup)

const classes = (el: Element) => el.className.split(/\s+/)

// shadcn/ui's Input Group on design v3's field: 23 search boxes placed their
// glyph by hand (left-2.5, left-3, left-3.5, left-5) and padded the text past
// it, each with its own height and halo.
describe("an input group", () => {
  const group = (props: Partial<React.ComponentProps<typeof InputGroup>> = {}, invalid = false, disabled = false) =>
    render(
      <InputGroup {...props}>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput aria-label="Find" aria-invalid={invalid || undefined} disabled={disabled} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Clear">×</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>,
    )

  it("is one field: the group wears the surface, its halo and its danger halo, and the control none of its own", () => {
    group()
    const box = screen.getByRole("group")
    const control = screen.getByRole("textbox", { name: "Find" })
    expect(classes(box)).toContain("field-surface")
    // The field's states are field-surface's (app/globals.css), the group's
    // with them, so no shadow is drawn by hand (shadowTokens.test.ts).
    expect(box.className).not.toMatch(/shadow-\[/)
    expect(control.getAttribute("data-slot")).toBe("input-group-control")
    expect(classes(control)).not.toContain("field-surface")
    expect(classes(control)).toEqual(expect.arrayContaining(["bg-transparent", "text-base", "md:text-sm"]))
    // A text box's own width (its size, 20 characters) is its least: in a
    // box that grows to what it holds (a scroll area's table) the group was
    // 300px and ran the phone's AI sheet 12px sideways at 360 (b18j). At 100%
    // it gives way.
    expect(classes(control)).toContain("w-full")
  })

  // The group draws the field's states from what it carries, never a :has()
  // (app/selectorKeyGuard.test.ts): its halo by :focus-within, danger and
  // sunken by these marks (e2e/inputGroupStates.spec.ts reads the look).
  it("carries its text's invalid and disabled as data-invalid and data-disabled, and only while its text does", () => {
    group({}, true, true)
    const box = screen.getByRole("group")
    expect(box.hasAttribute("data-invalid")).toBe(true)
    expect(box.hasAttribute("data-disabled")).toBe(true)
    cleanup()
    group()
    const calm = screen.getByRole("group")
    expect(calm.hasAttribute("data-invalid")).toBe(false)
    expect(calm.hasAttribute("data-disabled")).toBe(false)
  })

  it("reads aria-invalid as the field does: true or \"true\", not \"false\" or a spelling mark", () => {
    for (const [value, invalid] of [[true, true], ["true", true], [false, false], ["false", false], ["spelling", false]] as const) {
      render(
        <InputGroup>
          <InputGroupInput aria-label="Branch name" aria-invalid={value} />
        </InputGroup>,
      )
      expect(screen.getByRole("group").hasAttribute("data-invalid"), String(value)).toBe(invalid)
      cleanup()
    }
  })

  it("takes them from the search field's text (GitHubIntegrationCard and OwnerControl disable it)", () => {
    render(<SearchInput value="" onValueChange={() => {}} placeholder="Search people…" disabled aria-invalid />)
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveProperty("disabled", true)
    const box = screen.getByRole("group")
    expect(box.hasAttribute("data-disabled")).toBe(true)
    expect(box.hasAttribute("data-invalid")).toBe(true)
  })

  it("is a field's height: 44px on a phone, 32px from md up, the caller's when dense", () => {
    group()
    expect(classes(screen.getByRole("group"))).toEqual(expect.arrayContaining(["h-11", "md:h-8"]))
    cleanup()
    group({ dense: true, className: "h-7" })
    const dense = classes(screen.getByRole("group"))
    expect(dense).toContain("h-7")
    expect(dense).not.toContain("h-11")
  })

  it("puts the caret in the control when an addon is pressed, and leaves a button's press to it", () => {
    group()
    const control = screen.getByRole("textbox", { name: "Find" })
    fireEvent.mouseDown(screen.getByRole("group").querySelector("[data-slot=input-group-addon] svg")!)
    expect(document.activeElement).toBe(control)
    control.blur()
    const button = screen.getByRole("button", { name: "Clear" })
    expect(fireEvent.mouseDown(button)).toBe(true)
    expect(document.activeElement).not.toBe(control)
  })

  it("gives a button in it a finger's 44px target", () => {
    group()
    const button = screen.getByRole("button", { name: "Clear" })
    expect(button.hasAttribute("data-touch-target")).toBe(true)
    expect(button.getAttribute("type")).toBe("button")
  })
})
