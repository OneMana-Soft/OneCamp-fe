import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

afterEach(cleanup)

// INTERACTION_SPEC §4, a menu item: "checked: a check glyph, no tint at rest".
// One check for every list that turns something on: a command row, a menu's
// checkbox row and a select's chosen option draw the same mark.

const glyph = (el: HTMLElement) => el.querySelector("[data-menu-check]")

describe("a command row that turns something on", () => {
  function list(checked: boolean | "indeterminate" | undefined) {
    render(
      <Command>
        <CommandList>
          <CommandGroup>
            <CommandItem value="moss" checked={checked}>
              Moss
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    )
    return screen.getByRole("option", { name: "Moss" })
  }

  it("is checked, with a check and aria-checked", () => {
    const row = list(true)
    expect(row.getAttribute("aria-checked")).toBe("true")
    expect(row.getAttribute("data-state")).toBe("checked")
    expect(glyph(row)?.getAttribute("data-menu-check")).toBe("on")
    expect(glyph(row)?.querySelector("svg.lucide-check")).not.toBeNull()
  })

  it("is some, with a dash and aria-checked mixed", () => {
    const row = list("indeterminate")
    expect(row.getAttribute("aria-checked")).toBe("mixed")
    expect(row.getAttribute("data-state")).toBe("indeterminate")
    expect(glyph(row)?.querySelector("svg.lucide-minus")).not.toBeNull()
  })

  it("is off with an empty slot, so its words line up with the checked rows", () => {
    const row = list(false)
    expect(row.getAttribute("aria-checked")).toBe("false")
    expect(glyph(row)?.getAttribute("data-menu-check")).toBe("off")
    expect(glyph(row)?.querySelector("svg")).toBeNull()
  })

  it("leaves a plain row alone: no check, no aria-checked; the highlight stays cmdk's data-selected", () => {
    const row = list(undefined)
    expect(row.hasAttribute("aria-checked")).toBe(false)
    expect(glyph(row)).toBeNull()
  })
})

describe("the same check elsewhere", () => {
  it("draws a menu's checkbox row", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Show done</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked="indeterminate">Some projects</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(glyph(screen.getByRole("menuitemcheckbox", { name: "Show done" }))?.getAttribute("data-menu-check")).toBe("on")
    expect(glyph(screen.getByRole("menuitemcheckbox", { name: "Some projects" }))?.getAttribute("data-menu-check")).toBe("some")
  })

  it("draws a select's chosen option", () => {
    render(
      <Select open value="b" onValueChange={() => {}}>
        <SelectTrigger aria-label="Pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(glyph(screen.getByRole("option", { name: "Beta" }))?.getAttribute("data-menu-check")).toBe("on")
    expect(glyph(screen.getByRole("option", { name: "Alpha" }))).toBeNull()
  })
})
