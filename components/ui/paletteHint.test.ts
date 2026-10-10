import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The palette's shortcut chip sat under the dialog's close button: the chip
// ends the input row, and the button is drawn over the dialog's top-right
// corner, so "Ctrl K" and the X overlapped. The row's end (its padding, which
// CommandDialog widens on the right for the whole row, chip or no chip) and
// any margin on the chip clear the button, read from the files that set them
// so a change to any is caught.

const px = (cls: string, prefix: string) => {
  const m = new RegExp(`\\b${prefix}-(\\d+(?:\\.5)?)\\b`).exec(cls)
  return m ? Number(m[1]) * 4 : 0
}

describe("the command palette's shortcut chip", () => {
  it("ends clear of the dialog's close button", () => {
    const dialog = readFileSync(join(process.cwd(), "components/ui/dialog.tsx"), "utf8")
    const close = /<DialogPrimitive\.Close[\s\S]*?className=\{cn\(\s*"([^"]+)"/.exec(dialog)?.[1] ?? ""
    const buttonReach = px(close, "right") + px(close, "w") // from the dialog's right edge
    const palette = readFileSync(join(process.cwd(), "components/ui/CommandPalette.tsx"), "utf8")
    const chip = /<kbd className="([^"]+)" aria-label=\{mac/.exec(palette)?.[1] ?? ""
    const command = readFileSync(join(process.cwd(), "components/ui/command.tsx"), "utf8")
    const row = /cmdk-input-wrapper=""/.test(command) ? /<div className="([^"]+)" cmdk-input-wrapper/.exec(command)?.[1] ?? "" : ""
    // CommandDialog's own right padding for the row, when it sets one.
    const dialogRowEnd = /\[&_\[cmdk-input-wrapper\]\]:pr-(\d+(?:\.5)?)\b/.exec(command)
    const rowEnd = dialogRowEnd ? Number(dialogRowEnd[1]) * 4 : px(row, "pr") || px(row, "px")
    const chipEnds = rowEnd + px(chip, "mr") // the chip's right edge, from the same edge
    expect(buttonReach).toBeGreaterThan(0)
    expect(chipEnds).toBeGreaterThanOrEqual(buttonReach + 4)
  })
})
