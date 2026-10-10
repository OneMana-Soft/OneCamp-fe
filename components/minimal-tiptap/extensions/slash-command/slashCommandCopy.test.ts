import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The slash menu's commands are named in sentence case, as every menu in the
// app is ("Bullet list", not "Bullet List"), and it floats on the overlay
// shadow every popover uses.
const src = readFileSync("components/minimal-tiptap/extensions/slash-command/slashCommand.tsx", "utf8")

describe("the slash menu", () => {
  it("names its commands in sentence case", () => {
    const titles = [...src.matchAll(/title: "([^"]+)"/g)].map((m) => m[1])
    expect(titles.length).toBeGreaterThan(10)
    // A capital after a space is a proper noun or an acronym, never a second word in title case.
    const titleCase = titles.filter((t) => /\s[A-Z][a-z]/.test(t) && !/^AI:/.test(t))
    expect(titleCase).toEqual([])
  })

  it("floats on the overlay shadow", () => {
    expect(src).not.toMatch(/shadow-(xl|md)\b/)
    expect(src).toMatch(/shadow-overlay/)
  })
})
