import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The public booking flow (content.md K03 to K06, guard §1.6.7): the month
// marks open days and skips the rest from the keyboard; a slot splits into
// "Next" before the form; the button names the day and time; errors sit under
// their fields; a slot taken meanwhile is marked; booking celebrates once,
// never under reduced motion.

const PAGE = {
  slug: "sam-rivera",
  title: "Intro call",
  description: "",
  duration_minutes: 30,
  owner_name: "Sam Rivera",
  owner_tz: "UTC",
  slots: [
    { start: "2026-10-12T09:00:00Z", end: "2026-10-12T09:30:00Z" },
    { start: "2026-10-12T10:30:00Z", end: "2026-10-12T11:00:00Z" },
    { start: "2026-10-15T10:30:00Z", end: "2026-10-15T11:00:00Z" },
  ],
  bookable_until: "2026-10-30T00:00:00Z",
}
const { getBookingPage, bookSlot, celebrate, reduced } = vi.hoisted(() => ({
  getBookingPage: vi.fn(),
  bookSlot: vi.fn(),
  celebrate: vi.fn(() => 8),
  reduced: { value: false },
}))
vi.mock("@/services/bookingService", () => ({ getBookingPage, bookSlot }))
vi.mock("@/lib/celebrate", () => ({ celebrate, prefersReducedMotion: () => reduced.value }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "UTC" }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null, madeWithHref: () => "" }))

import { BookingFlow, bookLabel } from "./BookingFlow"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-10T08:00:00Z"))
  getBookingPage.mockResolvedValue({ ok: true, data: PAGE })
  URL.createObjectURL = vi.fn(() => "blob:x")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  bookSlot.mockReset()
  celebrate.mockClear()
  reduced.value = false
})

async function open() {
  await act(async () => {
    render(<BookingFlow slug="sam-rivera" />)
  })
  await act(async () => {})
}
const day = (k: string) => document.querySelector(`[data-day="${k}"]`) as HTMLButtonElement

async function toForm() {
  await open()
  fireEvent.click(day("2026-10-12"))
  fireEvent.click(screen.getByRole("button", { name: /10:30/ }))
  fireEvent.click(document.querySelector("[data-slot-next]")!)
}

describe("the month", () => {
  it("marks open days, and leaves the rest disabled and out of the tab order", async () => {
    await open()
    expect(day("2026-10-12").hasAttribute("data-available")).toBe(true)
    expect(day("2026-10-13").getAttribute("aria-disabled")).toBe("true")
    expect(day("2026-10-13").tabIndex).toBe(-1)
  })

  it("moves with the arrows through open days only", async () => {
    await open()
    day("2026-10-12").focus()
    await act(async () => {
      fireEvent.keyDown(day("2026-10-12"), { key: "ArrowRight" })
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
    expect(document.activeElement).toBe(day("2026-10-15"))
  })

  it("widens the card to the slot column once a day is picked", async () => {
    await open()
    fireEvent.click(day("2026-10-12"))
    const card = document.querySelector("[data-booking-card]")!
    expect(card.getAttribute("data-step")).toBe("2")
    expect(card.className).toMatch(/sm:max-w-\[1000px\]/)
  })
})

describe("a time", () => {
  it("splits into Next inside its own row before the form", async () => {
    await open()
    fireEvent.click(day("2026-10-12"))
    fireEvent.click(screen.getByRole("button", { name: /10:30/ }))
    const row = document.querySelector('[data-slot="2026-10-12T10:30:00Z"]')!
    expect(row.querySelector("[data-slot-next]")).toBeTruthy()
    expect(document.querySelector("[data-guest-form]")).toBeNull()
  })
})

describe("the form", () => {
  it("names the day and time on its button", async () => {
    await toForm()
    expect(screen.getByRole("button", { name: /^Book Mon 12 Oct, / })).toBeTruthy()
    expect(bookLabel(PAGE.slots[1], "UTC", true)).toBe("Book Mon 12 Oct, 10:30")
  })

  it("says what is wrong under each field, as an alert", async () => {
    await toForm()
    await act(async () => fireEvent.click(document.querySelector("[data-book-button]")!))
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent)
    expect(alerts).toEqual(["Add your name.", "Add your email."])
    expect(bookSlot).not.toHaveBeenCalled()
  })

  it("marks a slot someone took meanwhile, and asks for another", async () => {
    bookSlot.mockResolvedValue({ ok: false, status: 409, msg: "That time was just taken." })
    await toForm()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jordan" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "j@example.com" } })
    await act(async () => fireEvent.click(document.querySelector("[data-book-button]")!))
    expect(screen.getByRole("alert").textContent).toMatch(/Someone just booked .*10:30.*Pick another time\./)
    const slot = document.querySelector('[data-slot="2026-10-12T10:30:00Z"] button') as HTMLButtonElement
    expect(slot.disabled).toBe(true)
    expect(slot.className).toMatch(/line-through/)
  })
})

describe("booked", () => {
  async function book() {
    bookSlot.mockResolvedValue({ ok: true, data: { title: "Intro call", owner_name: "Sam Rivera", start: PAGE.slots[1].start, end: PAGE.slots[1].end, cancel_token: "c", emailed: true } })
    await toForm()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jordan" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "j@example.com" } })
    await act(async () => fireEvent.click(document.querySelector("[data-book-button]")!))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450))
    })
  }

  it("shows the ticket and celebrates once", async () => {
    await book()
    expect(screen.getByRole("heading", { name: "You're booked with Sam" })).toBeTruthy()
    expect(document.querySelector("[data-ticket]")?.textContent).toMatch(/Monday 12 October/)
    expect(celebrate).toHaveBeenCalledTimes(1)
  })

  it("does not celebrate under reduced motion", async () => {
    reduced.value = true
    await book()
    expect(celebrate).not.toHaveBeenCalled()
  })
})

// CAL-BUG-20: the page built a date formatter for every slot, label and
// render, mounted both time zone pickers (one hidden), and listed every zone
// for each before anyone opened one. It builds a handful now, and the zone
// list the first time a picker opens.
describe("loading the page", () => {
  it("builds fewer than 10 date formatters, and lists the zones only when the picker opens", async () => {
    vi.resetModules()
    const Real = Intl.DateTimeFormat
    const intl = Intl as unknown as { supportedValuesOf: (key: string) => string[] }
    const realSupported = intl.supportedValuesOf
    let made = 0
    let listed = 0
    Intl.DateTimeFormat = new Proxy(Real, {
      construct(target, args) {
        made++
        return Reflect.construct(target, args)
      },
      apply(target, self, args) {
        made++
        return Reflect.apply(target, self, args)
      },
    })
    intl.supportedValuesOf = (key: string) => {
      if (key === "timeZone") listed++
      return realSupported.call(Intl, key)
    }
    try {
      const { BookingFlow: Fresh } = await import("./BookingFlow")
      await act(async () => {
        render(<Fresh slug="sam-rivera" />)
      })
      await act(async () => {})
      expect(document.querySelector("[data-available]")).toBeTruthy()
      expect(made).toBeLessThan(10)
      expect(listed).toBe(0)
      expect(screen.getAllByRole("button", { name: /^Time zone:/ })).toHaveLength(1)
      await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Time zone:/ })))
      expect(screen.getByRole("listbox", { name: "Time zones" })).toBeTruthy()
      expect(listed).toBeGreaterThan(0)
    } finally {
      Intl.DateTimeFormat = Real
      intl.supportedValuesOf = realSupported
    }
  })
})

// CAL-BUG-15: the confirmation said "The invite is in your email" and "Need
// to change it? Use the link in your email" when the email held no invite and
// the link can only cancel; and it hid the cancel link whenever it was sent.
describe("the confirmation", () => {
  async function bookWith(extra: Record<string, unknown>) {
    bookSlot.mockResolvedValue({ ok: true, data: { title: "Intro call", owner_name: "Sam Rivera", start: PAGE.slots[1].start, end: PAGE.slots[1].end, cancel_token: "secret-token", ...extra } })
    await toForm()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jordan" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "j@example.com" } })
    await act(async () => fireEvent.click(document.querySelector("[data-book-button]")!))
  }
  const icsText = async () => {
    const calls = (URL.createObjectURL as unknown as { mock: { calls: [Blob][] } }).mock.calls
    return calls.length ? calls[calls.length - 1][0].text() : ""
  }

  it("says the invite was emailed only when it was, and always offers the calendars and the cancel link", async () => {
    await bookWith({ emailed: true, booking_id: "b-123" })
    const page = document.querySelector("[data-booked]")!.textContent!
    expect(page).toContain("We've emailed you the invite")
    expect(page).not.toMatch(/invite is in your email|Need to change it/)
    expect(screen.getByRole("link", { name: "Add to calendar (.ics)" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Google Calendar" })).toBeTruthy()
    expect(document.querySelector("[data-cancel-link]")?.textContent).toMatch(/^To cancel, use the link in your email, or this one: .*\/booking\/secret-token$/)
  })

  it("keeps the cancel link on the page when nothing was emailed, and promises no email", async () => {
    await bookWith({ emailed: false, booking_id: "b-123" })
    expect(document.querySelector("[data-emailed]")).toBeNull()
    expect(document.querySelector("[data-cancel-link]")?.textContent).toMatch(/^Keep this link to cancel: .*\/booking\/secret-token$/)
    expect(screen.getByRole("link", { name: "Add to calendar (.ics)" })).toBeTruthy()
  })

  it("adds the same event as the email's invite, and never puts the cancel token in its id", async () => {
    await bookWith({ emailed: true, booking_id: "b-123" })
    const ics = await icsText()
    expect(ics).toContain("UID:b-123@onecamp")
    expect(ics).not.toContain("UID:secret-token")
    expect(ics).toContain("To cancel:")
    expect(ics).not.toMatch(/change or cancel/)
  })
})

// CAL-BUG-14: a page that answers 429 says so and asks again when the server
// allows; it never says the page isn't there.
describe("too many requests", () => {
  it("says so while it waits, then shows the page", async () => {
    // The clock as well as the date (a second call while faking keeps the first's list).
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date("2026-10-10T08:00:00Z"))
    getBookingPage.mockReset()
    getBookingPage.mockResolvedValueOnce({ ok: false, status: 429, msg: "Too many requests from here.", retryAfter: 30 }).mockResolvedValue({ ok: true, data: PAGE })
    await act(async () => {
      render(<BookingFlow slug="sam-rivera" />)
    })
    expect(document.querySelector("[data-booking-retrying]")?.textContent).toBe("Too many requests, wait a minute.")
    expect(screen.queryByText("This booking page isn't available")).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await act(async () => {})
    expect(day("2026-10-12").hasAttribute("data-available")).toBe(true)
  })

  it("puts a refused booking in the server's words", async () => {
    bookSlot.mockResolvedValue({ ok: false, status: 429, msg: "Too many bookings from here. Try again later." })
    await toForm()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jordan" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "j@example.com" } })
    await act(async () => fireEvent.click(document.querySelector("[data-book-button]")!))
    expect(screen.getByRole("alert").textContent).toContain("Too many bookings from here. Try again later.")
  })
})
