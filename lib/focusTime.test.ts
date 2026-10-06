import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({}) }))
const { pauseMenuLabel } = await import("@/components/notifications/PauseNotificationsDialog")
import { calendarColors, calendarTone } from "@/lib/colors"

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
  // The colour tokens are oklch, so hsl(var(--foreground)) is invalid CSS: the
  // first focus block shipped with no hatching at all.
  it("draws focus time with a background the browser accepts", () => {
    expect(calendarColors.focus.block).toContain("color-mix(in_oklch,var(--foreground)")
    expect(calendarColors.focus.block).not.toMatch(/hsl\(var\(--/)
  })

  it("draws focus time apart from meetings, and tasks apart from both", () => {
    expect(calendarTone({ isFocus: true })).toBe(calendarColors.focus)
    expect(calendarTone({})).toBe(calendarColors.event)
    expect(calendarTone({ isTask: true, isFocus: true })).toBe(calendarColors.task)
  })
})
