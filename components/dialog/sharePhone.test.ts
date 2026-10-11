import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The share dialogs fit a phone: their column may shrink (a grid's auto column
// took the invite row's whole width and cut off the roles and Done), the token
// input takes what is left, and the footer stays put above the safe area.
describe("a share dialog on a phone", () => {
  const parts = readFileSync("components/dialog/shareParts.tsx", "utf8")
  for (const kind of ["doc", "board"]) {
    it(`fits the ${kind} dialog to the screen`, () => {
      const dialog = readFileSync(`components/dialog/${kind}ShareDialog.tsx`, "utf8")
      expect(dialog).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/)
      expect(dialog).toMatch(/<ShareFooter/)
    })
  }
  it("lets the token input shrink and keeps the footer above the safe area", () => {
    expect(parts).toMatch(/min-w-0 flex-1 flex-wrap/)
    expect(parts).toMatch(/sticky bottom-0[^"]*safe-area-inset-bottom/)
  })
})
