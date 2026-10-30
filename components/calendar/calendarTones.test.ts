import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { OWN_HUE, hueOf, otherHue, toneOf } from "./calendarTones"
import { areaHue } from "@/lib/areas"
import { projectHue } from "@/lib/projectHue"
import { calendarHue } from "@/lib/calendar/otherCalendars"

describe("a calendar item's colour", () => {
  it("is its project's hue for a task, the same hue the project has everywhere", () => {
    const a = { event_uuid: "t1", isTask: true, task_project: { project_uuid: "0c3b5f86-5911-49c9-9f0c-24a47241a6bd" } }
    const b = { event_uuid: "t2", isTask: true, task_project: { project_uuid: "0c3b5f86-5911-49c9-9f0c-24a47241a6bd" } }
    expect(hueOf(a)).toBe(hueFor("0c3b5f86-5911-49c9-9f0c-24a47241a6bd"))
    expect(hueOf(a)).toBe(hueOf(b))
    expect(toneOf(a).block).toContain(HUE_CLASS[hueOf(a)])
  })

  it("is its calendar's hue for an event: OneCamp's, or Google's", () => {
    expect(hueOf({ event_uuid: "e1" })).toBe(OWN_HUE)
    expect(hueOf({ event_uuid: "gcal-abc" })).toBe(otherHue("google"))
    expect(OWN_HUE).not.toBe(otherHue("google"))
  })

  // STEP5_PLAN §3 C, the week in colour: an event's own colour, from the Event Form.
  it("is an event's own colour when it is one of the camp hues, never a Google event's", () => {
    expect(hueOf({ event_uuid: "e1", event_hue: "moss" })).toBe("moss")
    expect(hueOf({ event_uuid: "e1", event_hue: "chartreuse" })).toBe(OWN_HUE)
    expect(hueOf({ event_uuid: "e1", event_hue: "" })).toBe(OWN_HUE)
    expect(hueOf({ event_uuid: "gcal-1", event_hue: "moss" })).toBe(otherHue("google"))
    expect(hueOf({ event_uuid: "t1", isTask: true, event_hue: "moss", task_project: { project_uuid: "p1" } })).not.toBe("moss")
  })

  // Calendar A6: an event without a colour of its own is its calendar's colour
  // (a project's, an import's, one you chose); Google's keep Google's.
  it("is its calendar's colour when it has none of its own", () => {
    expect(hueOf({ event_uuid: "e1", calendar_hue: "berry" })).toBe("berry")
    expect(hueOf({ event_uuid: "e1", event_hue: "moss", calendar_hue: "berry" })).toBe("moss")
    expect(hueOf({ event_uuid: "e1", calendar_hue: "chartreuse" })).toBe(OWN_HUE)
    expect(hueOf({ event_uuid: "gcal-1", calendar_hue: "berry" })).toBe(otherHue("google"))
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

// The hue ruling (21 Oct): your own events are the calendar's area hue
// (lib/areas, sun); another calendar, Google's among them, is the one picked
// for it or an id hue that is never sun; a project's calendar keeps its
// project's hue.
describe("the calendar's hues", () => {
  it("are sun for your own, a project's for a project's, and never sun by chance for another", () => {
    expect(hueOf({ event_uuid: "e1" })).toBe(areaHue("calendar"))
    expect(calendarHue({ id: "c-mine", kind: "personal", mine: true }, {})).toBe(areaHue("calendar"))
    expect(hueOf({ event_uuid: "gcal-1" })).not.toBe(areaHue("calendar"))
    expect(calendarHue({ id: "c-p", container_kind: "project", container_id: "proj-1" }, {})).toBe(projectHue("proj-1"))
    const sunny = Array.from({ length: 300 }, (_, i) => `cal-${i}`).filter((id) => hueFor(id) === "sun")
    expect(sunny.length).toBeGreaterThan(0)
    for (const id of sunny) expect(calendarHue({ id }, {})).not.toBe("sun")
    // Picked for it, on the server or on this device, it is what was picked.
    expect(calendarHue({ id: sunny[0], hue: "sun" }, {})).toBe("sun")
    expect(calendarHue({ id: sunny[0] }, { [sunny[0]]: "sun" })).toBe("sun")
  })
})
