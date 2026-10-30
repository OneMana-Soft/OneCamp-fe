import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CallActivities, CallPollView, CallQuestionView } from "@/lib/calls/activities"
import { pinTestClock } from "@/lib/testing/testClock"

const readActivities = vi.fn()
const doActivity = vi.fn()
vi.mock("@/services/callActivitiesService", () => ({
  readActivities: (...a: unknown[]) => readActivities(...a),
  doActivity: (...a: unknown[]) => doActivity(...a),
}))

import CallActivitiesPanel from "./CallActivitiesPanel"
import { CALL_PANEL_FOOT } from "./sidePanel"

// Polls and Q&A in a call (calls package A, "Ask the room"): whoever runs the
// call starts and ends polls, shares held-back results and runs Q&A; everyone
// votes, asks and upvotes. The panel draws what the server's view allows.

pinTestClock(new Date("2026-10-26T09:30:00Z"))

const room = { on: () => undefined, off: () => undefined }
const poll = (o: Partial<CallPollView> = {}): CallPollView => ({
  id: "p1",
  question: "Ship the annual toggle first?",
  multiple: false,
  options: [
    { id: "o1", text: "Yes", votes: 3 },
    { id: "o2", text: "No", votes: 1 },
  ],
  voters: 4,
  mine: [],
  closed: false,
  can_close: false,
  ...o,
})
const question = (o: Partial<CallQuestionView> = {}): CallQuestionView => ({ id: "q1", text: "Will the recording be shared?", asker: "Jo Park", votes: 2, state: "open", at: "2026-10-26T09:20:00Z", ...o })
const activities = (o: Partial<CallActivities> = {}): CallActivities => ({ polls: [], questions: [], qa: { open: false, shown: "all", anonymous: false }, runs: false, ...o })
const reads = (...views: CallActivities[]) => {
  for (const v of views.slice(0, -1)) readActivities.mockResolvedValueOnce({ kind: "read", activities: v })
  readActivities.mockResolvedValue({ kind: "read", activities: views[views.length - 1] })
}
const open = async (who: { sessionId: string } | { callToken: string } = { sessionId: "s1" }) => {
  const r = render(<CallActivitiesPanel who={who} room={room as never} onClose={() => {}} />)
  await screen.findByRole("tablist")
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading polls and questions" })).toBeNull())
  return r
}
const tab = (name: "Polls" | "Questions") => screen.getByRole("tab", { name: new RegExp(`^${name}`) })

beforeEach(() => {
  readActivities.mockReset()
  doActivity.mockReset()
  doActivity.mockResolvedValue({ ok: true, id: "" })
})
afterEach(() => cleanup())

describe("what a participant sees", () => {
  it("votes with one click, and sees counts only once results aren't held back", async () => {
    reads(activities({ polls: [poll(), poll({ id: "p2", question: "Which day?", results_hidden: true, anonymous: true, voters: 0, options: [{ id: "a", text: "Friday", votes: 0 }, { id: "b", text: "Monday", votes: 0 }] })] }))
    await open()
    expect(screen.queryByRole("button", { name: "New poll" })).toBeNull()
    const held = screen.getByRole("region", { name: "Poll: Which day?" })
    // Held back is said once, by the note under the options (DESIGN-BUILD-19, 26 Oct).
    expect(within(held).queryByText("Results held back")).toBeNull()
    expect(within(held).getByText("Anonymous")).toBeTruthy()
    expect(within(held).getByText("The people running the call share the results when the poll is done.")).toBeTruthy()
    expect(within(held).queryByText(/·/)).toBeNull()
    const shown = screen.getByRole("region", { name: "Poll: Ship the annual toggle first?" })
    expect(within(shown).getByText("4 people voted")).toBeTruthy()
    fireEvent.click(within(shown).getByRole("button", { name: /^Yes/ }))
    await waitFor(() => expect(doActivity).toHaveBeenCalledWith({ sessionId: "s1" }, { op: "vote", id: "p1", options: ["o1"] }))
    expect(within(shown).queryByRole("button", { name: "End poll" })).toBeNull()
  })

  it("is told Q&A isn't open yet, with nothing to ask in", async () => {
    reads(activities())
    await open()
    fireEvent.click(tab("Questions"))
    expect(screen.getByText("The people running the call haven't opened questions yet. When they do, ask here.")).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Ask a question" })).toBeNull()
  })

  it("asks with Enter, plain or anonymous where the call allows it, and never sends an empty question", async () => {
    reads(activities({ qa: { open: true, shown: "all", anonymous: true } }))
    doActivity.mockResolvedValueOnce({ ok: true, id: "q9" })
    await open({ callToken: "tok" })
    expect(screen.getByRole("tab", { name: /^Questions/ })).toHaveAttribute("aria-selected", "true")
    const box = screen.getByRole("textbox", { name: "Ask a question" })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(screen.getByRole("alert").textContent).toBe("Write your question first.")
    fireEvent.change(box, { target: { value: "  Is it recorded?  " } })
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
    expect(doActivity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("switch", { name: "Ask anonymously" }))
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(doActivity).toHaveBeenCalledWith({ callToken: "tok" }, { op: "ask", text: "Is it recorded?", anonymous: true }))
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""))
  })

  // CODE-REVIEWER-53's MF1 (26 Oct): anonymous asks turned off while your switch was on are the server's to refuse; the
  // ask never goes out under your name, and the switch starts off again, so the next ask is chosen.
  it("never asks under your name when anonymous asks are turned off while your switch is on", async () => {
    reads(activities({ qa: { open: true, shown: "all", anonymous: true } }), activities({ qa: { open: true, shown: "all", anonymous: false } }))
    doActivity.mockResolvedValueOnce({ ok: false, msg: "Anonymous questions are off in this call.", tooFast: false, gone: false })
    const on: Record<string, () => void> = {}
    const live = { on: (e: string, h: () => void) => (on[e] = h), off: () => undefined }
    render(<CallActivitiesPanel who={{ sessionId: "s1" }} room={live as never} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("switch", { name: "Ask anonymously" }))
    // The host turns anonymous asks off: the call's view says so, and the switch goes.
    await act(async () => on.reconnected())
    await waitFor(() => expect(screen.queryByRole("switch", { name: "Ask anonymously" })).toBeNull())
    const box = screen.getByRole("textbox", { name: "Ask a question" })
    fireEvent.change(box, { target: { value: "Is it recorded?" } })
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(doActivity).toHaveBeenCalledWith({ sessionId: "s1" }, { op: "ask", text: "Is it recorded?", anonymous: true }))
    expect((await screen.findByRole("alert")).textContent).toBe("Anonymous questions are off in this call.")
    doActivity.mockResolvedValueOnce({ ok: true, id: "q9" })
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "ask", text: "Is it recorded?", anonymous: false }))
  })

  it("upvotes at once, and takes it back when the server refuses", async () => {
    reads(activities({ qa: { open: true, shown: "all", anonymous: false }, questions: [question()] }))
    let refuse!: (v: unknown) => void
    doActivity.mockImplementationOnce(() => new Promise((r) => (refuse = r)))
    await open()
    const upvote = screen.getByRole("button", { name: "Upvote, 2 upvotes" })
    fireEvent.click(upvote)
    expect(screen.getByRole("button", { name: "Upvote, 3 upvotes" })).toHaveAttribute("aria-pressed", "true")
    // A second press while it's sent does nothing.
    fireEvent.click(screen.getByRole("button", { name: "Upvote, 3 upvotes" }))
    expect(doActivity).toHaveBeenCalledTimes(1)
    expect(doActivity).toHaveBeenCalledWith({ sessionId: "s1" }, { op: "upvote", id: "q1", on: true })
    await act(async () => refuse({ ok: false, msg: "Slow down a little.", tooFast: true, gone: false }))
    expect(screen.getByRole("button", { name: "Upvote, 2 upvotes" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("alert").textContent).toBe("Slow down a little.")
  })

  it("says the activities are for the people in the call once they're refused", async () => {
    readActivities.mockResolvedValue({ kind: "refused" })
    render(<CallActivitiesPanel who={{ sessionId: "s1" }} room={room as never} onClose={() => {}} />)
    expect(await screen.findByText("Polls and questions are for the people in this call. Join it again to see them.")).toBeTruthy()
  })

  it("says a trouble that passes, with Try again", async () => {
    readActivities.mockResolvedValueOnce({ kind: "unreachable" })
    reads(activities())
    render(<CallActivitiesPanel who={{ sessionId: "s1" }} room={room as never} onClose={() => {}} />)
    expect(await screen.findByText("Couldn't reach the server, retrying…")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.queryByText("Couldn't reach the server, retrying…")).toBeNull())
    expect(screen.getByText("No polls yet")).toBeTruthy()
  })
})

describe("what whoever runs the call does", () => {
  it("starts a poll checked as the server checks it, and keeps the form with the server's words when it's refused", async () => {
    reads(activities({ runs: true }))
    doActivity.mockResolvedValueOnce({ ok: false, msg: "This call has 50 polls already.", tooFast: false, gone: false }).mockResolvedValueOnce({ ok: true, id: "p9" })
    await open()
    fireEvent.click(screen.getByRole("button", { name: "New poll" }))
    const form = screen.getByRole("form", { name: "New poll" })
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    expect(within(form).getByRole("alert").textContent).toBe("Write the question first.")
    expect(doActivity).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByRole("textbox", { name: "Question" }), { target: { value: "Ship on Friday?" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "Option 1" }), { target: { value: "Yes" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "Option 2" }), { target: { value: "No" } })
    fireEvent.click(within(form).getByRole("switch", { name: /^Anonymous votes/ }))
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    const sent = { op: "poll", poll: { question: "Ship on Friday?", options: ["Yes", "No"], multiple: false, anonymous: true, hide_results: false } }
    await waitFor(() => expect(within(form).getByRole("alert").textContent).toBe("This call has 50 polls already."))
    expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, sent)
    fireEvent.click(screen.getByRole("button", { name: "Start poll" }))
    await waitFor(() => expect(screen.queryByRole("form", { name: "New poll" })).toBeNull())
    expect(doActivity).toHaveBeenCalledTimes(2)
  })

  it("keeps a poll half written while the panel is shut", async () => {
    reads(activities({ runs: true }))
    const first = await open({ sessionId: "s-kept" })
    fireEvent.click(screen.getByRole("button", { name: "New poll" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "Lunch at one?" } })
    first.unmount()
    await open({ sessionId: "s-kept" })
    expect((screen.getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement).value).toBe("Lunch at one?")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    cleanup()
    await open({ sessionId: "s-kept" })
    expect(screen.queryByRole("form", { name: "New poll" })).toBeNull()
  })

  it("ends a poll and shares its held-back results, one press at a time", async () => {
    reads(activities({ runs: true, polls: [poll({ results_hidden: true, can_close: true })] }))
    let ended!: (v: unknown) => void
    doActivity.mockImplementationOnce(() => new Promise((r) => (ended = r)))
    await open()
    const card = screen.getByRole("region", { name: "Poll: Ship the annual toggle first?" })
    expect(within(card).getByText("Results held back until you share them")).toBeTruthy()
    expect(within(card).getByText("4 people voted")).toBeTruthy()
    fireEvent.click(within(card).getByRole("button", { name: "End poll" }))
    expect(within(card).getByRole("button", { name: "End poll" })).toHaveAttribute("aria-busy", "true")
    expect(within(card).getByRole("button", { name: "Share results" })).toBeDisabled()
    fireEvent.click(within(card).getByRole("button", { name: "End poll" }))
    expect(doActivity).toHaveBeenCalledTimes(1)
    await act(async () => ended({ ok: true, id: "" }))
    fireEvent.click(within(card).getByRole("button", { name: "Share results" }))
    await waitFor(() => expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "share_results", id: "p1" }))
    expect(doActivity).toHaveBeenNthCalledWith(1, { sessionId: "s1" }, { op: "close_poll", id: "p1" })
  })

  it("runs Q&A: its switches move at once and send the whole setting, and who sees which questions", async () => {
    // The read after the change answers with it.
    reads(activities({ runs: true, qa: { open: false, shown: "all", anonymous: false } }), activities({ runs: true, qa: { open: true, shown: "all", anonymous: false } }))
    await open()
    fireEvent.click(tab("Questions"))
    const opened = screen.getByRole("switch", { name: /^Questions open/ })
    fireEvent.click(opened)
    expect(opened).toHaveAttribute("aria-checked", "true")
    expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "qa", qa: { open: true, shown: "all", anonymous: false } })
    // Once the change is in and read back, the next one goes.
    await waitFor(() => expect(readActivities).toHaveBeenCalledTimes(2))
    await act(async () => {})
    fireEvent.click(screen.getByRole("radio", { name: "Answered only" }))
    expect(screen.getByRole("radio", { name: "Answered only" })).toHaveAttribute("aria-checked", "true")
    await waitFor(() => expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "qa", qa: { open: true, shown: "answered", anonymous: false } }))
  })

  it("marks, pins and dismisses a question, and can take the dismissal back", async () => {
    reads(activities({ runs: true, qa: { open: true, shown: "all", anonymous: true }, questions: [question({ anonymous: true, asker: undefined })] }))
    await open()
    const card = screen.getByRole("region", { name: "Question: Will the recording be shared?" })
    expect(within(card).getByText("Anonymous")).toBeTruthy()
    // The card's other actions wait while one is sent.
    const settled = () => waitFor(() => expect(within(card).getByRole("button", { name: "Dismiss" })).not.toBeDisabled())
    fireEvent.click(within(card).getByRole("button", { name: "Answered" }))
    expect(within(card).getByRole("button", { name: "Pin" })).toBeDisabled()
    expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "question", id: "q1", state: "answered" })
    await settled()
    fireEvent.click(within(card).getByRole("button", { name: "Pin" }))
    expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "question", id: "q1", pinned: true })
    await waitFor(() => expect(within(card).getByRole("button", { name: "Answered" })).not.toBeDisabled())
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }))
    expect(await screen.findByText("Question dismissed for everyone.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(doActivity).toHaveBeenLastCalledWith({ sessionId: "s1" }, { op: "question", id: "q1", state: "open" }))
    await waitFor(() => expect(screen.queryByText("Question dismissed for everyone.")).toBeNull())
  })
})

describe("the tab it opens on", () => {
  it("is a poll still taking votes, else open Q&A, and it stays put when that poll ends", async () => {
    const qaOpen = { open: true, shown: "all" as const, anonymous: false }
    reads(activities({ qa: qaOpen, polls: [poll()] }), activities({ qa: qaOpen, polls: [poll({ closed: true })] }))
    await open()
    expect(tab("Polls")).toHaveAttribute("aria-selected", "true")
    expect(tab("Polls").textContent).toContain("1")
    fireEvent.click(within(screen.getByRole("region", { name: "Poll: Ship the annual toggle first?" })).getByRole("button", { name: /^No/ }))
    await waitFor(() => expect(screen.getByText("Ended")).toBeTruthy())
    expect(tab("Polls")).toHaveAttribute("aria-selected", "true")
  })
})

describe("DESIGN-BUILD-19's review (26 Oct)", () => {
  it("counts what's open in neutral, and says when one waits on you", async () => {
    reads(activities({ polls: [poll({ mine: ["o1"] }), poll({ id: "p2", question: "Which day?" })], questions: [question()] }))
    const first = await open()
    expect(tab("Polls").textContent).toContain("2")
    expect(tab("Polls").textContent).toContain("one waits for your vote")
    // A participant's open question waits on whoever runs the call, not on them.
    expect(tab("Questions").textContent).not.toContain("waits")
    first.unmount()
    reads(activities({ polls: [poll({ mine: ["o1"] })] }))
    await open()
    expect(tab("Polls").textContent).not.toContain("waits")
  })

  it("tells whoever runs the call that a question waits for an answer", async () => {
    reads(activities({ runs: true, qa: { open: true, shown: "all", anonymous: false }, questions: [question()] }))
    await open()
    expect(tab("Questions").textContent).toContain("one waits for an answer")
  })

  it("chooses who sees which questions on its own row, with the shared segmented control", async () => {
    reads(activities({ runs: true, qa: { open: true, shown: "all", anonymous: false } }))
    await open()
    fireEvent.click(tab("Questions"))
    const shown = screen.getByRole("radiogroup", { name: "People see" })
    expect(shown).toHaveAttribute("data-segmented")
    expect(within(shown).getAllByRole("radio").map((r) => r.textContent)).toEqual(["All questions", "Answered only"])
  })

  it("keeps the question box's foot clear of a phone's home indicator, with the chat's own foot", async () => {
    reads(activities({ qa: { open: true, shown: "all", anonymous: true } }))
    await open()
    fireEvent.click(tab("Questions"))
    expect(screen.getByRole("textbox", { name: "Ask a question" }).closest("form")?.className).toBe(CALL_PANEL_FOOT)
  })

  it("keeps whoever runs the call's question actions in one row: the answer named, pin and dismiss as named icons", async () => {
    reads(activities({ runs: true, qa: { open: true, shown: "all", anonymous: false }, questions: [question()] }))
    await open()
    fireEvent.click(tab("Questions"))
    const card = screen.getByRole("region", { name: "Question: Will the recording be shared?" })
    expect(within(card).getByRole("button", { name: "Answered" }).textContent).toBe("Answered")
    for (const name of ["Pin", "Dismiss"]) expect(within(card).getByRole("button", { name }).textContent, name).toBe("")
  })

  it("says a poll's rules in one quiet line beside its state", async () => {
    reads(activities({ polls: [poll({ anonymous: true, multiple: true })] }))
    await open()
    const card = screen.getByRole("region", { name: "Poll: Ship the annual toggle first?" })
    expect(within(card).getByText("Anonymous · choose any")).toBeTruthy()
    expect(within(card).queryByText("Choose any")).toBeNull()
  })

  it("keeps Start poll in the tab's foot, not at the end of what scrolls", async () => {
    reads(activities({ runs: true }))
    await open()
    fireEvent.click(screen.getByRole("button", { name: "New poll" }))
    const form = screen.getByRole("form", { name: "New poll" })
    const start = screen.getByRole("button", { name: "Start poll" })
    expect(form.contains(start)).toBe(false)
    expect(start.getAttribute("form")).toBe(form.id)
  })
})
