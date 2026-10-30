import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inputSizing } from "@/components/ui/input"
import { Field } from "@/components/ui/field"

/**
 * A select's trigger takes its height from the rule a text field uses
 * (inputSizing), so the two can't drift: it was h-9 at every width, 36px on a
 * phone beside a 44px field and under the touch target.
 *
 * jsdom has no stylesheet, so this reads the class lists;
 * e2e/designSystem.spec.ts measures them in Chromium.
 */
afterEach(cleanup)

const trigger = (props: { className?: string; dense?: boolean } = {}) => {
  render(
    <Select value="a">
      <SelectTrigger aria-label="Kind" {...props}>
        <SelectValue />
      </SelectTrigger>
    </Select>,
  )
  return screen.getByRole("combobox", { name: "Kind" })
}
const classesOf = (el: HTMLElement) => el.className.split(/\s+/)

describe("a select's height", () => {
  it("is 44px on a phone and 32px from md up when the caller gives none, as a field is", () => {
    const c = classesOf(trigger())
    expect(c).toEqual(expect.arrayContaining(["h-11", "md:h-8", "field-surface"]))
    expect(c).not.toContain("h-8")
  })

  it("keeps a caller's h-8 from md up, and the 44px touch target below md", () => {
    const c = classesOf(trigger({ className: "h-8 w-40" }))
    expect(c).toEqual(expect.arrayContaining(["h-8", "max-md:h-11"]))
    expect(c).not.toContain("md:h-9")
    expect(c).not.toContain("h-11")
  })

  it("keeps a dense caller's height at every width, with no phone floor", () => {
    const c = classesOf(trigger({ className: "h-8 w-[70px]", dense: true }))
    expect(c).toContain("h-8")
    for (const gone of ["h-11", "max-md:h-11", "md:h-9"]) expect(c).not.toContain(gone)
  })

  it("is 32px everywhere when dense with no height of its own", () => {
    const c = classesOf(trigger({ dense: true }))
    expect(c).toContain("h-8")
    expect(c).not.toContain("h-11")
  })

  it("uses the field's own rule, so a field and a select can't drift", () => {
    for (const [cls, dense] of [[undefined, false], ["h-8", false], ["h-8", true], [undefined, true]] as const) {
      const c = classesOf(trigger({ className: cls, dense }))
      for (const k of inputSizing(cls, dense).split(" ").filter(Boolean)) expect(c).toContain(k)
      cleanup()
    }
  })

  it("does not pass dense on to the element", () => {
    expect(trigger({ dense: true }).hasAttribute("dense")).toBe(false)
  })
})

describe("a select in a Field", () => {
  // DESIGN-BUILD-14's M1 (24 Oct 2026): Field gives its one child its id and aria props, and a Select's root draws
  // no element, so the label never named the trigger, and the help and the error never described it.
  it("names its trigger with the field's label, and the field's help and error describe it", () => {
    render(
      <Field label="Country" help="Its public holidays." error="Choose a country.">
        <Select value="">
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
        </Select>
      </Field>,
    )
    const trigger = screen.getByRole("combobox", { name: "Country" })
    const described = trigger.getAttribute("aria-describedby")?.split(" ").map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual(["Its public holidays.", "Choose a country."])
    expect(trigger.getAttribute("aria-invalid")).toBe("true")
  })
})

describe("a select's text", () => {
  // Beside a field on a phone its value read 14px against the field's 16px.
  it("is a field's size: 16px on a phone and 14px from md up, dense or not", () => {
    for (const dense of [false, true]) {
      const c = classesOf(trigger({ dense }))
      expect(c).toEqual(expect.arrayContaining(["text-base", "md:text-sm"]))
      expect(c).not.toContain("text-sm")
      cleanup()
    }
  })
})
