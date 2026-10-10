import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Forward's optional note folds its formatting behind one button, as every
// message box does; the dialog showed all thirteen formatting icons.
describe("the forward dialog's note", () => {
  it("folds its formatting", () => {
    const src = readFileSync(join(__dirname, "forwardMessage.tsx"), "utf8")
    expect(src).toMatch(/editable=\{true\}[\s\S]{0,200}toggleToolbar/)
  })
})
