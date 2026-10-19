import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Suspense } from "react"

const VIEW = {
  title: "Pricing page walkthrough",
  start: { at: "2026-10-20T13:00:00Z", zone: "Europe/London" },
  end: { at: "2026-10-20T13:45:00Z" },
  all_day: false,
  organiser: "Sam Rivera",
  ended: false,
  you: { name: "Alex Kim", email: "alex@example.com", response: "needs_action" },
  guests: [{ name: "Maya Chen", response: "accepted" }],
  notes: "We'll walk the new tiers.",
}
const { getInvitation, answerInvitation } = vi.hoisted(() => ({ getInvitation: vi.fn(), answerInvitation: vi.fn() }))
vi.mock("@/services/eventInvitationService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/eventInvitationService")>()),
  getInvitation,
  answerInvitation,
}))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null, madeWithHref: () => "" }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))

import InvitationPage from "./page"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, data: { ...VIEW, ...extra } })

beforeEach(() => {
  getInvitation.mockResolvedValue(ok())
  answerInvitation.mockImplementation(async (_t: string, body: { answer: string; note?: string }) => ok({ you: { ...VIEW.you, response: body.answer, note: body.note } }))
})
afterEach(() => {
  cleanup()
  getInvitation.mockReset()
  answerInvitation.mockReset()
  window.history.replaceState(null, "", "/")
})

async function show(path = "/rsvp/t") {
  window.history.replaceState(null, "", path)
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <InvitationPage params={Promise.resolve({ token: "t" })} />
      </Suspense>,
    )
  })
  await act(async () => {})
}

describe("an invitation's own page", () => {
  it("says who invited them to what, when on their own clock, who else is coming, and asks Going?", async () => {
    await show()
    expect(screen.getByText("Sam Rivera invited you")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Pricing page walkthrough" })).toBeTruthy()
    // 13:00 UTC is 6:30 PM in Kolkata.
    expect(screen.getByText("Tuesday 20 October")).toBeTruthy()
    expect(document.querySelector("[data-ticket]")?.textContent).toMatch(/6:30 – 7:15\sPM/)
    expect(screen.getByRole("radiogroup", { name: "Going?" })).toBeTruthy()
    expect(screen.getByText("Maya Chen")).toBeTruthy()
    expect(screen.getByText("We'll walk the new tiers.")).toBeTruthy()
    expect(screen.getByText("Invited as alex@example.com. Your answer goes to Sam Rivera.")).toBeTruthy()
  })

  it("sends the answer the email's button carried, once, and drops it from the address", async () => {
    await show("/rsvp/t?answer=maybe")
    await waitFor(() => expect(answerInvitation).toHaveBeenCalledWith("t", { answer: "tentative" }))
    expect(window.location.search).toBe("")
    await waitFor(() => expect(screen.getByRole("radio", { name: /Maybe/ }).getAttribute("aria-checked")).toBe("true"))
    expect(answerInvitation).toHaveBeenCalledTimes(1)
  })

  it("sends nothing for an answer already given, or for an event that has happened", async () => {
    getInvitation.mockResolvedValue(ok({ you: { ...VIEW.you, response: "accepted" } }))
    await show("/rsvp/t?answer=yes")
    expect(answerInvitation).not.toHaveBeenCalled()
    cleanup()
    getInvitation.mockResolvedValue(ok({ ended: true }))
    await show("/rsvp/t?answer=no")
    expect(answerInvitation).not.toHaveBeenCalled()
    expect(screen.getByText("This event has happened.")).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()
  })

  it("answers from the page, and takes a note once answered", async () => {
    await show()
    fireEvent.click(screen.getByRole("radio", { name: "No" }))
    await waitFor(() => expect(answerInvitation).toHaveBeenCalledWith("t", { answer: "declined" }))
    const note = await screen.findByRole("textbox", { name: "Your note with your answer" })
    fireEvent.change(note, { target: { value: "Away that week" } })
    fireEvent.blur(note)
    await waitFor(() => expect(answerInvitation).toHaveBeenLastCalledWith("t", { answer: "declined", note: "Away that week" }))
  })

  it("says an all-day event's dates, in no zone", async () => {
    getInvitation.mockResolvedValue(ok({ all_day: true, start: { date: "2026-10-26" }, end: { date: "2026-10-28" } }))
    await show()
    expect(screen.getByText("Monday 26 October – Tuesday 27 October")).toBeTruthy()
    expect(document.querySelector("[data-ticket]")?.textContent).toContain("All day")
  })
})
