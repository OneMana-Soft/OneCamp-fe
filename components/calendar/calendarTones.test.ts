import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { CALENDAR_HUE, hueOf, toneOf } from "./calendarTones"

describe("a calendar item's colour", () => {
  it("is its project's hue for a task, the same hue the project has everywhere", () => {
    const a = { event_uuid: "t1", isTask: true, task_project: { project_uuid: "0c3b5f86-5911-49c9-9f0c-24a47241a6bd" } }
    const b = { event_uuid: "t2", isTask: true, task_project: { project_uuid: "0c3b5f86-5911-49c9-9f0c-24a47241a6bd" } }
    expect(hueOf(a)).toBe(hueFor("0c3b5f86-5911-49c9-9f0c-24a47241a6bd"))
    expect(hueOf(a)).toBe(hueOf(b))
    expect(toneOf(a).block).toContain(HUE_CLASS[hueOf(a)])
  })

  it("is its calendar's hue for an event: OneCamp's, or Google's", () => {
    expect(hueOf({ event_uuid: "e1" })).toBe(CALENDAR_HUE.onecamp)
    expect(hueOf({ event_uuid: "gcal-abc" })).toBe(CALENDAR_HUE.google)
    expect(CALENDAR_HUE.onecamp).not.toBe(CALENDAR_HUE.google)
  })

  it("is no hue at all for time off, which is an absence", () => {
    const tone = toneOf({ event_uuid: "e2", event_is_away: true })
    expect(tone.block).not.toMatch(/hue-/)
    expect(tone.block).toMatch(/border-dashed/)
  })

  it("is drawn as tint and ink with an edge, never the accent", () => {
    for (const item of [{ event_uuid: "e" }, { event_uuid: "t", isTask: true }, { event_uuid: "f", event_is_focus: true }]) {
      expect(toneOf(item).block).toMatch(/text-hue-ink/)
      expect(toneOf(item).block).not.toMatch(/brand|primary/)
    }
  })
})
