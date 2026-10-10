import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The share dialogs fit a phone: their column may shrink (a grid's auto column
// took the invite row's whole width, 429px in a 358px dialog, and cut off the
// roles and Done), and the invite row's picker takes what is left.
describe("a share dialog on a phone", () => {
  for (const kind of ["doc", "board"]) {
    it(`fits the ${kind} dialog to the screen`, () => {
      const dialog = readFileSync(`components/dialog/${kind}ShareDialog.tsx`, "utf8")
      const picker = readFileSync(`components/combobox/add${kind[0].toUpperCase()}${kind.slice(1)}MemberCombobox.tsx`, "utf8")
      expect(dialog).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/)
      expect(picker).toMatch(/min-w-0 flex-1 justify-between/)
      expect(picker).not.toMatch(/w-\[180px\]/)
    })
  }
})
