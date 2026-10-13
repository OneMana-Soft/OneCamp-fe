import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { fieldLabel } from "@/lib/ui/fieldRow"

// The event panel reads like the task panel: quiet labels in one column,
// each value on one line, sentence-case section titles, and no accent on
// what is only a label. It loads its event by id (CAL-BUG-7).

const SAM = { user_uuid: "289b6b5d-c30c-427a-bcec-634cb294f285", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-000000000002", user_name: "Maya", user_full_name: "Maya Chen", user_profile_object_key: "" }
const JONAS = { user_uuid: "5e1f0000-0000-4000-8000-000000000003", user_name: "Jonas", user_full_name: "Jonas Berg", user_profile_object_key: "" }
let participants: (typeof SAM)[] = []
let times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
let loading = false
let eventId = "e1"
// What GET /event/getEvent/{id} answers: the event, or a failure.
let failure: { status: number; data?: unknown } | null = null
// The event's booking, when someone booked it through a booking page.
let booking: { guest_name: string; page_title: string; guest_told: boolean } | undefined
// Every URL the panel asked for.
const asked: string[] = []
const standup = () => ({ event_uuid: eventId, event_title: "Standup", ...times, event_created_by: SAM, event_participants: participants, ...(booking ? { event_booking: booking } : {}) })
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    // A list holds this month's events only (the old fallback's range).
    if (url.startsWith("/event/getEvents")) return { data: { data: [] }, isLoading: false, mutate: vi.fn() }
    if (loading) return { data: undefined, isLoading: true, mutate: vi.fn() }
    if (failure) return { data: undefined, isLoading: false, isError: { response: failure }, mutate: vi.fn() }
    return { data: url === `/event/getEvent/${encodeURIComponent(eventId)}` ? { data: standup() } : undefined, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: SAM.user_uuid } } }),
}))
const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => dispatch }))
// SWR's cache: a list already loaded (the calendar's month, Home's today).
let cache = new Map<string, unknown>()
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), useSWRConfig: () => ({ mutate: vi.fn(), cache }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

import EventInfoPanel from "./eventInfoPanel"

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
  booking = undefined
})

function panel(props: { onClose?: () => void; uuid?: string } = {}) {
  return render(
    <TooltipProvider>
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
    expect(row("Created by").textContent).toContain("Sam Rivera")
    for (const label of ["Date", "Time", "Created by"]) expect(row(label).className).toMatch(/truncate|min-w-0/)
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
    for (const name of ["Edit event"]) {
      const b = screen.getByRole("button", { name })
      expect(b.innerHTML).not.toMatch(/hover:text-primary/)
    }
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
    for (const name of ["Delete event", "Edit event"]) {
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

  it("edits on the same columns, with Cancel and Save where its actions were", () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    const group = screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement
    expect(within(group).getByRole("button", { name: "Save" })).toBeTruthy()
    expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy()
    const form = document.querySelector("[data-event-edit]") as HTMLElement
    for (const label of ["Title", "Start", "End", "Notes"]) {
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

  it("on the phone's own page, leaves the way back to the app bar", () => {
    panel({ onClose: vi.fn() })
    expect(screen.queryByRole("button", { name: "Close panel" })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit event" })).toBeTruthy()
  })
})

// CAL-BUG-7: on a phone, and from a link, the panel looked for the event in
// today's month only, so any other event read "This event isn't available".
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
    fireEvent.click(within(screen.getByRole("button", { name: "Close panel" }).closest("[data-panel-actions]") as HTMLElement).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalled(), { timeout: 5000 })
    return makeRequest.mock.calls[0][0]
  }

  it("leaves out the guest removed", async () => {
    participants = [MAYA, JONAS]
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Jonas" }))
    const call = await save()
    expect(call.payload.participants).toEqual([MAYA.user_uuid])
  })

  it("sends an empty list when the last guest is removed", async () => {
    participants = [MAYA]
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }))
    const call = await save()
    expect(call.payload).toHaveProperty("participants", [])
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
    // The meeting moves meanwhile (another tab): this form, still at 9:30, would move it back.
    times = { event_start_time: "2026-09-28T10:30:00", event_end_time: "2026-09-28T10:45:00" }
    fireEvent.click(screen.getByRole("button", { name: "Remove Jonas" }))
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
    fireEvent.click(saveButton())
    await waitFor(() => expect(makeRequest).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(confirmed()).toHaveLength(0)
  })
})
