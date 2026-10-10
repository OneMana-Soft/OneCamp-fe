import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// "Add a reaction" is the Lucide SmilePlus everywhere: the message hover bar,
// the reaction row and every long-press drawer. The drawers drew a grey SVG
// file at 70% opacity instead, a second icon family that did not follow the
// theme's text colour into dark mode.
const DIR = __dirname
const drawers = readdirSync(DIR).filter((f) => /LongPressDrawer\.tsx$/.test(f))

describe("the add-reaction icon in long-press drawers", () => {
  it("covers every drawer that offers more reactions", () => {
    expect(drawers.length).toBeGreaterThanOrEqual(9)
  })

  it.each(drawers)("%s uses the Lucide icon, not an image", (file) => {
    const src = readFileSync(join(DIR, file), "utf8")
    expect(src).not.toMatch(/addEmoji/)
    if (/Pick another reaction|onAddEmoji|onAddReaction/.test(src)) expect(src).toMatch(/<SmilePlus\b/)
  })

  it("is gone from the status button too", () => {
    expect(readFileSync(join(DIR, "..", "navigationBar", "userStatusNav.tsx"), "utf8")).not.toMatch(/addEmoji/)
  })
})
