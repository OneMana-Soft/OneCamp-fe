import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The share dialogs fit a phone: their column may shrink (a grid's auto column
// took the invite row's whole width and cut off the roles and Done), the token
// input takes what is left, and the footer stays put above the safe area.
describe("a share dialog on a phone", () => {
  const parts = readFileSync("components/dialog/shareParts.tsx", "utf8")
  it("fits the board dialog to the screen", () => {
    const dialog = readFileSync("components/dialog/boardShareDialog.tsx", "utf8")
    expect(dialog).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/)
    expect(dialog).toMatch(/<ShareFooter/)
  })
  it("makes the doc dialog the phone's sheet, its buttons in the sheet's foot (B6)", () => {
    const dialog = readFileSync("components/dialog/docShareDialog.tsx", "utf8")
    const sheet = readFileSync("components/docEditor/chrome/Sheet.tsx", "utf8")
    expect(dialog).toMatch(/<ChromeSheet/)
    expect(dialog).toMatch(/footer=\{/)
    expect(sheet).toMatch(/if \(isMobile\)[\s\S]*<Drawer[\s\S]*<DrawerFooter/)
  })
  it("lets the token input shrink and keeps the footer above the safe area", () => {
    expect(parts).toMatch(/min-w-0 flex-1 flex-wrap/)
    expect(parts).toMatch(/sticky bottom-0[^"]*safe-area-inset-bottom/)
  })
})
