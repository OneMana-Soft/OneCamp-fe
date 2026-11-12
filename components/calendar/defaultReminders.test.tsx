import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The one wiring behind "Default reminders" on a computer's menus and a phone's drawer (head A).
const setPreference = vi.hoisted(() => vi.fn())
const prefs = vi.hoisted(() => ({ now: undefined as Record<string, unknown> | undefined, failed: false }))
const retry = vi.hoisted(() => vi.fn())
vi.mock("@/lib/preferences/usePreference", () => ({ KEY: "/user/preferences", setPreference }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: prefs.now ? { data: prefs.now } : undefined, isError: prefs.failed, mutate: retry }) }))

import { DefaultReminders, MINE, saveDefaultReminders } from "@/components/calendar/defaultReminders"

const TEAM = { timed: { minutes: [60], email: [60] }, all_day: { minutes: [], email: [] } }

afterEach(() => {
  cleanup()
  setPreference.mockReset()
  retry.mockReset()
  prefs.now = undefined
  prefs.failed = false
})

describe("saveDefaultReminders", () => {
  it("sets one calendar's defaults beside the other calendars', with what was there to put back", async () => {
    setPreference.mockResolvedValue(undefined)
    const next = { timed: { minutes: [10, 20160], email: [20160] }, all_day: { minutes: [540], email: [] } }
    const all = { "cal-team": TEAM }
    expect(await saveDefaultReminders({ "calendar.default_reminders": all }, "mine", next)).toBeNull()
    expect(setPreference).toHaveBeenCalledWith("calendar.default_reminders", { "cal-team": TEAM, mine: next }, all)
  })

  it("starts the map when none is set, and says why a save was refused", async () => {
    setPreference.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { msg: "" } } })
    const next = { timed: { minutes: [30], email: [] }, all_day: { minutes: [], email: [] } }
    expect(await saveDefaultReminders({}, "mine", next)).toBe("Couldn't save those reminders. Try again.")
    expect(setPreference).toHaveBeenCalledWith("calendar.default_reminders", { mine: next }, null)
  })
})

describe("DefaultReminders", () => {
  it("opens at once, and saves nothing until the preferences are read, so a save never drops another calendar's defaults", async () => {
    render(<DefaultReminders calendar={MINE} onClose={() => {}} />)
    expect(await screen.findByText(/For events in My calendar and your invitations/)).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Reminder 1" })).toBeNull()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says a failed read, and asks again", async () => {
    prefs.failed = true
    render(<DefaultReminders calendar={MINE} onClose={() => {}} />)
    expect((await screen.findByRole("alert")).textContent).toBe("Your reminders couldn't be read.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("shows the calendar's own defaults and saves them beside the others'", async () => {
    setPreference.mockResolvedValue(undefined)
    prefs.now = { "calendar.default_reminders": { "cal-team": TEAM, mine: { timed: { minutes: [30], email: [30] }, all_day: { minutes: [], email: [] } } } }
    const onClose = vi.fn()
    render(<DefaultReminders calendar={MINE} onClose={onClose} />)
    expect(await screen.findByText(/For events in My calendar and your invitations/)).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Reminder 1 comes as" }).textContent).toBe("Email")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [, value] = setPreference.mock.calls[0]
    expect(value).toMatchObject({ "cal-team": TEAM, mine: { timed: { minutes: [30], email: [30] } } })
  })
})
