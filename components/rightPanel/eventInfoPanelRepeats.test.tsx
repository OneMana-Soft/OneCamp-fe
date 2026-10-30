import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// Calendar A7: an instance of a repeating event, in its panel, says how its
// series repeats, and a change or a delete asks which of the series it is
// for (D-CAL-6), then goes through the calendar's own API at the version read.

const SAM = { user_uuid: "289b6b5d-c30c-427a-bcec-634cb294f285", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-000000000002", user_name: "Maya", user_full_name: "Maya Chen", user_profile_object_key: "" }
const SERIES = "6f1c2a9e-3b7d-4c5e-9a1f-2b3c4d5e6f70"
const INSTANCE = `${SERIES}_20261027T091500Z`

const legacy = {
  event_uuid: INSTANCE,
  event_title: "Stand-up",
  event_start_time: "2026-10-27T09:15:00Z",
  event_end_time: "2026-10-27T09:30:00Z",
  event_created_by: SAM,
  event_participants: [MAYA],
}
const api = {
  id: INSTANCE,
  series_id: SERIES,
  recurrence: { rule: "FREQ=WEEKLY;BYDAY=TU", text: "Weekly on Tuesday" },
  kind: "event",
  title: "Stand-up",
  notes: "",
  location: "",
  start: { at: "2026-10-27T09:15:00Z", zone: "Europe/London" },
  end: { at: "2026-10-27T09:30:00Z" },
  all_day: false,
  sequence: 3,
  attendees: [{ user_uuid: MAYA.user_uuid }],
  organiser: { user_uuid: SAM.user_uuid },
}

// Who reads the panel: Sam, its organiser, unless a test reads it as a guest.
const reader = vi.hoisted(() => ({ uuid: "" }))
// Guests' working hours (calendar A3): none kept here.
vi.mock("@/lib/calendar/peopleHours", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/calendar/peopleHours")>()), usePeopleHours: () => ({}) }))
// Whether the calendar's API hasn't answered yet (an edit begun before it does).
const late = vi.hoisted(() => ({ api: false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url === `/event/getEvent/${encodeURIComponent(INSTANCE)}`) return { data: { data: legacy }, isLoading: false, mutate: vi.fn() }
    if (url === `/calendar/events/${encodeURIComponent(INSTANCE)}`) return late.api ? { data: undefined, isLoading: true, mutate: vi.fn() } : { data: { data: api }, isLoading: false, mutate: vi.fn() }
    return { data: undefined, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: reader.uuid || SAM.user_uuid } } }),
}))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: (name: string) => name === "calendar_repeats",
}))
const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => dispatch }))
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }))
vi.mock("@/components/ai/RescheduleDialog", () => ({ default: () => null }))
vi.mock("@/components/ai/MeetingPrepDialog", () => ({ default: () => null }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

import EventInfoPanel from "./eventInfoPanel"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// The Event Form is a chunk of its own: its first load, on a busy machine, can
// take longer than a test's usual 5 s.
vi.setConfig({ testTimeout: 20_000 })

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  dispatch.mockReset()
})

function panel() {
  return render(
    <TooltipProvider>
      <EventInfoPanel eventUUID={INSTANCE} />
    </TooltipProvider>,
  )
}

// The Event Form (calendar FORM): a guest the organiser lets change the event
// edits it, and has no say in what guests may do.
describe("a guest let to change the event", () => {
  afterEach(() => {
    reader.uuid = ""
    delete (api as { guests_can_modify?: boolean }).guests_can_modify
  })

  it("edits it in the one form, without what guests may do", async () => {
    reader.uuid = MAYA.user_uuid
    ;(api as { guests_can_modify?: boolean }).guests_can_modify = true
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    expect(await screen.findByDisplayValue("Stand-up", {}, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Guests can" })).toBeNull()
  })

  it("isn't offered Edit when the organiser doesn't let guests change it", () => {
    reader.uuid = MAYA.user_uuid
    panel()
    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull()
  })
})

// An edit begun before the calendar's API answered starts from the event as
// listed, which has no colour; once the API answers, the untouched form takes
// its values (batch B's e2e: the event page's form showed the calendar's
// colour, not the event's own Moss, after a quick Edit).
describe("an edit begun before the calendar's API answers", () => {
  afterEach(() => {
    late.api = false
    delete (api as { hue?: string }).hue
  })

  it("takes the API's values once they come, while nothing has been changed", async () => {
    ;(api as { hue?: string }).hue = "moss"
    late.api = true
    const { rerender } = panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    expect(await screen.findByDisplayValue("Stand-up", {}, { timeout: 8000 })).toBeTruthy()
    late.api = false
    rerender(
      <TooltipProvider>
        <EventInfoPanel eventUUID={INSTANCE} />
      </TooltipProvider>,
    )
    await waitFor(() => expect(screen.getByRole("radio", { name: "Moss" }).getAttribute("aria-checked")).toBe("true"), { timeout: 8000 })
  })
})

describe("an instance of a repeating event in its panel", () => {
  it("says how its series repeats", () => {
    panel()
    const facts = screen.getAllByRole("term")[0].closest("dl")!
    expect(within(facts).getByText("Repeats").nextElementSibling?.textContent).toBe("Weekly on Tuesday")
  })

  it("asks which events a delete is for, and sends that scope", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }))
    fireEvent.click(await screen.findByRole("radio", { name: "This and following events" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    expect(makeRequest.mock.calls[0][0]).toMatchObject({
      method: "DELETE",
      apiEndpoint: "/calendar/events",
      appendToUrl: `/${INSTANCE}?scope=following&sequence=3`,
    })
  })

  it("deletes nothing when the question is closed", async () => {
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }))
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    })
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("asks which events a change is for, and sends it at the version read", async () => {
    makeRequest.mockResolvedValue({ id: INSTANCE })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    // The one Event Form comes as a chunk of its own.
    fireEvent.change(await screen.findByDisplayValue("Stand-up", {}, { timeout: 8000 }), { target: { value: "Stand-up, demo day" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    // "This event" is picked: the prompt's own Save keeps the change to it.
    const prompt = (await screen.findByRole("heading", { name: "Change a repeating event" })).closest("[role=dialog]") as HTMLElement
    await act(async () => {
      fireEvent.click(within(prompt).getByRole("button", { name: "Save" }))
    })
    // Maya would hear of it (calendar A2, D-CAL-5): Send is the answer that sends it.
    const tell = (await screen.findByRole("heading", { name: "Send an update to your guests?" }, { timeout: 5000 })).closest("[role=dialog]") as HTMLElement
    await act(async () => {
      fireEvent.click(within(tell).getByRole("button", { name: "Send" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    const sent = makeRequest.mock.calls[0][0]
    expect(sent).toMatchObject({ method: "PATCH", apiEndpoint: "/calendar/events", appendToUrl: `/${INSTANCE}` })
    expect(sent.payload).toMatchObject({ sequence: 3, scope: "this", title: "Stand-up, demo day" })
    // Only what changed is sent: the guests and the repeat stay as they are.
    expect(sent.payload.attendees).toBeUndefined()
    expect(sent.payload.recurrence).toBeUndefined()
    expect(sent.payload.notify).toBeUndefined()
  })

  it("tells its guests in OneCamp alone on Don't send", async () => {
    makeRequest.mockResolvedValue({ id: INSTANCE })
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    // The one Event Form comes as a chunk of its own.
    fireEvent.change(await screen.findByDisplayValue("Stand-up", {}, { timeout: 8000 }), { target: { value: "Stand-up, demo day" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    const prompt = (await screen.findByRole("heading", { name: "Change a repeating event" })).closest("[role=dialog]") as HTMLElement
    await act(async () => {
      fireEvent.click(within(prompt).getByRole("button", { name: "Save" }))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Don't send" }, { timeout: 5000 }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    expect(makeRequest.mock.calls[0][0].payload).toMatchObject({ scope: "this", notify: "none" })
  })
})
