import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { fieldLabel } from "@/lib/ui/fieldRow"

// The event panel reads like the task panel: quiet labels in one column,
// each value on one line, sentence-case section titles, and no accent on
// what is only a label. It loads its event by id (CAL-BUG-7).

const SAM = { user_uuid: "289b6b5d-c30c-427a-bcec-634cb294f285", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-000000000002", user_name: "Maya", user_full_name: "Maya Chen", user_profile_object_key: "" }
const JONAS = { user_uuid: "5e1f0000-0000-4000-8000-000000000003", user_name: "Jonas", user_full_name: "Jonas Berg", user_profile_object_key: "" }
let participants: (typeof SAM)[] = []
// Who organised it: Sam, the reader, unless a test says otherwise.
let organiser = SAM
let times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
let loading = false
let eventId = "e1"
// What GET /event/getEvent/{id} answers: the event, or a failure.
let failure: { status: number; data?: unknown } | null = null
// The event's booking, when someone booked it through a booking page.
let booking: { guest_name: string; page_title: string; guest_told: boolean } | undefined
// Every URL the panel asked for.
const asked: string[] = []
// The event's notes, where a call link would be.
let description = ""
// Anything else the server says of the event (its guests' answers, what guests may do).
let more: Record<string, unknown> = {}
// The calendar's own API (its one store, where events repeat): off unless a test turns it on.
let repeats = false
// What its calls kept (meet-02), and the list's reads again.
let kept: unknown[] | undefined
const readKept = vi.fn(async () => undefined)
// The event read once more while it is still on its way (V-180's Try again).
const reread = vi.fn(async () => undefined)
const standup = () => ({ event_uuid: eventId, event_title: "Standup", ...times, event_description: description, event_created_by: organiser, event_participants: participants, ...(booking ? { event_booking: booking } : {}), ...more })
// The server's optional features (useClientConfig), asked of nothing here:
// repeats are off, as on a server whose calendar isn't in its one store.
// Guests' working hours (calendar A3): none kept here.
vi.mock("@/lib/calendar/peopleHours", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/calendar/peopleHours")>()), usePeopleHours: () => ({ hours: {}, where: {} }) }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => repeats }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    // A list holds this month's events only (the old fallback's range).
    if (url.startsWith("/event/getEvents")) return { data: { data: [] }, isLoading: false, mutate: vi.fn() }
    if (loading) return { data: undefined, isLoading: true, mutate: reread }
    if (failure) return { data: undefined, isLoading: false, isError: { response: failure }, mutate: vi.fn() }
    // The calendar's own API says what guests may do (guests_can_modify).
    if (url === `/calendar/events/${encodeURIComponent(eventId)}`) return { data: { data: { event_uuid: eventId, ...more } }, isLoading: false, mutate: vi.fn() }
    if (url === `/calendar/events/${encodeURIComponent(eventId)}/call/artefacts`) return { data: kept ? { data: kept } : undefined, isLoading: false, mutate: readKept }
    return { data: url === `/event/getEvent/${encodeURIComponent(eventId)}` ? { data: standup() } : undefined, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: SAM.user_uuid } } }),
}))
const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))
// A delete's Undo, as restoreService offers it (the toast's chunk loads on the offer); its restore is the real one.
const offered = vi.fn()
vi.mock("@/services/restoreService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/restoreService")>()), offerUndo: (...args: unknown[]) => offered(...args) }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => dispatch }))
// SWR's cache: a list already loaded (the calendar's month, Home's today).
let cache = new Map<string, unknown>()
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), useSWRConfig: () => ({ mutate: vi.fn(), cache }) }))
// The assistant's dialogs, each a chunk the panel loads when it is idle or
// the dialog is first opened: an open one says which it is.
vi.mock("@/components/ai/RescheduleDialog", () => ({ default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Find a better time" /> : null) }))
vi.mock("@/components/ai/MeetingPrepDialog", () => ({ default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Prep brief" /> : null) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
// The delete question, as the one helper the calendar's Delete key and menu ask with too.
const askedToDelete = vi.fn()
vi.mock("@/lib/calendar/confirmDelete", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/calendar/confirmDelete")>()
  return { ...real, deleteEventConfirm: (e: Parameters<typeof real.deleteEventConfirm>[0]) => (askedToDelete(e), real.deleteEventConfirm(e)) }
})

import EventInfoPanel from "./eventInfoPanel"
import { deleteEventRequest } from "@/lib/calendar/confirmDelete"
import { addCallRequest } from "@/lib/calendar/eventsApi"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"
import { openUI } from "@/store/slice/uiSlice"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"

// The Event Form is a chunk of its own: its first load, on a busy machine, can
// take longer than a test's usual 5 s.
vi.setConfig({ testTimeout: 20_000 })

// Every test reads its dates on one pinned day (15 Oct 2026, TEST_TODAY): the file
// writes a dozen of them, so it sets its clock rather than read the machine's.
pinTestClock()

afterEach(() => {
  cleanup()
  loading = false
  eventId = "e1"
  participants = []
  times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
  failure = null
  cache = new Map()
  asked.length = 0
  makeRequest.mockReset()
  dispatch.mockReset()
  askedToDelete.mockReset()
  booking = undefined
  description = ""
  more = {}
  repeats = false
  organiser = SAM
  kept = undefined
  readKept.mockClear()
  offered.mockReset()
})

/** An event's times, `fromMin` to `toMin` minutes from now. */
const around = (fromMin: number, toMin: number) => {
  const t = Date.now()
  return { event_start_time: new Date(t + fromMin * 60_000).toISOString(), event_end_time: new Date(t + toMin * 60_000).toISOString() }
}

function panel(props: { onClose?: () => void; uuid?: string } = {}) {
  return render(
    <TooltipProvider>
      {/* The phone's app bar end, where the event's own page puts its menu (PhoneBarActions). */}
      {props.onClose ? <div data-phone-bar-end="" /> : null}
      <EventInfoPanel eventUUID={props.uuid ?? "e1"} onClose={props.onClose} />
    </TooltipProvider>,
  )
}

describe("an event in the side panel", () => {
  it("lays its facts out as label and value, each value on one line", () => {
    panel()
    const facts = screen.getAllByRole("term")[0].closest("dl")!
    const row = (label: string) => within(facts).getByText(label).nextElementSibling as HTMLElement
    expect(row("Date").textContent).toBe("Monday 28 September 2026")
    expect(row("Time").textContent).toMatch(/^9:30\sAM to 9:45\sAM$/)
    expect(row("Organiser").textContent).toContain("Sam Rivera")
    for (const label of ["Date", "Time", "Organiser"]) expect(row(label).className).toMatch(/truncate|min-w-0/)
  })

  it("says which calendar it is on quietly, in sentence case, without the accent", () => {
    const { container } = panel()
    const label = screen.getByText("Personal event")
    expect(label.className).not.toMatch(/text-primary|uppercase/)
    expect(container.innerHTML).not.toMatch(/PERSONAL|Personal Event/)
  })

  it("titles its sections in sentence case and says plainly when one is empty", () => {
    const { container } = panel()
    expect(screen.getByRole("heading", { name: "Notes" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: /^Guests/ })).toBeTruthy()
    expect(screen.getByText("No notes.")).toBeTruthy()
    expect(screen.getByText("No guests yet.")).toBeTruthy()
    expect(container.querySelector(".italic, .lowercase, .uppercase")).toBeNull()
  })

  it("lists guests with a face in their own hue, name and handle on one line", () => {
    participants = [MAYA]
    panel()
    const guest = screen.getByText(/^Maya/).closest("li")!
    expect(guest.querySelector("[data-hue]")).toBeTruthy()
  })

  it("keeps its buttons quiet until they act, the delete one red only on hover", () => {
    panel()
    const del = screen.getByRole("button", { name: "Delete event" })
    expect(del.className).toMatch(/text-muted-foreground/)
    expect(del.className).toMatch(/hover:text-danger-ink/)
    for (const name of ["Prep brief", "Find a better time", "Edit event"]) {
      const b = screen.getByRole("button", { name })
      expect(b.innerHTML).not.toMatch(/hover:text-primary/)
    }
  })

  it("opens the assistant's Prep brief and Find a better time, each from a chunk of its own", async () => {
    panel()
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Prep brief" }))
    expect(await screen.findByRole("dialog", { name: "Prep brief" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Find a better time" }))
    expect(await screen.findByRole("dialog", { name: "Find a better time" })).toBeTruthy()
  })

  it("says All day for an all-day event, on its one day", () => {
    times = { event_start_time: "2026-10-12T00:00:00", event_end_time: "2026-10-13T00:00:00" }
    panel()
    const facts = screen.getAllByRole("term")[0].closest("dl")!
    const row = (label: string) => within(facts).getByText(label).nextElementSibling as HTMLElement
    expect(row("Time").textContent).toBe("All day")
    expect(row("Date").textContent).toBe("Monday 12 October 2026")
  })

  it("opens under the panel's one header, its actions on the title row and no close row of its own", () => {
    panel()
    const closes = screen.getAllByRole("button", { name: "Close panel" })
    expect(closes).toHaveLength(1)
    const group = closes[0].closest("[data-panel-actions]") as HTMLElement
    for (const name of ["Prep brief", "Find a better time", "Delete event", "Edit event"]) {
      const b = screen.getByRole("button", { name })
      expect(group.contains(b)).toBe(true)
      // One size for the row, as the close button beside them.
      expect(b.className).toMatch(/\bh-8\b/)
      expect(b.className).toMatch(/\bw-8\b/)
      expect(b.className).not.toMatch(/rounded-full/)
    }
    expect(screen.getByRole("banner").textContent).toContain("Event")
  })

  it("says which calendar it is on under the title, as dot and word", () => {
    panel()
    const title = screen.getByRole("heading", { name: "Standup" })
    const meta = screen.getByText("Personal event")
    expect(title.nextElementSibling).toBe(meta)
    expect(meta.querySelector("[data-hue], span")).toBeTruthy()
  })

  it("lays its facts on the task panel's label column", () => {
    panel()
    const dts = screen.getAllByRole("term")
    for (const dt of dts) {
      expect(dt.className).toBe(fieldLabel)
      const row = dt.parentElement as HTMLElement
      expect(row.className).toMatch(/grid-cols-\[6\.5rem_minmax\(0,1fr\)\]/)
      expect((dt.nextElementSibling as HTMLElement).className).toMatch(/\bmin-h-8\b/)
    }
  })

  it("edits on the same columns, with Cancel and Save where its actions were", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    const group = screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement
    expect(within(group).getByRole("button", { name: "Save" })).toBeTruthy()
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy()
    // The one Event Form, a chunk of its own: its title where the view's was.
    expect(await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })).toBeTruthy()
    const form = document.querySelector("[data-event-edit]") as HTMLElement
    for (const label of ["Starts", "Ends", "Notes"]) {
      const el = within(form).getByText(label)
      expect(el.className).toContain(fieldLabel)
      expect((el.parentElement as HTMLElement).className).toMatch(/grid-cols-\[6\.5rem_minmax\(0,1fr\)\]/)
      // FormItem's own stacking must not push the value off the label's line.
      expect((el.parentElement as HTMLElement).className).toMatch(/\bspace-y-0\b/)
    }
    // The time pickers write a moment as the app does, not "October 10th, 2026 - 8:00 PM".
    expect(form.textContent).toMatch(/Mon 28 Sep · 9:30\sAM/)
  })

  it("shows its own shape while it loads, and a way out when the event is gone", () => {
    loading = true
    panel()
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
    expect(screen.queryByText(/Loading event details/)).toBeNull()
    cleanup()
    loading = false
    failure = { status: 404, data: { msg: "This event isn't available." } }
    panel()
    expect(screen.getByRole("heading", { name: "This event isn't available" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
    expect(screen.queryByText("Event not found.")).toBeNull()
  })

  it("says so when the event is still on its way at 10 s, and Try again reads it once more on its shape (V-180)", () => {
    // The file's clock stands still on real timers (pinTestClock); this test counts 10 s on fake ones, on the same day.
    vi.useRealTimers()
    vi.useFakeTimers({ now: TEST_TODAY })
    try {
      loading = true
      reread.mockClear()
      panel()
      expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
      act(() => vi.advanceTimersByTime(9_999))
      expect(screen.queryByRole("alert")).toBeNull()
      act(() => vi.advanceTimersByTime(1))
      const alert = screen.getByRole("alert")
      expect(alert.textContent).toContain("Couldn't load this event")
      expect(alert.textContent).toContain("taking longer than it should")
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
      expect(reread).toHaveBeenCalledTimes(1)
      expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
      expect(screen.queryByRole("alert")).toBeNull()
    } finally {
      loading = false
      vi.useRealTimers()
    }
  })

  it("on the phone's own page, leaves the way back to the app bar", () => {
    panel({ onClose: vi.fn() })
    expect(screen.queryByRole("button", { name: "Close panel" })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit event" })).toBeTruthy()
  })

  // PTC-53: the phone's page showed four icons, and nothing hovers to name them.
  it("on the phone's own page, names Edit and puts the rest in a labelled menu", () => {
    panel({ onClose: vi.fn() })
    expect(screen.getByRole("button", { name: "Edit event" }).textContent).toBe("Edit event")
    expect(screen.queryByRole("button", { name: "Delete event" })).toBeNull()
    expect(screen.getByRole("button", { name: "More actions" }).closest("[data-phone-bar-end]")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("button", { name: "More actions" }), { key: "Enter" })
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Prep brief", "Find a better time", "Delete event"])
  })

  it("offers its organiser a call of its own while it hasn't ended, and adds one", () => {
    times = around(60, 90)
    panel({ onClose: vi.fn() })
    fireEvent.keyDown(screen.getByRole("button", { name: "More actions" }), { key: "Enter" })
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Add a call", "Prep brief", "Find a better time", "Delete event"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a call" }))
    expect(makeRequest).toHaveBeenCalledWith(addCallRequest("e1"))
  })
})

// CAL-BUG-7: on a phone, and from a link, the panel looked for the event in
// today's month only, so any other event read "This event isn't available".
// V-34: the card's pencil, Edit event, opens the event editing, once, as
// Google Calendar's does. Opened to read, it reads; a guest the organiser
// doesn't let change it reads too: the pencil's ask never widens who edits.
describe("an event opened by the card's pencil", () => {
  const asked = (editRequest?: number) =>
    render(
      <TooltipProvider>
        <EventInfoPanel eventUUID="e1" editRequest={editRequest} />
      </TooltipProvider>,
    )

  it("opens editing, with Save and Cancel, without a press of its own", async () => {
    asked(1)
    expect(await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("opens to read when it isn't asked to edit", () => {
    asked(undefined)
    expect(screen.getByRole("button", { name: "Edit event" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("asks once per press: Cancel leaves the form, and only a new press opens it again", async () => {
    const { rerender } = asked(1)
    await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    rerender(
      <TooltipProvider>
        <EventInfoPanel eventUUID="e1" editRequest={1} />
      </TooltipProvider>,
    )
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    rerender(
      <TooltipProvider>
        <EventInfoPanel eventUUID="e1" editRequest={2} />
      </TooltipProvider>,
    )
    expect(await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })).toBeTruthy()
  })

  it("opens to read for a guest the organiser doesn't let change it", () => {
    organiser = MAYA
    participants = [SAM]
    asked(1)
    expect(screen.getByRole("heading", { name: "Standup" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull()
  })
})

// A guest's proposed time is used or set aside by whoever may change the
// event (mayEdit, the server's rule): a guest the organiser lets change it,
// never a reader who isn't on it, however open it is to its guests.
describe("a guest's proposed time", () => {
  // An hour after the standup: from its own times, so the file keeps to its dates.
  const later = (iso: string) => new Date(new Date(iso).getTime() + 3_600_000).toISOString()
  const proposal = { start: later(times.event_start_time), end: later(times.event_end_time) }
  const proposedByJonas = (alsoAnswered: object[] = []) => {
    organiser = MAYA
    more = { guests_can_modify: true, event_guests: [{ user_uuid: JONAS.user_uuid, role: "required", response: "tentative", proposal }, ...alsoAnswered] }
  }

  it("can be set aside by a guest the organiser lets change the event", async () => {
    repeats = true
    proposedByJonas([{ user_uuid: SAM.user_uuid, role: "required", response: "accepted" }])
    participants = [SAM, JONAS]
    panel()
    expect(await screen.findByRole("button", { name: /^Dismiss .*'s proposal$/ }, { timeout: 8000 })).toBeTruthy()
  })

  it("offers nothing to do with it to a reader who isn't on the event", async () => {
    repeats = true
    proposedByJonas()
    participants = [JONAS]
    panel()
    expect(await screen.findByText(/^Proposes/, undefined, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Dismiss .*'s proposal$/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Use this time" })).toBeNull()
  })
})

// Calls follow-up 1: what an event's call made, its recording and transcript,
// is deleted (soft) by whoever may change the event, as the server rules
// (mayEdit), and Undo brings it back. The lazy list only presents: the panel
// asks the server, reads the list again, and offers Undo.
describe("an event's call recordings", () => {
  const recorded = { key: "EG_1", started_at: "2026-09-28T09:31:00Z", ended_at: "2026-09-28T09:44:00Z", lines: 12, recorded: true }
  const deleteSent = expect.objectContaining({ method: "DELETE", apiEndpoint: "/calendar/events", appendToUrl: "/e1/call/artefacts/EG_1" })

  it("are deleted by whoever may change the event, read again, and offered back by Undo", async () => {
    repeats = true
    kept = [recorded]
    panel()
    await screen.findByRole("button", { name: "Play recording" }, { timeout: 8000 })
    const del = screen.queryAllByRole("button", { name: "Delete recording" })
    expect(del).toHaveLength(1)
    fireEvent.click(del[0])
    await waitFor(() => expect(offered).toHaveBeenCalledTimes(1))
    expect(makeRequest).toHaveBeenCalledWith(deleteSent)
    // It left the list at once (no second press), and the list was read again after.
    const [leave, opts] = readKept.mock.calls[0] as unknown as [(now: unknown) => unknown, unknown]
    expect(leave({ data: [recorded, { key: "EG_2" }] })).toEqual({ data: [{ key: "EG_2" }] })
    expect(opts).toEqual({ revalidate: false })
    expect(readKept.mock.calls.at(-1)).toEqual([])
    const [title, undo] = offered.mock.calls[0] as [string, () => Promise<unknown>]
    expect(title).toMatch(/^Deleted recording “.+ · 13 min”$/)
    makeRequest.mockClear()
    readKept.mockClear()
    await undo()
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", apiEndpoint: "/calendar/events", appendToUrl: "/e1/call/artefacts/EG_1/restore", quiet: true }))
    expect(readKept).toHaveBeenCalledTimes(1)
  })

  it("offer no Undo for a delete the server refused, and read the list again for what's there", async () => {
    repeats = true
    kept = [recorded]
    makeRequest.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 404"), { response: { status: 404, data: { msg: "There's no such recording on this event." } } }))
    panel()
    await screen.findByRole("button", { name: "Play recording" }, { timeout: 8000 })
    const del = screen.queryAllByRole("button", { name: "Delete recording" })
    expect(del).toHaveLength(1)
    fireEvent.click(del[0])
    // Out of the list at once, then read again once the server has answered: it's back, as the server found it.
    await waitFor(() => expect(readKept).toHaveBeenCalledTimes(2))
    expect(readKept.mock.calls[1]).toEqual([])
    expect(makeRequest).toHaveBeenCalledWith(deleteSent)
    expect(offered).not.toHaveBeenCalled()
  })

  it("can be deleted by a guest the organiser lets change the event", async () => {
    repeats = true
    organiser = MAYA
    participants = [SAM]
    more = { guests_can_modify: true }
    kept = [recorded]
    panel()
    await screen.findByRole("button", { name: "Play recording" }, { timeout: 8000 })
    expect(screen.queryAllByRole("button", { name: "Delete recording" })).toHaveLength(1)
  })

  it("offer a guest who may only read the event no Delete", async () => {
    repeats = true
    organiser = MAYA
    participants = [SAM]
    kept = [recorded]
    panel()
    await screen.findByRole("button", { name: "Play recording" }, { timeout: 8000 })
    expect(screen.queryAllByRole("button", { name: /^Delete (recording|transcript)$/ })).toHaveLength(0)
  })

  // Head C2 (meet-02 WIN): the one player reads a call by the event's own
  // routes, its recording and its words, under the event's read rule.
  it("play a recorded call by the event's own routes, its words beside it", async () => {
    repeats = true
    kept = [recorded]
    panel()
    fireEvent.click(await screen.findByRole("button", { name: "Play recording" }, { timeout: 8000 }))
    const at = "/calendar/events/e1/call/artefacts/EG_1"
    expect(dispatch).toHaveBeenCalledWith(openUI({ key: "recordingPlayer", data: { mediaPath: `${at}/recording`, transcriptPath: `${at}/transcript`, fileName: "Standup recording", home: "event" } }))
  })

  it("read a call that wasn't recorded by its transcript, in the same player", async () => {
    repeats = true
    kept = [{ key: "sess 2", started_at: "2026-09-21T09:31:00Z", ended_at: "2026-09-21T09:40:00Z", lines: 3, recorded: false }]
    panel()
    fireEvent.click(await screen.findByRole("button", { name: "Read transcript" }, { timeout: 8000 }))
    const at = "/calendar/events/e1/call/artefacts/sess%202"
    expect(dispatch).toHaveBeenCalledWith(openUI({ key: "recordingPlayer", data: { mediaPath: `${at}/recording`, transcriptPath: `${at}/transcript`, fileName: "Standup transcript", home: "event" } }))
  })

  // DB-61's MUST 1: in the side panel, a link that leaves the event closes the
  // panel, so the chat or notes it opens get the page; the phone's own page
  // is left by the link itself.
  describe("left by a call's link", () => {
    const GROUP = "9f3c2b1a0e9d8c7b6a5f4e3d2c1b0a99"
    // jsdom can't navigate: the links' own clicks go nowhere.
    const stay = (e: MouseEvent) => e.preventDefault()
    afterEach(() => document.removeEventListener("click", stay))

    it("closes the side panel", async () => {
      document.addEventListener("click", stay)
      repeats = true
      kept = [{ ...recorded, notes_doc: "doc-1", recap_chat: GROUP }]
      panel()
      fireEvent.click(await screen.findByRole("link", { name: "Conversation" }, { timeout: 8000 }))
      expect(dispatch).toHaveBeenCalledWith(closeRightPanel())
      dispatch.mockClear()
      fireEvent.click(screen.getByRole("link", { name: "Call notes" }))
      expect(dispatch).toHaveBeenCalledWith(closeRightPanel())
    })

    it("leaves the phone's own page to the link", async () => {
      document.addEventListener("click", stay)
      repeats = true
      kept = [{ ...recorded, recap_chat: GROUP }]
      const onClose = vi.fn()
      panel({ onClose })
      fireEvent.click(await screen.findByRole("link", { name: "Conversation" }, { timeout: 8000 }))
      expect(onClose).not.toHaveBeenCalled()
      expect(dispatch).not.toHaveBeenCalledWith(closeRightPanel())
    })
  })
})

describe("an event opened by its id", () => {
  const listKey = "/event/getEvents?startDate=2026-09-28T00:00:00.000Z&endDate=2026-11-01T23:59:59.999Z"

  it("is asked for by its id, so an event two months out opens", () => {
    eventId = "e-december"
    times = { event_start_time: "2026-12-14T10:00:00", event_end_time: "2026-12-14T11:00:00" }
    panel({ uuid: "e-december", onClose: vi.fn() })
    expect(asked).toContain("/event/getEvent/e-december")
    expect(screen.getByRole("heading", { name: "Standup" })).toBeTruthy()
    expect(screen.getByText("Monday 14 December 2026")).toBeTruthy()
  })

  it("asks for a Google event by the id the list gave it", () => {
    eventId = "gcal-abc_20261214T100000Z"
    panel({ uuid: "gcal-abc_20261214T100000Z" })
    expect(asked).toContain("/event/getEvent/gcal-abc_20261214T100000Z")
  })

  it("shows the list's copy while it loads", () => {
    loading = true
    cache.set(listKey, { data: { data: [standup()] } })
    panel()
    expect(screen.getByRole("heading", { name: "Standup" })).toBeTruthy()
    expect(screen.queryByRole("status", { name: "Loading the event" })).toBeNull()
  })

  it("believes the server over the list when it says the event isn't there for you", () => {
    failure = { status: 404, data: { msg: "This event isn't available." } }
    cache.set(listKey, { data: { data: [standup()] } })
    panel()
    expect(screen.getByRole("heading", { name: "This event isn't available" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Standup" })).toBeNull()
  })

  it("keeps to the list's copy on a server without the route (a bare 404)", () => {
    failure = { status: 404, data: "404 page not found" }
    cache.set(listKey, { data: { data: [standup()] } })
    panel()
    expect(screen.getByRole("heading", { name: "Standup" })).toBeTruthy()
  })

  it("says a failed load failed, with Try again", () => {
    failure = { status: 502 }
    panel()
    expect(screen.getByRole("heading", { name: "Couldn't load this event" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })
})

// CAL-BUG-1 (the web's half): a guest removed in the panel is left out of
// what it saves, and removing the last sends an empty list, never none.
describe("saving the guests", () => {
  const save = async () => {
    // The form comes with the edit kit, a chunk of its own.
    await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })
    fireEvent.click(within(screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalled(), { timeout: 5000 })
    return makeRequest.mock.calls[0][0]
  }

  it("leaves out the guest removed", async () => {
    participants = [MAYA, JONAS]
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    fireEvent.click(await screen.findByRole("button", { name: "Remove Jonas" }, { timeout: 8000 }))
    const call = await save()
    expect(call.payload.participants).toEqual([MAYA.user_uuid])
  })

  it("sends an empty list when the last guest is removed", async () => {
    participants = [MAYA]
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    fireEvent.click(await screen.findByRole("button", { name: "Remove Maya" }, { timeout: 8000 }))
    const call = await save()
    expect(call.payload).toHaveProperty("participants", [])
  })

  // VD-32: ⌘⏎ saves the event being edited, from any field, the notes included.
  it("saves with ⌘⏎ from the notes, as Save does", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })
    const notes = document.querySelector<HTMLTextAreaElement>("form[data-event-edit] textarea")!
    fireEvent.keyDown(notes, { key: "Enter", metaKey: true })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled(), { timeout: 5000 })
    expect(makeRequest.mock.calls[0][0]).toMatchObject({ failureTitle: "Couldn't save the event", payload: expect.objectContaining({ title: "Standup" }) })
  })

  // CAL-BUG-16 (the web's half): a refused save says the server's reason.
  it("lets the server's reason for a refusal be told", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    const call = await save()
    expect(call).toMatchObject({ showErrorToast: true, failureTitle: "Couldn't save the event" })
  })
})

// CAL-BUG-4: deleting or moving a booked meeting left its guest untold.
describe("a booked meeting", () => {
  const confirmed = () => dispatch.mock.calls.map(([a]) => a?.payload?.data).filter((d) => d && d.title)
  const saveButton = () => within(screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement).getByRole("button", { name: "Save" })

  it("names its guest before it is deleted, and whether they'll be told", () => {
    booking = { guest_name: "Alex Kim", page_title: "Intro call", guest_told: false }
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }))
    expect(confirmed()[0]).toMatchObject({
      title: "Delete this booked meeting?",
      description: "Alex Kim booked it through Intro call. They won't be told: this workspace doesn't send email, so let them know yourself.",
      confirmText: "Delete meeting",
      destructive: true,
    })
  })

  it("asks before its time changes, and saves only once confirmed", async () => {
    booking = { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true }
    participants = [MAYA, JONAS]
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    const removeJonas = await screen.findByRole("button", { name: "Remove Jonas" }, { timeout: 8000 })
    // The meeting moves meanwhile (another tab): this form, still at 9:30, would move it back.
    times = { event_start_time: "2026-09-28T10:30:00", event_end_time: "2026-09-28T10:45:00" }
    fireEvent.click(removeJonas)
    fireEvent.click(saveButton())
    await waitFor(() => expect(confirmed()).toHaveLength(1), { timeout: 5000 })
    expect(confirmed()[0]).toMatchObject({ title: "Move this booked meeting?", confirmText: "Move and tell Alex Kim" })
    expect(confirmed()[0].description).toMatch(/^Alex Kim booked it through Intro call\. We'll email them the new time, Mon 28 Sep, 9:30\sAM – 9:45\sAM\.$/)
    expect(makeRequest).not.toHaveBeenCalled()
    await confirmed()[0].onConfirm()
    expect(makeRequest).toHaveBeenCalledTimes(1)
  })

  it("saves a change that doesn't move it at once", async () => {
    booking = { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true }
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    // Save waits for the form, which comes with the edit kit.
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    await screen.findByRole("textbox", { name: "Title" }, { timeout: 8000 })
    fireEvent.click(saveButton())
    await waitFor(() => expect(makeRequest).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(confirmed()).toHaveLength(0)
  })
})

describe("deleting", () => {
  it("asks first, in the words the calendar's Delete key and menu ask with", () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }))
    expect(askedToDelete).toHaveBeenCalledWith(expect.objectContaining({ event_uuid: "e1" }))
    const asked = dispatch.mock.calls.map(([a]) => a?.payload?.data).filter((d) => d && d.title)
    expect(asked[0]).toMatchObject({ title: "Delete this event?", description: "It's removed from everyone's calendar. This can't be undone.", confirmText: "Delete event", destructive: true })
  })

  it("sends the request the calendar's Delete key and menu send", async () => {
    makeRequest.mockResolvedValue({})
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }))
    const asked = dispatch.mock.calls.map(([a]) => a?.payload?.data).filter((d) => d && d.title)
    await act(async () => {
      await asked[0].onConfirm()
    })
    expect(makeRequest).toHaveBeenCalledWith(deleteEventRequest("e1"))
  })
})

// Step 3, part 2: the panel had no Join at all; the popover's comes first.
describe("the event panel's Join", () => {
  it("joins a call that is on, first, under the line that says whose event it is", () => {
    times = around(-5, 25)
    description = "<p>Dial in: https://meet.example.com/standup</p>"
    panel()
    const view = document.querySelector("[data-event-view]") as HTMLElement
    const join = within(view).getByRole("link", { name: "Join call" })
    expect(join.getAttribute("href")).toBe("https://meet.example.com/standup")
    expect(join.className).toMatch(/bg-brand/)
    // Straight after the title and its calendar line, before the details.
    const order = Array.from(view.querySelectorAll("h2, p, a, dl")).map((el) => el.tagName)
    expect(order.slice(0, 4)).toEqual(["H2", "P", "A", "DL"])
  })

  it("offers none once it has ended, or for a link that isn't a call", () => {
    times = around(-60, -30)
    description = "<p>Dial in: https://meet.example.com/standup</p>"
    panel()
    expect(screen.queryByRole("link", { name: /Join call/ })).toBeNull()
    cleanup()
    times = around(-5, 25)
    description = "<p>Agenda: https://docs.example.com/d/1</p>"
    panel()
    expect(screen.queryByRole("link", { name: /Join call/ })).toBeNull()
  })
})
