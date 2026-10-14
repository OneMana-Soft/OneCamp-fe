import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Suspense } from "react"

const BOOKING = { title: "Intro call with Sam", owner_name: "Sam Rivera", start: "2026-10-14T05:30:00Z", end: "2026-10-14T06:00:00Z", cancelled: false, slug: "sam-rivera" }
const { getBooking, cancelBooking } = vi.hoisted(() => ({ getBooking: vi.fn(), cancelBooking: vi.fn() }))
vi.mock("@/services/bookingService", () => ({ getBooking, cancelBooking }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null, madeWithHref: () => "" }))

import ManageBooking from "./page"

const answer = (extra: Record<string, unknown> = {}) => ({ ok: true, data: { ...BOOKING, ...extra } })
beforeEach(() => {
  getBooking.mockResolvedValue(answer())
})
afterEach(() => {
  cleanup()
  getBooking.mockReset()
  cancelBooking.mockReset()
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
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ManageBooking params={Promise.resolve({ token: "t" })} />
        </Suspense>,
      )
    })
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

