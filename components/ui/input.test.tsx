import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Input, inputSizing } from "@/components/ui/input"

/**
 * A caller's height holds from md up, as written, and a standalone field keeps
 * its 44px touch target on a phone. The default used to be `h-11 md:h-9`:
 * tailwind-merge drops h-11 for a caller's h-8 but keeps md:h-9, which is
 * another breakpoint, so 87 fields that asked for 28, 32 or 40px drew 36px on
 * every computer (a task list's filter beside 32px chips, for one).
 *
 * jsdom has no stylesheet, so this reads the classes; e2e/designSystem.spec.ts
 * measures the same class lists in Chromium (44px at 390, 32px at 1280).
 */
afterEach(cleanup)

const classesOf = (el: HTMLElement) => el.className.split(/\s+/)

describe("Input's look (design v3)", () => {
  it("is the raised field at e1 with no border, the field-surface utility", () => {
    render(<Input aria-label="Look" />)
    const c = classesOf(screen.getByRole("textbox", { name: "Look" }))
    expect(c).toContain("field-surface")
    expect(c).toContain("rounded-md")
    expect(c).not.toContain("border")
    expect(c).not.toContain("border-input")
  })
})

describe("Input's height", () => {
  it("is 44px on a phone and 32px from md up when the caller gives none (design v3's field)", () => {
    render(<Input aria-label="Name" />)
    const c = classesOf(screen.getByRole("textbox", { name: "Name" }))
    expect(c).toEqual(expect.arrayContaining(["h-11", "md:h-8"]))
    expect(c).not.toContain("max-md:h-11")
  })

  it("keeps a caller's h-8 from md up, and the 44px touch target below md", () => {
    render(<Input aria-label="Filter" className="h-8 w-40" />)
    const c = classesOf(screen.getByRole("textbox", { name: "Filter" }))
    expect(c).toEqual(expect.arrayContaining(["h-8", "max-md:h-11"]))
    // md:h-9 is what used to win over the caller's h-8 on every computer.
    expect(c).not.toContain("md:h-9")
    expect(c).not.toContain("h-11")
  })

  it("keeps any height the caller writes without a breakpoint", () => {
    for (const h of ["h-7", "h-10", "h-[30px]", "!h-8"]) {
      expect(inputSizing(`w-full ${h} px-2`, false)).toBe("max-md:h-11 pointer-coarse:h-11")
    }
  })

  it("leaves a breakpoint height to merge as before", () => {
    // AuthField writes md:h-10: 44px on a phone, 40 from md up.
    render(<Input aria-label="Email" className="md:h-10" />)
    const c = classesOf(screen.getByRole("textbox", { name: "Email" }))
    expect(c).toEqual(expect.arrayContaining(["h-11", "md:h-10"]))
    expect(c).not.toContain("md:h-9")
    expect(inputSizing("sm:h-8", false)).toBe("h-11 md:h-8 pointer-coarse:h-11")
  })

  // DESIGN-BUILD-3, 21 Oct: held sideways a phone is 844px wide, so its fields
  // were 32px, under a finger's 44. The pointer decides, as for tooltips: a
  // touch screen's fields are 44px at any width, a mouse's keep 32px from md.
  it("is 44px under a finger at any width, a caller's own height too, but not in a dense grid", () => {
    render(
      <>
        <Input aria-label="Name" />
        <Input aria-label="Filter" className="h-8 w-40" />
        <Input dense aria-label="Cell" className="h-7" />
      </>,
    )
    expect(classesOf(screen.getByRole("textbox", { name: "Name" }))).toContain("pointer-coarse:h-11")
    expect(classesOf(screen.getByRole("textbox", { name: "Filter" }))).toContain("pointer-coarse:h-11")
    expect(classesOf(screen.getByRole("textbox", { name: "Cell" }))).not.toContain("pointer-coarse:h-11")
  })

  it("lets a field in a dense grid or a compound control keep its height at every width", () => {
    render(<Input dense aria-label="Cell" className="h-7 text-sm" />)
    const c = classesOf(screen.getByRole("textbox", { name: "Cell" }))
    expect(c).toContain("h-7")
    for (const gone of ["h-11", "max-md:h-11", "md:h-9"]) expect(c).not.toContain(gone)
    expect(inputSizing(undefined, true)).toBe("h-8")
  })

  it("does not pass dense on to the element", () => {
    render(<Input dense aria-label="Cell" />)
    expect(screen.getByRole("textbox", { name: "Cell" }).hasAttribute("dense")).toBe(false)
  })
})
