import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inputSizing } from "@/components/ui/input"

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
  it("is 44px on a phone and 36px from md up when the caller gives none, as a field is", () => {
    const c = classesOf(trigger())
    expect(c).toEqual(expect.arrayContaining(["h-11", "md:h-9"]))
    expect(c).not.toContain("h-9")
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

  it("is 36px everywhere when dense with no height of its own", () => {
    const c = classesOf(trigger({ dense: true }))
    expect(c).toContain("h-9")
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
