import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { OptionChip } from "./optionChip"

afterEach(cleanup)

const glyph = () => document.querySelector("[data-status-glyph]")?.innerHTML

// A status option's chip leads with its group's glyph. A column with tinted
// chips puts that glyph on its hue's tint, where the hue's strong cut falls
// short of a mark's 3:1 (the sun read 2.44:1 on a calendar block's tint): there
// it draws in the hue's ink step.
describe("a status option's chip", () => {
  it("draws its glyph in its hue's ink on a tinted chip", () => {
    render(<OptionChip label="Building" group="doing" tinted />)
    expect(glyph()).toMatch(/fill="var\(--camp-sun-ink\)"/)
  })

  it("draws it in the strong cut on a neutral chip", () => {
    render(<OptionChip label="Building" group="doing" />)
    expect(glyph()).toMatch(/fill="var\(--camp-sun\)"/)
  })
})
