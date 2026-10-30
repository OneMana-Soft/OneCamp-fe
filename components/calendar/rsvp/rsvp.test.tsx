import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const toasts = vi.hoisted(() => [] as { title?: string; action?: unknown }[])
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string }) => toasts.push(t),
  useToast: () => ({ toast: (t: { title?: string }) => toasts.push(t) }),
}))
// The shared pickers have browser tests of their own: here, plain stand-ins.
vi.mock("@/components/ui/date-field", async (importOriginal) => {
  const field = (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  )
  return { ...(await importOriginal<typeof import("@/components/ui/date-field")>()), DateField: field, TimeField: field }
})

import type { CalendarEventInterface, GetEventsResponse } from "@/types/calendar"
import { GoingControl } from "./goingControl"
import { type FaceGuest } from "./guestFaces"
import { GuestFaces } from "./guestRow"
import { eventGuests, guestsFold, guestsSummary } from "./eventGuests"
import { EventGuestList, INVITE_WORDS } from "./guestList"
import { YourAnswer } from "./yourAnswer"
import { proposalOf } from "./proposals"
import { sendAnswer, withAnswer } from "./sendAnswer"
import { sameGuests, tellOf, type EventShape } from "@/lib/calendar/tellGuests"
import { TellGuestsPrompt } from "@/components/calendar/tellGuestsDialog"
import { ScopePrompt } from "@/components/calendar/scopePromptDialog"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(() => {
  cleanup()
  toasts.length = 0
})

const person = (uuid: string, name: string) => ({ user_uuid: uuid, user_name: name, user_full_name: name, user_email_id: `${name.split(" ")[0].toLowerCase()}@onecamp.test` })
const sam = person("sam", "Sam Rivera")
const maya = person("maya", "Maya Chen")
const jonas = person("jonas", "Jonas Weber")
const lee = person("lee", "Lee Park")
const ana = person("ana", "Ana Silva")

function meeting(guests: CalendarEventInterface["event_guests"], extra: Partial<CalendarEventInterface> = {}): CalendarEventInterface {
  return {
    event_uuid: "e1",
    event_title: "Launch review",
    event_start_time: new Date(2026, 9, 20, 14, 0).toISOString(),
    event_end_time: new Date(2026, 9, 20, 15, 0).toISOString(),
    event_created_by: sam as CalendarEventInterface["event_created_by"],
    event_participants: [maya, jonas, lee, ana] as CalendarEventInterface["event_participants"],
    event_guests: guests,
    ...extra,
  }
}

const answered = meeting([
  { user_uuid: "maya", role: "required", response: "accepted", note: "Ten minutes late" },
  { user_uuid: "jonas", role: "required", response: "tentative" },
  { user_uuid: "lee", role: "required", response: "needs_action" },
  { email: "alex@example.com", name: "Alex Kim", role: "required", response: "declined", invite: "not_sent" },
])

describe("an event's guests, as the card and the panel read them", () => {
  it("puts the organiser first, then going, maybe, not going and no answer, guests by email among them", () => {
    const g = eventGuests(answered, "maya")
    expect(g.faces.map((f) => f.name)).toEqual(["Sam Rivera", "Maya Chen", "Jonas Weber", "Alex Kim", "Lee Park"])
    expect(g.faces[0].organiser).toBe(true)
    expect(g.faces[3]).toMatchObject({ outside: true, email: "alex@example.com", invite: "not_sent", detail: "alex@example.com" })
    expect(g.mine).toBe("accepted")
    expect(g.answered).toBe(true)
    expect(g.counts).toEqual({ going: 2, maybe: 1, no: 1, waiting: 1 })
  })

  it("shows an event from the old stores with its guests and no answers", () => {
    const g = eventGuests(meeting(undefined), "maya")
    expect(g.answered).toBe(false)
    expect(g.faces.slice(1).every((f) => f.response === "needs_action")).toBe(true)
    // Its counts would only say that nobody answered: it names them.
    expect(guestsSummary(g, true)).toBe("Jonas Weber, Lee Park and 2 others")
  })

  it("says the counts to the organiser and names who's coming to a guest, until the row folds", () => {
    const g = eventGuests(answered, "maya")
    expect(guestsSummary(g, true)).toBe("2 going · 1 maybe · 1 not going · 1 no answer")
    expect(guestsSummary(g, false)).toBe("Jonas Weber, Alex Kim and 2 others")
    // The reader is "you", last; three are named.
    expect(guestsSummary(eventGuests(meeting([{ user_uuid: "maya", role: "required", response: "accepted" }, { user_uuid: "jonas", role: "required", response: "needs_action" }]), "maya"), false)).toBe("Jonas Weber and you")
    expect(guestsFold(g)).toBe(false)
    const five = eventGuests(meeting([...answered.event_guests!, { user_uuid: "ana", role: "required", response: "accepted" }]), "maya")
    expect(guestsFold(five)).toBe(true)
    expect(guestsSummary(five, false)).toBe("3 going · 1 maybe · 1 not going · 1 no answer")
  })

  it("carries another time a guest proposed on their face, and the reader's own as theirs", () => {
    const p = { start: new Date(2026, 9, 21, 9).toISOString(), end: new Date(2026, 9, 21, 10).toISOString() }
    const g = eventGuests(meeting([
      { user_uuid: "maya", role: "required", response: "tentative", proposal: p },
      { email: "alex@example.com", role: "required", response: "declined", proposal: p },
    ]), "maya")
    expect(g.myProposal).toEqual(p)
    expect(g.faces.find((f) => f.key === "maya")?.proposal).toEqual(p)
    expect(g.faces.find((f) => f.outside)?.proposal).toEqual(p)
    expect(eventGuests(answered, "maya").myProposal).toBeUndefined()
  })

  // The public demo blanks every address its shared visitor could read
  // (helpers/demoPrivacy.go), a guest's by email too, and the organiser's
  // panel said "Guests 1" over "No guests yet.". They show, by the name they
  // were invited by or as "Someone", and two of them stay two.
  it("shows guests by email whose address the server hid", () => {
    const g = eventGuests(meeting([
      { email: "", role: "required", response: "tentative", note: "Could we start earlier?" },
      { email: "", name: "Alex Kim", role: "required", response: "needs_action" },
    ]), "sam")
    expect(g.faces.slice(1).map((f) => [f.name, f.outside, f.email, f.detail])).toEqual([
      ["Someone", true, undefined, undefined],
      ["Alex Kim", true, undefined, undefined],
    ])
    expect(g.faces[1].note).toBe("Could we start earlier?")
    expect(new Set(g.faces.map((f) => f.key)).size).toBe(3)
  })
})

describe("Going? (STEP4_PLAN §4 #5)", () => {
  it("is a radio group named Going?, three words, the answer given chosen in its tint", () => {
    render(<GoingControl answer="tentative" onAnswer={vi.fn()} />)
    const group = screen.getByRole("radiogroup", { name: "Going?" })
    const radios = within(group).getAllByRole("radio")
    expect(radios.map((r) => r.textContent)).toEqual(["Yes", "?Maybe", "No"])
    expect(screen.getByRole("radio", { name: /Maybe/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /Maybe/ }).className).toMatch(/bg-hue-tint/)
    // 28 px under a pointer, 44 under a finger.
    expect(radios[0].className).toMatch(/\bh-7\b/)
    expect(radios[0].className).toMatch(/pointer-coarse:h-11/)
  })

  it("shows the answer at once and sends it", async () => {
    const send = vi.fn().mockResolvedValue(true)
    render(<GoingControl answer="needs_action" onAnswer={send} />)
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }))
    expect(screen.getByRole("radio", { name: /Yes/ }).getAttribute("aria-checked")).toBe("true")
    expect(send).toHaveBeenCalledWith("accepted")
    await waitFor(() => expect(toasts).toHaveLength(0))
  })

  it("springs back when the answer couldn't be sent, and says so with Retry", async () => {
    const send = vi.fn().mockResolvedValue(false)
    render(<GoingControl answer="accepted" onAnswer={send} />)
    fireEvent.click(screen.getByRole("radio", { name: "No" }))
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0].title).toBe("Couldn't send your answer. Try again.")
    expect(toasts[0].action).toBeTruthy()
    expect(screen.getByRole("radio", { name: /Yes/ }).getAttribute("aria-checked")).toBe("true")
  })

  it("springs back quietly when the answer wasn't sent (the question closed)", async () => {
    const send = vi.fn().mockResolvedValue(null)
    render(<GoingControl answer="accepted" onAnswer={send} />)
    fireEvent.click(screen.getByRole("radio", { name: "No" }))
    await waitFor(() => expect(screen.getByRole("radio", { name: /Yes/ }).getAttribute("aria-checked")).toBe("true"))
    expect(toasts).toHaveLength(0)
  })

  it("moves the answer with the arrows, and is 44 px on the phone's sheet", () => {
    const send = vi.fn().mockResolvedValue(true)
    render(<GoingControl answer="accepted" onAnswer={send} touch />)
    fireEvent.keyDown(screen.getByRole("radio", { name: /Yes/ }), { key: "ArrowRight" })
    expect(send).toHaveBeenCalledWith("tentative")
    expect(screen.getByRole("radio", { name: "No" }).className).toMatch(/\bh-11\b/)
  })
})

describe("the guests' faces", () => {
  const faces = (n: number): FaceGuest[] => [
    { key: "sam", name: "Sam Rivera", seed: "sam", response: "accepted", organiser: true },
    ...["Maya Chen", "Jonas Weber", "Lee Park", "Ana Silva", "Alex Kim"].slice(0, n).map((name, i) => ({ key: name, name, seed: name, response: i % 2 ? "needs_action" : "accepted" })),
  ]

  it("names each face by its answer, with a mark for those who gave one", () => {
    render(<GuestFaces guests={faces(2)} summary="Maya Chen and Jonas Weber" />)
    expect(screen.getByRole("img", { name: "Sam Rivera, organiser" })).toBeTruthy()
    expect(screen.getByRole("img", { name: "Maya Chen, going" }).querySelector("[data-answer-mark=accepted]")).toBeTruthy()
    expect(screen.getByRole("img", { name: "Jonas Weber, no answer yet" }).querySelector("[data-answer-mark]")).toBeNull()
  })

  it("folds above four guests to faces and the counts, and opens to the list", () => {
    render(<GuestFaces guests={faces(5)} summary="4 going · 2 no answer" />)
    expect(screen.getAllByRole("img")).toHaveLength(4)
    const more = screen.getByRole("button", { name: "4 going · 2 no answer" })
    expect(more.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(more)
    const list = screen.getByRole("list", { name: "Guests and their answers" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(6)
    expect(within(list).getAllByRole("listitem")[0].textContent).toMatch(/organiser$/)
  })
})

describe("the guests in the panel", () => {
  it("shows the organiser who said what, asks again, copies a guest's link and says an invitation wasn't emailed", () => {
    const nudge = vi.fn()
    const copy = vi.fn()
    const email = vi.fn()
    render(<EventGuestList guests={eventGuests(answered, "sam")} organiser ended={false} onNudge={nudge} onCopyLink={copy} emailOnAnswers={false} onEmailOnAnswers={email} />)
    expect(screen.getByText("2 going · 1 maybe · 1 not going · 1 no answer")).toBeTruthy()
    // Everyone listed is counted, the organiser too, as the counts count them.
    expect(screen.getByRole("heading", { name: /Guests/ }).textContent).toBe("Guests5")
    fireEvent.click(screen.getByRole("button", { name: "Ask again" }))
    expect(nudge).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Copy Alex Kim's answer link" }))
    expect(copy).toHaveBeenCalledWith("alex@example.com", "Alex Kim")
    expect(screen.getByText(INVITE_WORDS.not_sent)).toBeTruthy()
    expect(screen.getByText("“Ten minutes late”")).toBeTruthy()
    fireEvent.click(screen.getByRole("switch"))
    expect(email).toHaveBeenCalledWith(true)
  })

  it("asks nobody again once the event is over, and shows a guest no organiser's tools", () => {
    const { rerender } = render(<EventGuestList guests={eventGuests(answered, "sam")} organiser ended onNudge={vi.fn()} onCopyLink={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull()
    rerender(<EventGuestList guests={eventGuests(answered, "maya")} organiser={false} ended={false} onNudge={vi.fn()} onCopyLink={vi.fn()} onEmailOnAnswers={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull()
    expect(screen.queryByRole("button", { name: /answer link/ })).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText(INVITE_WORDS.not_sent)).toBeNull()
    expect(screen.queryByText(/going · /)).toBeNull()
  })

  it("shows a guest's proposed time, which whoever may change the event uses or dismisses", async () => {
    const p = { start: new Date(2026, 9, 21, 9).toISOString(), end: new Date(2026, 9, 21, 10).toISOString() }
    const ev = meeting([{ user_uuid: "maya", role: "required", response: "tentative", proposal: p }, { user_uuid: "jonas", role: "required", response: "accepted" }])
    const use = vi.fn().mockResolvedValue(undefined)
    const dismiss = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<EventGuestList guests={eventGuests(ev, "sam")} organiser ended={false} onUseProposal={use} onDismissProposal={dismiss} />)
    // Drawn once its chunk is in.
    const row = (await screen.findByText(/^Proposes/)).closest<HTMLElement>("[data-guest-proposal]")!
    expect(row.textContent).toMatch(/^Proposes Wed 21 Oct, 9:00\sAM – 10:00\sAM/)
    fireEvent.click(within(row).getByRole("button", { name: "Use this time" }))
    await waitFor(() => expect(use).toHaveBeenCalledWith(p))
    fireEvent.click(within(row).getByRole("button", { name: "Dismiss Maya Chen's proposal" }))
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ key: "maya", proposal: p })))
    // Read without the right to change the event: the time, with no way to use or dismiss it.
    rerender(<EventGuestList guests={eventGuests(ev, "jonas")} organiser={false} ended={false} />)
    expect(document.querySelector("[data-guest-proposal]")?.textContent).toMatch(/^Proposes Wed 21 Oct/)
    expect(screen.queryByRole("button", { name: "Use this time" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull()
    // The proposer's own is with their answer, where they take it back, not on their row.
    rerender(<EventGuestList guests={eventGuests(ev, "maya")} organiser={false} ended={false} />)
    expect(document.querySelector("[data-guest-proposal]")).toBeNull()
  })

  it("uses a hidden address's proposal, with no dismissing, copying or emailing that needs the address", async () => {
    const p = { start: new Date(2026, 9, 21, 9).toISOString(), end: new Date(2026, 9, 21, 10).toISOString() }
    const ev = meeting([{ email: "", role: "required", response: "tentative", invite: "not_sent", proposal: p }])
    render(<EventGuestList guests={eventGuests(ev, "sam")} organiser ended={false} onCopyLink={vi.fn()} onUseProposal={vi.fn().mockResolvedValue(undefined)} onDismissProposal={vi.fn()} />)
    const row = (await screen.findByText(/^Proposes/)).closest<HTMLElement>("[data-guest-proposal]")!
    expect(within(row).getByRole("button", { name: "Use this time" })).toBeTruthy()
    expect(within(row).queryByRole("button", { name: /^Dismiss/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /answer link/ })).toBeNull()
    expect(screen.queryByText(/Copy their link/)).toBeNull()
  })
})

describe("a guest's own answer in the panel", () => {
  it("takes a note once they have answered, saved with the answer when the field is left", async () => {
    const send = vi.fn().mockResolvedValue(true)
    const { rerender } = render(<YourAnswer answer="needs_action" note={undefined} organiserName="Sam Rivera" onAnswer={send} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    rerender(<YourAnswer answer="tentative" note="" organiserName="Sam Rivera" onAnswer={send} />)
    const note = screen.getByRole("textbox", { name: "Your note with your answer" })
    expect(note.getAttribute("placeholder")).toBe("Add a note for Sam Rivera")
    fireEvent.change(note, { target: { value: " Ten minutes late " } })
    fireEvent.blur(note)
    await waitFor(() => expect(send).toHaveBeenCalledWith("tentative", "Ten minutes late"))
  })

  it("puts the note back on Escape, and sends nothing for a note unchanged", () => {
    const send = vi.fn().mockResolvedValue(true)
    render(<YourAnswer answer="accepted" note="See you" organiserName="Sam Rivera" onAnswer={send} />)
    const note = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(note, { target: { value: "Late" } })
    fireEvent.keyDown(note, { key: "Escape" })
    expect(note.value).toBe("See you")
    fireEvent.blur(note)
    expect(send).not.toHaveBeenCalled()
  })

  const from = { start: new Date(2026, 9, 21, 14), end: new Date(2026, 9, 21, 15) }

  it("reads a proposed time as instants from its day and times on the reader's clock, and none while it's incomplete or backwards", () => {
    expect(proposalOf("2026-10-28", "14:00", "14:45")).toEqual({ start: new Date(2026, 9, 28, 14).toISOString(), end: new Date(2026, 9, 28, 14, 45).toISOString() })
    expect(proposalOf("", "14:00", "15:00")).toBeNull()
    expect(proposalOf("2026-10-28", "", "15:00")).toBeNull()
    expect(proposalOf("2026-10-28", "15:00", "15:00")).toBeNull()
    expect(proposalOf("2026-10-28", "15:00", "09:00")).toBeNull()
  })

  it("proposes another time with the answer, the event's own to begin with, and takes it back", async () => {
    const send = vi.fn().mockResolvedValue(true)
    const { rerender } = render(<YourAnswer answer="tentative" note="" organiserName="Sam Rivera" onAnswer={send} proposeFrom={from} />)
    fireEvent.click(screen.getByRole("button", { name: "Propose a new time" }))
    const form = await screen.findByRole("group", { name: "Propose a new time" })
    const field = (name: string) => within(form).getByRole("textbox", { name }) as HTMLInputElement
    expect([field("Day").value, field("From").value, field("Until").value]).toEqual(["2026-10-21", "14:00", "15:00"])
    fireEvent.change(field("Day"), { target: { value: "2026-10-22" } })
    fireEvent.change(field("From"), { target: { value: "09:30" } })
    fireEvent.change(field("Until"), { target: { value: "10:30" } })
    fireEvent.click(within(form).getByRole("button", { name: "Propose" }))
    const p = { start: new Date(2026, 9, 22, 9, 30).toISOString(), end: new Date(2026, 9, 22, 10, 30).toISOString() }
    await waitFor(() => expect(send).toHaveBeenCalledWith("tentative", undefined, p))
    await waitFor(() => expect(screen.queryByRole("group", { name: "Propose a new time" })).toBeNull())
    // Once it stands, it shows with the answer, until it's used, dismissed or the event moves.
    rerender(<YourAnswer answer="tentative" note="" organiserName="Sam Rivera" onAnswer={send} proposeFrom={from} proposal={p} />)
    await waitFor(() => expect(document.querySelector("[data-your-proposal]")?.textContent).toMatch(/^You proposed Thu 22 Oct, 9:30\sAM – 10:30\sAM/))
    expect(screen.queryByRole("button", { name: "Propose a new time" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Take it back" }))
    await waitFor(() => expect(send).toHaveBeenLastCalledWith("tentative", undefined, null))
  })

  it("keeps the form when the time didn't go, sends no time that ends first, and offers none where the event takes none", async () => {
    const send = vi.fn().mockResolvedValue(false)
    const { rerender } = render(<YourAnswer answer="accepted" note="" organiserName="Sam Rivera" onAnswer={send} proposeFrom={from} />)
    fireEvent.click(screen.getByRole("button", { name: "Propose a new time" }))
    const form = await screen.findByRole("group", { name: "Propose a new time" })
    fireEvent.change(within(form).getByRole("textbox", { name: "Until" }), { target: { value: "13:00" } })
    expect(within(form).getByRole("alert").textContent).toBe("Pick a time that ends after it starts.")
    fireEvent.click(within(form).getByRole("button", { name: "Propose" }))
    expect(send).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByRole("textbox", { name: "Until" }), { target: { value: "16:00" } })
    fireEvent.click(within(form).getByRole("button", { name: "Propose" }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    // Its sender said why: the time stays to change or send again.
    expect(screen.getByRole("group", { name: "Propose a new time" })).toBeTruthy()
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("group", { name: "Propose a new time" })).toBeNull()
    // All day, a whole series or over (no proposeFrom), or not answered yet: no way to propose.
    rerender(<YourAnswer answer="accepted" note="" organiserName="Sam Rivera" onAnswer={send} />)
    expect(screen.queryByRole("button", { name: "Propose a new time" })).toBeNull()
    rerender(<YourAnswer answer="needs_action" note="" organiserName="Sam Rivera" onAnswer={send} proposeFrom={from} />)
    expect(screen.queryByRole("button", { name: "Propose a new time" })).toBeNull()
  })
})

describe("sending an answer from the card", () => {
  const list = (events: CalendarEventInterface[]): GetEventsResponse => ({ data: events })
  const series = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d"
  const inst = (day: string): CalendarEventInterface => meeting([{ user_uuid: "maya", role: "required", response: "needs_action" }], { event_uuid: `${series}_202610${day}T090000Z` })

  it("shows the answer in the instance alone, or in every instance of the series for all", () => {
    const cur = list([inst("20"), inst("27"), meeting([{ user_uuid: "maya", role: "required", response: "needs_action" }])])
    const one = withAnswer(cur, cur.data[0], "maya", "declined", "this")!
    expect(one.data.map((e) => e.event_guests![0].response)).toEqual(["declined", "needs_action", "needs_action"])
    const all = withAnswer(cur, cur.data[0], "maya", "accepted", "all")!
    expect(all.data.map((e) => e.event_guests![0].response)).toEqual(["accepted", "accepted", "needs_action"])
  })

  it("asks which events an instance's answer is for, and sends nothing when the question is closed", async () => {
    const makeRequest = vi.fn().mockResolvedValue({})
    const mutateEvents = vi.fn()
    const askScope = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("all")
    const sender = { post: { makeRequest }, askScope, mutateEvents, selfId: "maya" }
    expect(await sendAnswer(sender as never, inst("20"), "accepted")).toBeNull()
    expect(makeRequest).not.toHaveBeenCalled()
    expect(await sendAnswer(sender as never, inst("20"), "accepted")).toBe(true)
    expect(askScope).toHaveBeenCalledWith("answer")
    // A tap: no note, so the guest's note stays as it was.
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ appendToUrl: `/${series}_20261020T090000Z/answer`, payload: { answer: "accepted", scope: "all" } }))
    expect(mutateEvents).toHaveBeenCalledTimes(2)
  })

  it("says an answer that couldn't be sent, and reads the calendar again", async () => {
    const makeRequest = vi.fn().mockRejectedValue(new Error("offline"))
    const mutateEvents = vi.fn()
    const ok = await sendAnswer({ post: { makeRequest }, mutateEvents, selfId: "maya" } as never, answered, "declined", "Clash")
    expect(ok).toBe(false)
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { answer: "declined", scope: "all", note: "Clash" } }))
    expect(mutateEvents).toHaveBeenLastCalledWith()
  })

  it("sends another time for an instance alone, unasked, says a refusal in the server's words, and {} takes it back", async () => {
    const makeRequest = vi.fn().mockResolvedValue({})
    const askScope = vi.fn()
    const sender = { post: { makeRequest }, askScope, mutateEvents: vi.fn(), selfId: "maya" }
    const p = { start: new Date(2026, 9, 21, 9).toISOString(), end: new Date(2026, 9, 21, 10).toISOString() }
    expect(await sendAnswer(sender as never, inst("20"), "tentative", undefined, p)).toBe(true)
    expect(askScope).not.toHaveBeenCalled()
    expect(makeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { answer: "tentative", scope: "this", proposal: p }, showErrorToast: true, failureTitle: "Couldn't propose that time" }))
    expect(await sendAnswer(sender as never, inst("20"), "tentative", undefined, null)).toBe(true)
    expect(makeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { answer: "tentative", scope: "this", proposal: {} }, failureTitle: "Couldn't take your proposal back" }))
    // A single event's is for all of it; an answer alone stays quiet, its control saying itself.
    await sendAnswer(sender as never, answered, "accepted", undefined, p)
    expect(makeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { answer: "accepted", scope: "all", proposal: p } }))
    await sendAnswer(sender as never, answered, "accepted")
    expect(makeRequest).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { answer: "accepted", scope: "all" }, quiet: true }))
    expect(askScope).not.toHaveBeenCalled()
  })
})

describe("Tell guests? (D-CAL-5)", () => {
  const start = new Date(2026, 9, 20, 14)
  const end = new Date(2026, 9, 20, 15)
  const was: EventShape = { title: "Launch review", notes: "", start, end, rule: "", guests: { members: ["maya"], emails: ["alex@example.com"] } }

  it("asks guests who stay of a change to the meeting, a guest taken off, and only new guests for an invitation", () => {
    expect(tellOf(was, { ...was, title: "Launch review, moved" })).toBe("change")
    expect(tellOf(was, { ...was, start: new Date(2026, 9, 20, 15), end: new Date(2026, 9, 20, 16) })).toBe("change")
    expect(tellOf(was, { ...was, guests: { members: [], emails: ["alex@example.com"] } })).toBe("change")
    expect(tellOf(was, { ...was, guests: { members: ["maya", "jonas"], emails: ["ALEX@example.com"] } })).toBe("invite")
    expect(tellOf(was, { ...was })).toBeNull()
    expect(tellOf({ ...was, guests: { members: [], emails: [] } }, { ...was, title: "x", guests: { members: [], emails: [] } })).toBeNull()
    expect(sameGuests(was.guests, { members: ["maya"], emails: [" Alex@Example.com"] })).toBe(true)
  })

  it("sends, doesn't send, or goes back", () => {
    const done = vi.fn()
    render(<TellGuestsPrompt action="change" onDone={done} />)
    expect(screen.getByRole("heading", { name: "Send an update to your guests?" })).toBeTruthy()
    expect(document.activeElement?.textContent).toBe("Send")
    fireEvent.click(screen.getByRole("button", { name: "Don't send" }))
    expect(done).toHaveBeenCalledWith("none")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(done).toHaveBeenCalledWith("send")
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    })
    expect(done).toHaveBeenLastCalledWith(null)
  })
})

describe("answering a repeating event", () => {
  it("offers this event or all of them: an answer has no and following", () => {
    const done = vi.fn()
    render(<ScopePrompt action="answer" onDone={done} />)
    expect(screen.getAllByRole("radio").map((c) => c.closest("div")?.textContent)).toEqual(["This event", "All events"])
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(done).toHaveBeenCalledWith("this")
  })
})
