import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import "@/components/docEditor/registry"
import { slashItemsFor } from "@/components/docEditor/registry/readers"

// The slash menu's commands are named in sentence case, as every menu in the
// app is ("Bullet list", not "Bullet List"), and it is the content area's
// CommandList (content.md D09): grouped, with shortcut chips and an AI way
// out when nothing matches.
const src = readFileSync("components/minimal-tiptap/extensions/slash-command/slashCommand.tsx", "utf8")
// What a doc's "/" offers comes from the block registry; the AI edition's, so every item is read.
const items = slashItemsFor("doc", { ai: true })

describe("the slash menu", () => {
  it("names its commands in sentence case", () => {
    const titles = items.map((i) => i.title)
    expect(titles.length).toBeGreaterThan(10)
    // A capital after a space is a proper noun or an acronym, never a second word in title case.
    const titleCase = titles.filter((t) => /\s[A-Z][a-z]/.test(t) && !/^AI:/.test(t))
    expect(titleCase).toEqual([])
  })

  it("is the area's CommandList, not a hand-drawn popover", () => {
    expect(src).not.toMatch(/shadow-(xl|md|overlay)\b/)
    expect(src).toMatch(/<CommandList\b/)
    expect(src).toMatch(/footer=\{items\.length > 0\}/)
  })

  it("groups Recent, Basic, Media and embeds, then AI", () => {
    expect(src).toMatch(/SECTION_ORDER = \["Commands", "Recent", "Basic", "Media and embeds", "AI", "Format"\]/)
  })

  it("shows the markdown shortcut for each basic block", () => {
    const kbd = items.flatMap((i) => i.kbd ?? [])
    for (const k of ["#", "##", "-", "[]", ">"]) expect(kbd).toContain(k)
  })

  it("offers AI when nothing matches in a doc, instead of an empty box", () => {
    expect(src).toMatch(/Ask AI to write “\{query\}”/)
  })
})
