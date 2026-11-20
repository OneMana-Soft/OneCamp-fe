import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Suspense } from "react"

const BOOKING = { title: "Intro call with Sam", owner_name: "Sam Rivera", start: "2026-10-14T05:30:00Z", end: "2026-10-14T06:00:00Z", cancelled: false, slug: "sam-rivera" }
const { getBooking, cancelBooking, rescheduleBooking, getBookingPage } = vi.hoisted(() => ({
  getBooking: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  getBookingPage: vi.fn(),
}))
vi.mock("@/services/bookingService", () => ({ getBooking, cancelBooking, rescheduleBooking, getBookingPage }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null, madeWithHref: () => "" }))

import ManageBooking from "./page"

const answer = (extra: Record<string, unknown> = {}) => ({ ok: true, data: { ...BOOKING, ...extra } })
// The page's free times (10:00 and 10:30 IST on Thursday 15 October): the
// same answer for the first fortnight and for each half of the month.
const SLOTS = [
  { start: "2026-10-15T04:30:00Z", end: "2026-10-15T05:00:00Z" },
  { start: "2026-10-15T05:00:00Z", end: "2026-10-15T05:30:00Z" },
]
const PAGE = { slug: "sam-rivera", title: "Intro call", description: "", duration_minutes: 30, owner_name: "Sam Rivera", owner_tz: "UTC", slots: SLOTS, bookable_until: "2026-11-10T00:00:00Z" }
beforeEach(() => {
  getBooking.mockResolvedValue(answer())
  getBookingPage.mockResolvedValue({ ok: true, data: PAGE })
  URL.createObjectURL = vi.fn(() => "blob:x")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  getBooking.mockReset()
  cancelBooking.mockReset()
  rescheduleBooking.mockReset()
  getBookingPage.mockReset()
  vi.useRealTimers()
})
const at = new Date("2026-10-13T08:00:00Z")

async function show() {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(at)
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ManageBooking params={Promise.resolve({ token: "t" })} />
      </Suspense>,
    )
  })
  await act(async () => {})
}

describe("a booking's own page", () => {
  it("names the meeting once, says who it is with on its own line, and shows the ticket in the public frame", async () => {
    await show()
    const title = await screen.findByRole("heading", { name: "Intro call with Sam" })
    expect(title).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/with Sam with/)
    expect(screen.getByText("With Sam Rivera")).toBeTruthy()
    expect(screen.getByText("Wednesday 14 October")).toBeTruthy()
    expect(screen.getByText(/^11:00\sAM – 11:30\sAM · /)).toBeTruthy()
    expect(document.querySelector("[data-public-frame] [data-ticket]")).toBeTruthy()
    expect(document.querySelector("svg.text-primary")).toBeNull()
  })

  it("asks before cancelling, in the page, not with a browser dialog", async () => {
    // The day before the meeting: from its end (14 Oct, 11:30 IST) the page
    // says it has happened and offers no cancelling.
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }))
    expect(screen.getByText("Cancel this meeting?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Keep it" })).toBeTruthy()
  })
})

// CAL-BUG-5: after cancelling, the page said "Sam has been told" whether or
// not Sam was; the owner is said to be told only when the server says so.
describe("cancelling", () => {
  it("asks without promising that the owner is told", async () => {
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }, { timeout: 5000 }))
    expect(screen.getByText("It comes off Sam's calendar, and the time is free again.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/told at once/)
  })

  it("says the owner was told only when they were", async () => {
    cancelBooking.mockResolvedValue(answer({ cancelled: true, owner_told: true, page_live: true }))
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }, { timeout: 5000 }))
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!))
    expect(document.querySelector("[data-cancelled-line]")?.textContent).toBe("Sam has been told. Their calendar is clear again.")
    cleanup()
    cancelBooking.mockResolvedValue(answer({ cancelled: true, owner_told: false, page_live: true }))
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }, { timeout: 5000 }))
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!))
    expect(document.querySelector("[data-cancelled-line]")?.textContent).toBe("Sam's calendar is clear again.")
    expect(screen.getByRole("link", { name: "Book another time" })).toBeTruthy()
  })
})

// CAL-BUG-3 and CAL-BUG-4: the owner can delete the meeting, or the page.
describe("a booking the owner changed", () => {
  it("says the owner cancelled it", async () => {
    getBooking.mockResolvedValue(answer({ cancelled: true, cancelled_by_host: true, page_live: true }))
    await show()
    expect(document.querySelector("[data-cancelled-line]")?.textContent).toBe("Sam cancelled this meeting.")
    expect(screen.getByRole("link", { name: "Book another time" })).toBeTruthy()
  })

  it("offers no way back to a page that is gone", async () => {
    getBooking.mockResolvedValue(answer({ cancelled: true, page_live: false }))
    await show()
    expect(document.querySelector("[data-cancelled-line]")?.textContent).toBe("This meeting is cancelled.")
    expect(screen.queryByRole("link", { name: "Book another time" })).toBeNull()
    cleanup()
    getBooking.mockResolvedValue(answer({ start: "2026-10-12T05:30:00Z", end: "2026-10-12T06:00:00Z", page_live: false }))
    await show()
    expect(screen.getByText("This meeting has happened.")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Book again" })).toBeNull()
  })
})

// CAL-BUG-14: a 429 read "We couldn't find that booking".
describe("too many requests", () => {
  it("says so, and never that the booking can't be found", async () => {
    getBooking.mockResolvedValue({ ok: false, status: 429, msg: "Too many requests from here.", retryAfter: 60 })
    await show()
    expect(document.querySelector("[data-booking-retrying]")?.textContent).toBe("Too many requests, wait a minute.")
    expect(screen.queryByText("We couldn't find that booking")).toBeNull()
  })
})


// gcal-7: a guest moves their booking from its link, to one of the page's own
// free times, picked on the same month and times as booking it.
describe("changing the time", () => {
  const MOVED = { start: SLOTS[1].start, end: SLOTS[1].end }
  const ticket = () => document.querySelector("[data-ticket]")!.textContent!
  async function pick() {
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Change time" }, { timeout: 5000 }))
    const day = await waitFor(() => {
      const d = document.querySelector('[data-day="2026-10-15"][data-available]') as HTMLButtonElement | null
      if (!d) throw new Error("no open day yet")
      return d
    })
    fireEvent.click(day)
    fireEvent.click(screen.getByRole("button", { name: /^10:30/ }))
  }
  async function move() {
    await pick()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Move here/ })))
    await act(async () => {})
  }

  it("opens the page's own times on the page, in the guest's zone, without an overlay", async () => {
    await pick()
    expect(getBookingPage.mock.calls[0][0]).toBe("sam-rivera")
    expect(screen.getByRole("region", { name: "Pick a day" })).toBeTruthy()
    expect(document.querySelector("[role=dialog]")).toBeNull()
  })

  it("lets the guest keep their time: Keep this time closes the times and brings back Change time and Cancel booking", async () => {
    await pick()
    fireEvent.click(screen.getByRole("button", { name: "Keep this time" }))
    expect(screen.queryByRole("region", { name: "Change time" })).toBeNull()
    expect(screen.getByRole("button", { name: "Change time" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy()
    expect(rescheduleBooking).not.toHaveBeenCalled()
    expect(ticket()).toContain("11:30")
  })

  it("moves it to the picked time, and shows the new time, who was told and its calendar file", async () => {
    rescheduleBooking.mockResolvedValue(answer({ ...MOVED, owner_told: true, booking_id: "b-1" }))
    await move()
    expect(rescheduleBooking).toHaveBeenCalledWith("t", SLOTS[1].start)
    expect(ticket()).toContain("10:30")
    expect(ticket()).not.toContain("11:30")
    expect(document.querySelector("[data-moved-line]")?.textContent).toBe("Sam has been told.")
    expect(screen.getByRole("link", { name: "Add to calendar (.ics)" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Pick a day" })).toBeNull()
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy()
  })

  it("says the owner was told only when they were", async () => {
    rescheduleBooking.mockResolvedValue(answer({ ...MOVED, owner_told: false }))
    await move()
    expect(ticket()).toContain("10:30")
    expect(document.body.textContent).not.toMatch(/has been told/)
  })

  it("shows the server's words on too many moves, closes the times and still offers cancelling", async () => {
    const msg = "This booking has been moved too often today. Try again tomorrow."
    rescheduleBooking.mockResolvedValue({ ok: false, status: 429, msg, retryAfter: 3600 })
    await move()
    expect(screen.getByRole("alert").textContent).toBe(msg)
    expect(ticket()).toContain("11:00")
    expect(screen.queryByRole("region", { name: "Pick a day" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }))
    expect(screen.getByText("Cancel this meeting?")).toBeTruthy()
  })

  it("shows why a time was refused, and asks the page's times again", async () => {
    rescheduleBooking.mockResolvedValue({ ok: false, status: 409, msg: "That time was just taken." })
    await pick()
    const asked = getBookingPage.mock.calls.length
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Move here/ })))
    await act(async () => {})
    expect(screen.getByRole("alert").textContent).toBe("That time was just taken.")
    expect(ticket()).toContain("11:00")
    expect(screen.getByRole("region", { name: "Pick a day" })).toBeTruthy()
    await waitFor(() => expect(getBookingPage.mock.calls.length).toBeGreaterThan(asked), { timeout: 4000 })
  })

  it("keeps the old time when nothing answers", async () => {
    rescheduleBooking.mockResolvedValue({ ok: false, status: 0, msg: "Couldn't reach the server. Check your connection and try again." })
    await move()
    expect(screen.getByRole("alert").textContent).toBe("Couldn't move it. Check your connection and try again.")
    expect(ticket()).toContain("11:00")
    expect(ticket()).not.toContain("10:30")
  })

  it("keeps the old time when the server fails", async () => {
    rescheduleBooking.mockResolvedValue({ ok: false, status: 502, msg: "Bad gateway" })
    await move()
    expect(screen.getByRole("alert").textContent).toBe("Couldn't move it. Check your connection and try again.")
    expect(ticket()).toContain("11:00")
  })

  it("offers no change on a page that is off, or a cancelled booking", async () => {
    getBooking.mockResolvedValue(answer({ page_live: false }))
    await show()
    expect(await screen.findByRole("button", { name: "Cancel booking" }, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Change time" })).toBeNull()
    cleanup()
    getBooking.mockResolvedValue(answer({ cancelled: true, page_live: true }))
    await show()
    await screen.findByText("This meeting is cancelled.", undefined, { timeout: 5000 })
    expect(screen.queryByRole("button", { name: "Change time" })).toBeNull()
  })

  it("says so on a day with no free times left", async () => {
    getBookingPage.mockResolvedValue({ ok: true, data: { ...PAGE, slots: [] } })
    await show()
    fireEvent.click(await screen.findByRole("button", { name: "Change time" }, { timeout: 5000 }))
    expect(await screen.findByText(/No free times in October/, undefined, { timeout: 5000 })).toBeTruthy()
  })
})
