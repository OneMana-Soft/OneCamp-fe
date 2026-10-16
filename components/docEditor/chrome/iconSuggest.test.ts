import { describe, expect, it } from "vitest"
import { FRESH, iconFor, randomIcon, suggestIcons, titleFromLines } from "./iconSuggest"

describe("what a title suggests (V22, T4)", () => {
  it("suggests icons from the title's words, the strongest first, none twice", () => {
    expect(suggestIcons("Q4 launch plan")).toEqual(["🚀", "📦", "🗺️", "🧭"])
    expect(suggestIcons("Incident postmortem", 2)).toEqual(["🚨", "🧯"])
    expect(suggestIcons("Weekly meeting notes")).toEqual(["📅", "🗓️", "📝", "🗒️"])
    expect(suggestIcons("Untitled")).toEqual([])
    // Words, not parts of words: "plant" isn't a plan.
    expect(suggestIcons("Plant care")).toEqual([])
  })

  it("adds the title's first icon, or a calm one when the title brings none to mind", () => {
    expect(iconFor("Launch checklist")).toBe("🚀")
    expect(iconFor("Zebra", () => 0)).toBe(FRESH[0])
    expect(FRESH).toContain(iconFor("Zebra"))
  })

  it("picks a random icon other than the one the page has", () => {
    expect(randomIcon(FRESH[0], () => 0)).toBe(FRESH[1])
    for (let i = 0; i < 20; i++) expect(randomIcon("📘")).not.toBe("📘")
  })

  it("suggests a title from the body's first line with words in it, trimmed to a title's length", () => {
    expect(titleFromLines(["Launch checklist", "Ship it"])).toBe("Launch checklist")
    expect(titleFromLines(["", "  ", "—", "Second line"])).toBe("")
    expect(titleFromLines(["", "Second line"])).toBe("Second line")
    expect(titleFromLines(["  spaced   out  "])).toBe("spaced out")
    const long = "Everything we need to decide before the launch review on Thursday, and who owns each part of it"
    const t = titleFromLines([long])
    expect(t.length).toBeLessThanOrEqual(81)
    expect(t.endsWith("…")).toBe(true)
    expect(long.startsWith(t.slice(0, -1))).toBe(true)
  })
})
