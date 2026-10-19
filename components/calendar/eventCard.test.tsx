import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import { EventPopover } from "./eventPopover"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// STEP4_PLAN §4 #5, calendar A2: the event card answers "Going?".

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  document.querySelectorAll("[data-vaul-drawer-wrapper]").forEach((n) => n.remove())
  document.body.removeAttribute("style")
})

const now = new Date(2026, 9, 15, 10, 0)
const person = (uuid: string, name: string) => ({ user_uuid: uuid, user_name: name, user_full_name: name })

function event(extra: Partial<CalendarEventInterface> = {}): CalendarEventInterface {
  return {
    event_uuid: "e1",
    event_title: "Launch review",
    event_description: "<p>Join https://meet.example.com/abc</p>",
    event_start_time: new Date(2026, 9, 15, 11, 0).toISOString(),
    event_end_time: new Date(2026, 9, 15, 12, 0).toISOString(),
    event_created_by: person("sam", "Sam Rivera") as CalendarEventInterface["event_created_by"],
    event_participants: [person("maya", "Maya Chen"), person("jonas", "Jonas Weber"), person("lee", "Lee Park")] as CalendarEventInterface["event_participants"],
    event_guests: [
      { user_uuid: "maya", role: "required", response: "accepted" },
      { user_uuid: "jonas", role: "required", response: "tentative" },
      { user_uuid: "lee", role: "required", response: "needs_action" },
    ],
    ...extra,
  }
}

const anchor = () => {
  const a = document.createElement("button")
  document.body.appendChild(a)
  return a
}

describe("the organiser's card", () => {
  it("counts who said what, asks no question of them, and keeps the pencil", () => {
    render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const card = screen.getByRole("dialog", { name: "Launch review" })
    expect(within(card).getByText("2 going · 1 maybe · 1 no answer")).toBeTruthy()
    expect(within(card).queryByRole("radiogroup")).toBeNull()
    expect(within(card).getByRole("button", { name: "Edit event" })).toBeTruthy()
    expect(within(card).getByText("Organised by you")).toBeTruthy()
    // The order: when, Join, guests, calendar and organiser, notes.
    const text = card.textContent ?? ""
    expect(text.indexOf("Join call")).toBeLessThan(text.indexOf("2 going"))
    expect(text.indexOf("2 going")).toBeLessThan(text.indexOf("OneCamp · Personal"))
    expect(text.indexOf("Organised by you")).toBeLessThan(text.indexOf("Join https://meet.example.com/abc"))
  })
})

describe("a guest's card", () => {
  it("asks Going? at its foot, names who's coming, and has no pencil", () => {
    render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="lee" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const card = screen.getByRole("dialog", { name: "Launch review" })
    const going = within(card).getByRole("radiogroup", { name: "Going?" })
    expect(within(going).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true)
    expect(going.closest("[data-card-footer]")).toBeTruthy()
    expect(within(card).getByText("Maya Chen, Jonas Weber and you")).toBeTruthy()
    expect(within(card).queryByRole("button", { name: "Edit event" })).toBeNull()
    expect(within(card).getByText("Organised by Sam Rivera")).toBeTruthy()
    expect(within(card).getByRole("img", { name: "Maya Chen, going" })).toBeTruthy()
  })

  it("sends the answer when one is picked, a tap with no note", async () => {
    makeRequest.mockResolvedValue({})
    render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="lee" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ appendToUrl: "/e1/answer", payload: { answer: "accepted", scope: "all" } })))
    expect(screen.getByRole("radio", { name: /Yes/ }).getAttribute("aria-checked")).toBe("true")
  })

  it("shows the answer given", () => {
    render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="jonas" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.getByRole("radio", { name: /Maybe/ }).getAttribute("aria-checked")).toBe("true")
  })

  it("asks nothing once the event is over, nor of an event from the old stores, nor of Google's", () => {
    const ended = event({ event_start_time: new Date(2026, 9, 15, 8).toISOString(), event_end_time: new Date(2026, 9, 15, 9).toISOString() })
    const { rerender } = render(<EventPopover event={ended} anchor={anchor()} now={now} selfId="lee" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("link", { name: /Join call/ })).toBeNull()
    rerender(<EventPopover event={event({ event_guests: undefined })} anchor={anchor()} now={now} selfId="lee" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("radiogroup")).toBeNull()
    rerender(<EventPopover event={event({ event_uuid: "gcal-1" })} anchor={anchor()} now={now} selfId="lee" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })
})

// Calendar A5: the reader's own reminders, where the calendar keeps them.
describe("the card's reminders", () => {
  it("says the reader's reminder, for an event to come", () => {
    render(<EventPopover event={event({ event_reminders: [10], event_reminders_default: true })} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const card = screen.getByRole("dialog", { name: "Launch review" })
    expect(within(card).getByRole("button", { name: "Reminders: 10 minutes before" })).toBeTruthy()
    // After the guests, before the calendar (STEP4_PLAN §4 #5).
    const text = card.textContent ?? ""
    expect(text.indexOf("10 minutes before")).toBeGreaterThan(text.indexOf("going"))
    expect(text.indexOf("10 minutes before")).toBeLessThan(text.indexOf("OneCamp · Personal"))
  })

  it("has none for a guest who said no", () => {
    const declined = event({ event_created_by: { user_uuid: "maya", user_name: "Maya Chen" } as CalendarEventInterface["event_created_by"], event_reminders: [], event_guests: [{ user_uuid: "sam", role: "required", response: "declined" }] })
    render(<EventPopover event={declined} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Reminders|Add a reminder/ })).toBeNull()
  })

  it("asks a guest with none to add one", () => {
    const unset = event({ event_created_by: { user_uuid: "maya", user_name: "Maya Chen" } as CalendarEventInterface["event_created_by"], event_reminders: [], event_guests: [{ user_uuid: "sam", role: "required", response: "needs_action" }] })
    render(<EventPopover event={unset} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Add a reminder" })).toBeTruthy()
  })

  it("has none for an event from the old stores, Google's, or one that's over", () => {
    const { rerender } = render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Reminders/ })).toBeNull()
    rerender(<EventPopover event={event({ event_uuid: "gcal-1", event_reminders: [10] })} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Reminders/ })).toBeNull()
    const over = event({ event_reminders: [10], event_start_time: new Date(2026, 9, 15, 8).toISOString(), event_end_time: new Date(2026, 9, 15, 9).toISOString() })
    rerender(<EventPopover event={over} anchor={anchor()} now={now} selfId="sam" onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Reminders/ })).toBeNull()
  })
})

describe("the card on a phone", () => {
  it("is the half sheet, named by the title, with Going? at its foot at 44 px", () => {
    render(<EventPopover event={event()} anchor={null} now={now} selfId="lee" phone onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const sheet = document.querySelector("[data-event-sheet]") as HTMLElement
    expect(sheet.getAttribute("data-detent")).toBe("half")
    expect(screen.getByRole("dialog", { name: "Launch review" })).toBeTruthy()
    const foot = sheet.querySelector("[data-card-footer]") as HTMLElement
    expect(foot.className).toMatch(/sticky/)
    expect(within(foot).getByRole("radio", { name: "Yes" }).className).toMatch(/\bh-11\b/)
  })

  it("stays open while it asks which events an answer is for", () => {
    const close = vi.fn()
    render(<EventPopover event={event()} anchor={anchor()} now={now} selfId="lee" holdOpen onClose={close} onOpenFull={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Launch review" }), { key: "Escape" })
    expect(close).not.toHaveBeenCalled()
  })
})
