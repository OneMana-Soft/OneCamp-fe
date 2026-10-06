import { describe, expect, it } from "vitest"
import { ago, healthOf, textBlocks, updateDue, type ProjectUpdate } from "./projectUpdates"

const now = Date.parse("2026-10-07T12:00:00Z")
const at = (days: number) => new Date(now - days * 86_400_000).toISOString()

describe("textBlocks", () => {
  it("reads paragraphs, line breaks and lists as the server writes them", () => {
    expect(textBlocks("Shipped SSO.\nMore soon.\n\nDone:\n- Import\n* Pricing\n\n\nThanks")).toEqual([
      { kind: "p", lines: ["Shipped SSO.", "More soon."] },
      { kind: "p", lines: ["Done:"] },
      { kind: "ul", items: ["Import", "Pricing"] },
      { kind: "p", lines: ["Thanks"] },
    ])
  })
  it("treats markup as text and an empty note as nothing", () => {
    expect(textBlocks("<b>hi</b>")).toEqual([{ kind: "p", lines: ["<b>hi</b>"] }])
    expect(textBlocks("  \r\n ")).toEqual([])
  })
})

describe("when an update is due", () => {
  const update = (days: number) => ({ created_at: at(days) }) as ProjectUpdate
  it("is due with none yet, or once the newest is a week old", () => {
    expect(updateDue(undefined, now)).toBe(true)
    expect(updateDue(update(6), now)).toBe(false)
    expect(updateDue(update(7), now)).toBe(true)
  })
  it("says how long ago in words", () => {
    expect(ago(at(0), now)).toBe("today")
    expect(ago(at(1), now)).toBe("yesterday")
    expect(ago(at(9), now)).toBe("9 days ago")
    expect(ago(at(21), now)).toBe("3 weeks ago")
  })
  it("knows each health, and falls back to on track", () => {
    expect(healthOf("off_track").label).toBe("Off track")
    expect(healthOf("nonsense").value).toBe("on_track")
  })
})
