import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const prefs = vi.hoisted(() => ({ values: {} as Record<string, unknown>, sets: [] as [string, unknown][] }))
vi.mock("@/lib/preferences/usePreference", () => ({
  usePreference: (key: string) => [prefs.values[key], async (v: unknown) => {
    prefs.sets.push([key, v])
    prefs.values[key] = v
  }],
}))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Europe/London" }))
const offers = vi.hoisted(() => [] as { what: string; undo: () => unknown }[])
vi.mock("@/components/ui/undoToast", () => ({ offerBack: (offer: { what: string; undo: () => unknown }) => void offers.push(offer) }))

import { WorkingHoursSection } from "./workingHoursSection"

beforeEach(() => {
  prefs.values = { zone: null, week_start: 1, "calendar.working_hours": null }
  prefs.sets = []
  offers.length = 0
})
afterEach(cleanup)

// Calendar A3: your zone, the day your week starts and your working hours.
describe("Working hours in settings", () => {
  it("suggests the browser's zone in one line, and keeps it only when asked", async () => {
    render(<WorkingHoursSection />)
    const line = document.querySelector("[data-zone-suggested]") as HTMLElement
    expect(line.textContent).toMatch(/^Your time zone looks like /)
    expect(prefs.sets).toEqual([])
    fireEvent.click(within(line).getByRole("button", { name: "Use it" }))
    await waitFor(() => expect(prefs.sets).toEqual([["zone", "Europe/London"]]))
  })

  it("sets working hours to a working week, and turns a day on with the day before's", async () => {
    prefs.values.zone = "Europe/London"
    const { rerender } = render(<WorkingHoursSection />)
    expect(screen.getByText("Without them, people can ask for any time.")).toBeTruthy()
    fireEvent.click(screen.getByRole("switch", { name: /Set working hours/ }))
    await waitFor(() => expect(prefs.sets.at(-1)?.[0]).toBe("calendar.working_hours"))
    rerender(<WorkingHoursSection />)
    const days = [...document.querySelectorAll("[data-hours-day]")].map((d) => d.getAttribute("data-hours-day"))
    expect(days).toEqual(["1", "2", "3", "4", "5", "6", "0"])
    fireEvent.click(screen.getByRole("switch", { name: "Work on Saturdays" }))
    await waitFor(() => expect((prefs.sets.at(-1)?.[1] as Record<string, unknown>)["6"]).toEqual([{ start: "09:00", end: "17:00" }]))
  })

  it("orders the days from the week's start", () => {
    prefs.values = { zone: "Europe/London", week_start: 0, "calendar.working_hours": { "1": [{ start: "09:00", end: "17:00" }] } }
    render(<WorkingHoursSection />)
    expect(document.querySelector("[data-hours-day]")?.getAttribute("data-hours-day")).toBe("0")
    expect(screen.getByText((t) => t.startsWith("In "))).toBeTruthy()
  })

  // Calendar A3b: the 12- or 24-hour clock is kept on the account, with the
  // zone and week start under their own heading, apart from working hours.
  it("keeps the clock as Automatic, 12-hour or 24-hour", async () => {
    render(<WorkingHoursSection />)
    const time = screen.getByRole("heading", { name: "Time and date" }).closest("section")
    expect(within(time as HTMLElement).queryByRole("switch", { name: /Set working hours/ })).toBeNull()
    expect(screen.getByRole("heading", { name: "Working hours" })).toBeTruthy()
    const clock = screen.getByRole("radiogroup", { name: /Clock/ })
    expect(within(clock).getByRole("radio", { name: "Automatic" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(clock).getByRole("radio", { name: "24-hour" }))
    await waitFor(() => expect(prefs.sets).toEqual([["clock", "24"]]))
  })

  // design-14: every save that ticks is offered back, and Undo keeps what was
  // there before (null: the default again).
  it("offers each change back, and Undo keeps what was there before", async () => {
    render(<WorkingHoursSection />)
    fireEvent.click(within(screen.getByRole("radiogroup", { name: /Clock/ })).getByRole("radio", { name: "24-hour" }))
    await waitFor(() => expect(offers.map((o) => o.what)).toEqual(["Clock: 24-hour"]))
    await offers[0].undo()
    expect(prefs.sets).toEqual([["clock", "24"], ["clock", null]])
    fireEvent.click(within(document.querySelector("[data-zone-suggested]") as HTMLElement).getByRole("button", { name: "Use it" }))
    await waitFor(() => expect(offers.some((o) => o.what.startsWith("Time zone: "))).toBe(true))
    await offers.find((o) => o.what.startsWith("Time zone: "))!.undo()
    expect(prefs.sets.at(-1)).toEqual(["zone", null])
  })

  // Calendar head 6 (gcal-3): up to two zones beside yours on the day and the
  // week, each with a name for its column, kept as they change.
  it("adds another zone from the list, names it, and takes it away", async () => {
    const { rerender } = render(<WorkingHoursSection />)
    fireEvent.click(within(document.querySelector("[data-other-zones]") as HTMLElement).getByRole("button", { name: "Add a time zone" }))
    fireEvent.change(await screen.findByRole("textbox", { name: "Search time zones" }), { target: { value: "Tokyo" } })
    fireEvent.click((await screen.findAllByRole("option", { name: /Tokyo/ }, { timeout: 10_000 }))[0])
    await waitFor(() => expect(prefs.sets.at(-1)).toEqual(["calendar.zones", [{ zone: "Asia/Tokyo" }]]))
    rerender(<WorkingHoursSection />)
    const name = screen.getByRole("textbox", { name: "Name for Tokyo" })
    fireEvent.change(name, { target: { value: " Tokyo office " } })
    fireEvent.blur(name)
    await waitFor(() => expect(prefs.sets.at(-1)).toEqual(["calendar.zones", [{ zone: "Asia/Tokyo", label: "Tokyo office" }]]))
    rerender(<WorkingHoursSection />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Tokyo office" }))
    await waitFor(() => expect(prefs.sets.at(-1)).toEqual(["calendar.zones", []]))
  })

  it("offers no third zone", () => {
    prefs.values["calendar.zones"] = [{ zone: "Asia/Tokyo" }, { zone: "America/New_York", label: "NYC" }]
    render(<WorkingHoursSection />)
    expect(document.querySelectorAll("[data-other-zone]")).toHaveLength(2)
    expect(screen.getByRole("textbox", { name: "Name for New York" })).toHaveProperty("value", "NYC")
    expect(screen.queryByRole("button", { name: "Add a time zone" })).toBeNull()
  })
})

