import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({}) }))
const { pauseMenuLabel } = await import("@/components/notifications/PauseNotificationsDialog")
import { kindOf, toneOf } from "@/components/calendar/calendarTones"

// Focus time is a pause the person did not set from the menu and cannot resume
// there: the menu has to say which one is holding their notifications.
describe("the pause menu during focus time", () => {
  const at = (h: number) => new Date(2026, 9, 6, h, 0)

  it("says focus time when only the calendar is pausing", () => {
    expect(pauseMenuLabel(null, at(15))).toMatch(/^Focus time until/)
  })

  it("names whichever lasts longer", () => {
    expect(pauseMenuLabel(at(17), at(15))).toMatch(/^Paused until/)
    expect(pauseMenuLabel(at(14), at(15))).toMatch(/^Focus time until/)
  })

  it("offers to pause when nothing is", () => {
    expect(pauseMenuLabel(null, null)).toBe("Pause notifications…")
  })
})

describe("how a calendar item is drawn", () => {
  const meeting = { event_uuid: "e1" }
  const focus = { event_uuid: "e2", event_is_focus: true }
  const away = { event_uuid: "e3", event_is_away: true }
  const task = { event_uuid: "t1", isTask: true, event_is_focus: true, task_project: { project_uuid: "p1" } }

  // The colour tokens are oklch and hex, so hsl(var(--x)) is invalid CSS: the
  // first focus block shipped with no hatching at all.
  it("draws focus time with a background the browser accepts", () => {
    expect(toneOf(focus).block).toContain("color-mix(in_oklch,var(--hue)")
    expect(toneOf(focus).block).not.toMatch(/hsl\(var\(--/)
  })

  it("draws focus time apart from meetings, time off apart from both, and tasks as tasks", () => {
    expect(kindOf(focus)).toBe("focus")
    expect(kindOf(meeting)).toBe("event")
    expect(kindOf(away)).toBe("away")
    expect(kindOf(task)).toBe("task")
    expect(toneOf(focus).block).not.toBe(toneOf(meeting).block)
    expect(toneOf(away).block).toMatch(/border-dashed/)
  })
})
