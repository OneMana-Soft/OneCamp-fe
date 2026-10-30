import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
// The shared pickers have browser tests of their own: here, plain stand-ins.
vi.mock("@/components/ui/date-field", async (importOriginal) => {
  const field = (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  )
  return { ...(await importOriginal<typeof import("@/components/ui/date-field")>()), DateField: field, TimeField: field }
})

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
  toast.mockReset()
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

  // Calendar head 4: a guest proposes another time from their own page.
  it("proposes another time with the answer when the event takes one, shows it, and takes it back", async () => {
    getInvitation.mockResolvedValue(ok({ proposable: true, you: { ...VIEW.you, response: "tentative" } }))
    answerInvitation.mockImplementation(async (_t: string, body: { answer: string; proposal?: { start?: string } }) =>
      ok({ proposable: true, you: { ...VIEW.you, response: body.answer, ...(body.proposal?.start ? { proposal: body.proposal } : {}) } }),
    )
    await show()
    fireEvent.click(screen.getByRole("button", { name: "Propose a new time" }))
    const form = await screen.findByRole("group", { name: "Propose a new time" })
    fireEvent.change(within(form).getByRole("textbox", { name: "Day" }), { target: { value: "2026-10-21" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "From" }), { target: { value: "15:00" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "Until" }), { target: { value: "15:45" } })
    fireEvent.click(within(form).getByRole("button", { name: "Propose" }))
    const p = { start: new Date(2026, 9, 21, 15).toISOString(), end: new Date(2026, 9, 21, 15, 45).toISOString() }
    await waitFor(() => expect(answerInvitation).toHaveBeenCalledWith("t", { answer: "tentative", proposal: p }))
    expect((await screen.findByText(/^You proposed/)).closest("[data-your-proposal]")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Take it back" }))
    await waitFor(() => expect(answerInvitation).toHaveBeenLastCalledWith("t", { answer: "tentative", proposal: {} }))
    expect(await screen.findByRole("button", { name: "Propose a new time" })).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
  })

  it("says a time the server won't take in its words, keeping the page, and offers none where the event takes none", async () => {
    getInvitation.mockResolvedValue(ok({ proposable: true, you: { ...VIEW.you, response: "accepted" } }))
    answerInvitation.mockResolvedValue({ ok: false, status: 400, msg: "That's the time it's at already." })
    await show()
    fireEvent.click(screen.getByRole("button", { name: "Propose a new time" }))
    const form = await screen.findByRole("group", { name: "Propose a new time" })
    fireEvent.click(within(form).getByRole("button", { name: "Propose" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't propose that time", description: "That's the time it's at already." })))
    expect(screen.getByRole("heading", { name: "Pricing page walkthrough" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "Propose a new time" })).toBeTruthy()
    cleanup()
    // A series, an all-day event, or one over: the server says it takes none.
    getInvitation.mockResolvedValue(ok({ proposable: false, you: { ...VIEW.you, response: "accepted" } }))
    await show()
    expect(screen.getByRole("textbox", { name: "Your note with your answer" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Propose a new time" })).toBeNull()
  })

  it("says an all-day event's dates, in no zone", async () => {
    getInvitation.mockResolvedValue(ok({ all_day: true, start: { date: "2026-10-26" }, end: { date: "2026-10-28" } }))
    await show()
    expect(screen.getByText("Monday 26 October – Tuesday 27 October")).toBeTruthy()
    expect(document.querySelector("[data-ticket]")?.textContent).toContain("All day")
  })

  // meet-02 (1): the event's own call, joined with the guest's own key, so
  // they come in without knocking; none once it has happened or with no call.
  it("offers the event's call with the guest's key, until the event has happened", async () => {
    getInvitation.mockResolvedValue(ok({ call_address: "/r/design-review-1a2b" }))
    await show()
    const join = screen.getByRole("link", { name: "Join call" })
    expect(join.getAttribute("href")).toBe("/r/design-review-1a2b#invitation=t")
    cleanup()
    getInvitation.mockResolvedValue(ok({ call_address: "/r/design-review-1a2b", ended: true }))
    await show()
    expect(screen.queryByRole("link", { name: "Join call" })).toBeNull()
    cleanup()
    getInvitation.mockResolvedValue(ok())
    await show()
    expect(screen.queryByRole("link", { name: "Join call" })).toBeNull()
  })
})
