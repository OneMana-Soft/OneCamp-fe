import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The palette's keys are taught, not hidden (design v3, shell P1): the
// footer names how to move, open, open beside and close, each as a key chip;
// the mode switch carries Tab; and there is no close button over the field's
// end, where the old shortcut chip and the X once overlapped. Read from the
// source so a change to any is caught.

const palette = readFileSync(join(process.cwd(), "components/ui/CommandPalette.tsx"), "utf8")

describe("the command palette's key hints", () => {
  it("has a footer naming each key as a chip", () => {
    for (const hint of ["move", "open", "open beside", "close", "back to search", "continue in the AI panel"]) {
      expect(palette, hint).toContain(`</kbd> ${hint}`)
    }
  })

  it("shows Tab on the Ask segment", () => {
    expect(palette).toMatch(/Ask \{!isPhone && <kbd className="kbd">Tab<\/kbd>\}/)
  })

  it("draws no close button: Esc and the scrim close it", () => {
    expect(palette).not.toMatch(/DialogPrimitive\.Close|DialogClose/)
    expect(palette).not.toMatch(/from "@\/components\/ui\/dialog"/)
  })
})
