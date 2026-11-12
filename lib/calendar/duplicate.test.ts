import { describe, expect, it, vi } from "vitest"
import { copiedFiles, duplicateOf } from "./duplicate"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const SAM = { user_uuid: "sam", user_name: "Sam Rivera" }
const MAYA = { user_uuid: "maya", user_name: "Maya Chen" }
const review = (description: string): CalendarEventInterface => ({
  event_uuid: "e1",
  event_title: "Design review",
  event_description: description,
  event_start_time: "2026-10-15T10:00:00.000Z",
  event_end_time: "2026-10-15T11:00:00.000Z",
  event_participants: [SAM, MAYA] as CalendarEventInterface["event_participants"],
})

// EV-58: Duplicate copies an event as Google's does, but never its call link.
describe("a copy of an event", () => {
  it("keeps its title, times, kind and guests, but not you as your own guest", () => {
    const copy = duplicateOf({ ...review(""), event_is_focus: true }, null, "sam")
    expect(copy).toMatchObject({ title: "Design review", isFocus: true, isAway: false, guests: [{ uuid: "maya", name: "Maya Chen" }] })
    expect(copy.start.toISOString()).toBe("2026-10-15T10:00:00.000Z")
    expect(copy.end.toISOString()).toBe("2026-10-15T11:00:00.000Z")
  })

  it("keeps a task block's task, so the copy is time for it too", () => {
    const task = { task_uuid: "t-brief", task_name: "Write the launch brief", task_status: "todo", project_uuid: "p1", project_name: "Launch" }
    expect(duplicateOf({ ...review(""), event_participants: [], event_task: task }, null, "sam")).toMatchObject({ task, guests: [] })
    expect(duplicateOf(review(""), null, "sam").task).toBeUndefined()
  })

  it("keeps its notes without the call link, written plain or as a link", () => {
    const call = "https://meet.example.com/abc-defg?pwd=1&amp;x=2"
    expect(duplicateOf(review(`Agenda first\n${call}\nBring numbers`), call).description).toBe("Agenda first\n\nBring numbers")
    expect(duplicateOf(review(`<p>Agenda</p><p><a href="${call}" rel="noopener">${call}</a></p>`), call).description).toBe("<p>Agenda</p>")
    expect(duplicateOf(review("<p>Agenda</p>"), null).description).toBe("<p>Agenda</p>")
  })

  it("keeps a Google all-day event on its dates", () => {
    const copy = duplicateOf({ ...review(""), event_all_day: true, event_start_date: "2026-10-15", event_end_date: "2026-10-16" }, null)
    expect(copy.start).toEqual(new Date(2026, 9, 15))
    expect(copy.end).toEqual(new Date(2026, 9, 16))
  })
})

// Calendar head B (gcal-1a): a copy keeps the event's own colour, and its files as far as the copier may open them.
describe("a copy's colour and files", () => {
  it("keeps its own colour, a camp hue or one of its own, and none when it had none", () => {
    expect(duplicateOf({ ...review(""), event_hue: "#1a73e8" }, null).hue).toBe("#1a73e8")
    expect(duplicateOf({ ...review(""), event_hue: "berry" }, null).hue).toBe("berry")
    expect(duplicateOf(review(""), null).hue).toBeUndefined()
    expect(duplicateOf({ ...review(""), event_hue: "javascript:red" }, null).hue).toBeUndefined()
  })

  // An event in the calendar's one store, which keeps files (it is on a calendar).
  const kept = (): CalendarEventInterface => ({ ...review(""), event_calendar_id: "cal-sam" })
  const DOC = { kind: "doc", uuid: "d-brief" } as const
  const BOARD = { kind: "board", uuid: "b-plan" } as const
  const GONE = { kind: "doc", uuid: "d-old" } as const
  /** The server: the event's files, and each one's access as the copier reads it. */
  const server = (files: unknown[], access: Record<string, string>) =>
    vi.fn(async (req: { method: string; apiEndpoint: string; payload?: { refs: Array<{ kind: string; id: string }> } }) =>
      req.method === "GET" ? { id: "e1", files } : req.payload!.refs.map((r) => ({ kind: r.kind, id: r.id, access: access[r.id] ?? "none" })),
    )

  it("keeps the files the copier can open, and says in words what it left off", async () => {
    const send = server([DOC, BOARD, GONE], { "d-brief": "ok", "b-plan": "none", "d-old": "gone" })
    const copy = await copiedFiles(kept(), send)
    expect(copy.files).toEqual([DOC])
    expect(copy.note).toEqual({ title: "Copied without 2 files", description: "You can't open them, so the copy leaves them off." })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", apiEndpoint: "/calendar/events", appendToUrl: "/e1" }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", apiEndpoint: "/entities", payload: { refs: [{ kind: "doc", id: "d-brief" }, { kind: "board", id: "b-plan" }, { kind: "doc", id: "d-old" }] } }))
  })

  it("says one file it left off as one", async () => {
    const copy = await copiedFiles(kept(), server([DOC, BOARD], { "d-brief": "ok" }))
    expect(copy).toEqual({ files: [DOC], note: { title: "Copied without 1 file", description: "You can't open it, so the copy leaves it off." } })
  })

  it("copies every file the copier can open, and says nothing", async () => {
    expect(await copiedFiles(kept(), server([DOC, BOARD], { "d-brief": "ok", "b-plan": "ok" }))).toEqual({ files: [DOC, BOARD], note: null })
  })

  it("asks nothing more of an event with no files, and nothing of Google's or one outside the one store", async () => {
    const none = server([], {})
    expect(await copiedFiles(kept(), none)).toEqual({ files: [], note: null })
    expect(none).toHaveBeenCalledTimes(1)
    const elsewhere = server([DOC], { "d-brief": "ok" })
    expect(await copiedFiles({ ...kept(), event_uuid: "gcal-abc" }, elsewhere)).toEqual({ files: [], note: null })
    expect(await copiedFiles(review(""), elsewhere)).toEqual({ files: [], note: null })
    expect(elsewhere).not.toHaveBeenCalled()
  })

  it("says so when its files couldn't be read, and copies the rest of it", async () => {
    const down = vi.fn(async () => Promise.reject(new Error("offline")))
    expect(await copiedFiles(kept(), down)).toEqual({ files: [], note: { title: "Copied without its files", description: "They couldn't be read just now. Add them to the copy, or try again." } })
  })
})
