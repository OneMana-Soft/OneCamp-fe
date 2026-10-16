import { readFileSync } from "node:fs"
import { join } from "node:path"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

// QA SH-04 (14 Oct 2026): on a phone, switches were 28x16, icon buttons 24 to
// 32 and small buttons 28 tall. One rule gives every base control a 44px
// target under a finger (app/phone.css F3), drawn by a ::before, so nothing
// changes size and a mouse sees nothing.

const CSS = readFileSync(join(__dirname, "../../app/phone.css"), "utf8")

/** The body of the rule whose selector is exactly `selector` (whitespace ignored). */
function ruleBody(selector: string): string | undefined {
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(CSS))) if (m[1].replace(/\s+/g, " ").trim() === selector) return m[2]
  return undefined
}

describe("the touch target rule (app/phone.css F3)", () => {
  it("reaches out to 44px from the control's centre, never shrinking a bigger one", () => {
    const body = ruleBody(":is([data-touch-target], .shell-icon-btn)::before")
    expect(body).toBeDefined()
    expect(body).toMatch(/content: "";/)
    expect(body).toMatch(/position: absolute;/)
    expect(body).toMatch(/inset: min\(0px, calc\(\(100% - var\(--m-hit\)\) \/ 2\)\);/)
  })

  it("is for touch screens only", () => {
    const at = CSS.indexOf(":is([data-touch-target], .shell-icon-btn)::before")
    const media = CSS.lastIndexOf("@media", at)
    expect(CSS.slice(media, CSS.indexOf("{", media))).toMatch(/\(pointer: coarse\)/)
  })

  it("positions the control only in the components layer, so an absolute, fixed or sticky control keeps its place", () => {
    const at = CSS.indexOf(":is([data-touch-target], .shell-icon-btn) {")
    expect(at).toBeGreaterThan(-1)
    const before = CSS.slice(0, at)
    // The last layer opened before the rule is the components layer, and it is still open.
    const layer = before.lastIndexOf("@layer components {")
    expect(layer).toBeGreaterThan(-1)
    const opened = (before.slice(layer).match(/\{/g) ?? []).length
    const closed = (before.slice(layer).match(/\}/g) ?? []).length
    expect(opened).toBeGreaterThan(closed)
    expect(ruleBody(":is([data-touch-target], .shell-icon-btn)")).toMatch(/position: relative;/)
  })

  it("makes a menu item 44px tall instead: items stack edge to edge", () => {
    expect(ruleBody(':is([role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"])')).toMatch(/min-height: var\(--m-hit\);/)
  })
})

describe("the base controls carry it", () => {
  it("every button, whatever its size", () => {
    for (const size of ["default", "xs", "sm", "lg", "icon", "icon-sm", "icon-xs"] as const) {
      const { getByRole, unmount } = render(<Button size={size}>Go</Button>)
      expect(getByRole("button").hasAttribute("data-touch-target"), size).toBe(true)
      unmount()
    }
  })

  it("a button made into a link keeps it", () => {
    const { getByRole } = render(
      <Button asChild size="sm">
        <a href="/app/home">Go home</a>
      </Button>,
    )
    expect(getByRole("link").hasAttribute("data-touch-target")).toBe(true)
  })

  it("a switch, a checkbox and a radio", () => {
    const { getByRole } = render(
      <>
        <Switch aria-label="Email" />
        <Checkbox aria-label="Done" />
        <RadioGroup aria-label="Size">
          <RadioGroupItem value="s" aria-label="Small" />
        </RadioGroup>
      </>,
    )
    expect(getByRole("switch").hasAttribute("data-touch-target")).toBe(true)
    expect(getByRole("checkbox").hasAttribute("data-touch-target")).toBe(true)
    expect(getByRole("radio").hasAttribute("data-touch-target")).toBe(true)
  })

  it("a toggle, a toggle group's item, a segment and a tab", () => {
    const { getByRole, getAllByRole } = render(
      <>
        <Toggle aria-label="Bold">B</Toggle>
        <ToggleGroup type="single" aria-label="View">
          <ToggleGroupItem value="list">List</ToggleGroupItem>
        </ToggleGroup>
        <SegmentedControl aria-label="Theme" value="light" onValueChange={() => {}} options={[{ value: "light", label: "Light" }]} />
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    )
    expect(getByRole("button", { name: "Bold" }).hasAttribute("data-touch-target")).toBe(true)
    expect(getByRole("radio", { name: "List" }).hasAttribute("data-touch-target")).toBe(true)
    expect(getByRole("radio", { name: "Light" }).hasAttribute("data-touch-target")).toBe(true)
    expect(getAllByRole("tab")[0].hasAttribute("data-touch-target")).toBe(true)
  })
})
