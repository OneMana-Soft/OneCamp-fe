import { describe, expect, it } from "vitest"

import { GENERIC_SUGGESTIONS, suggestionsFrom } from "@/components/ai/suggestions"

describe("suggestionsFrom (hub.md AI3)", () => {
  it("puts real names in, at most four", () => {
    const s = suggestionsFrom({
      recentChannel: "engineering",
      tasksDue: 4,
      nextEvent: { title: "Launch sync", at: new Date(2026, 9, 11, 11, 0) },
      draft: "The launch announcement",
    })
    expect(s.map((x) => x.text)).toEqual([
      "What changed in #engineering since yesterday?",
      "Summarise my 4 tasks that are due",
      "Prepare me for Launch sync at 11:00\u00a0AM",
      "Draft the launch announcement",
    ])
    expect(s.map((x) => x.hue)).toEqual(["sky", "moss", "sky", "dusk"])
  })

  it("leaves out what it does not know", () => {
    expect(suggestionsFrom({ tasksDue: 1 }).map((x) => x.text)).toEqual(["Summarise my task that's due"])
    expect(suggestionsFrom({ nextEvent: { title: "Standup" } })[0].text).toBe("Prepare me for Standup")
  })

  it("falls back to the generic three with no context", () => {
    expect(suggestionsFrom(undefined)).toBe(GENERIC_SUGGESTIONS)
    expect(suggestionsFrom({ tasksDue: 0, recentChannel: " " })).toBe(GENERIC_SUGGESTIONS)
  })
})
