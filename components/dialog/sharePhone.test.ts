import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The share dialogs fit a phone: their column may shrink (a grid's auto column
// took the invite row's whole width and cut off the roles and Done), the token
// input takes what is left, and the footer is the sheet's foot.
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
    expect(sheet).toMatch(/if \(sheet\)[\s\S]*<Drawer[\s\S]*footer=\{[\s\S]*<OverlayBody/)
  })
  it("lets the token input shrink", () => {
    expect(parts).toMatch(/min-w-0 flex-1 flex-wrap/)
  })
  // Its footer is the sheet's foot on a phone, on the one rule for every phone
  // sheet's footer (V-73, app/overlay.css 8b): the dialog's gutter, never under
  // 16px, or the home-indicator strip where that is more. It padded a foot of
  // its own (12px, or the strip) over the dialog's bottom padding.
  it("stands the footer on the sheet's one foot, with no foot of its own", () => {
    const at = parts.indexOf("export function ShareFooter")
    const footer = parts.slice(at, parts.indexOf("\n}\n", at))
    expect(footer).toMatch(/<div data-sheet-footer="" className=\{cn\("sticky bottom-0 /)
    expect(footer).not.toMatch(/\bpb-|safe-area-inset-bottom/)
    const SHEET = `.v3-dialog[role="dialog"][data-v3-sheet]`
    const overlay = readFileSync("app/overlay.css", "utf8")
    expect(overlay).toContain(`\n  ${SHEET} > [data-sheet-footer],\n  .v3-confirm-sheet [data-sheet-footer] {\n    padding-bottom: max(16px,`)
    // It bleeds through the sheet's bottom padding to stand at its foot, as DialogFooter does.
    const phone = readFileSync("app/phone.css", "utf8")
    expect(phone).toContain(`:is(${SHEET} > .v3-dlg-footer, ${SHEET} > form > .v3-dlg-footer, ${SHEET} > [data-sheet-footer]) {\n  bottom: calc(var(--dlg-pad-bottom) * -1);`)
    for (const dialog of ["components/dialog/boardShareDialog.tsx", "components/calendar/sharing/shareCalendarDialog.tsx", "components/table/ShareTableDialog.tsx"]) {
      // Straight in the dialog, after its body: the rule's `>` reaches it there.
      expect(readFileSync(dialog, "utf8"), dialog).toMatch(/<ShareFooter [^>]*\/>\s*<\/DialogContent>/)
    }
  })
})
