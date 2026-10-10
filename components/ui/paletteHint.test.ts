import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The palette's shortcut chip sat under the dialog's close button: the chip
// ends the input row, and the button is drawn over the dialog's top-right
// corner, so "Ctrl K" and the X overlapped. The chip keeps a margin that
// clears the button, read from both files so a change to either is caught.

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
    const chipEnds = px(row, "px") + px(chip, "mr") // the chip's right edge, from the same edge
    expect(buttonReach).toBeGreaterThan(0)
    expect(chipEnds).toBeGreaterThanOrEqual(buttonReach + 4)
  })
})
