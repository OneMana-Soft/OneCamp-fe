import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// ONE PHONE RULE (20 Oct 2026). The calendar chose its overlays by isMobile,
// the layout's width (under 640px), while every other overlay follows the
// sheet rule (components/ui/overlayMode: a phone in landscape too). On a
// phone held sideways, 844px wide, New event came as the floating card and an
// event's card as a popover. The calendar's overlays follow the one rule now.

const now = TEST_TODAY
const iso = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).toISOString()
const standup = { event_uuid: "e1", event_title: "Standup", event_start_time: iso(9), event_end_time: iso(10), event_created_by: { user_uuid: "me", user_name: "Sam" } }

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.includes("/event/getEvents")) return { data: { data: [standup] }, isLoading: false, mutate: vi.fn() }
    if (url.includes("assignedTaskList")) return { data: { data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }
    if (url.includes("bookingPages")) return { data: { data: [] }, isLoading: false, mutate: vi.fn() }
    return { data: { data: { isConnected: false } }, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useAssignedTasks", () => ({ useAssignedTasks: () => ({ data: { msg: "", data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
// The layout's own rule, as the provider reads it: the window's width under 640px.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: window.innerWidth < 640, isDesktop: window.innerWidth >= 640 }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { isOpen: false, data: { eventUUID: "" } } } }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }))
// The full form: whether it opened.
let formOpen = false
vi.mock("@/components/calendar/createCalendarEventDialog", () => ({
  CreateCalendarEventDialog: (p: { open: boolean }) => {
    formOpen = p.open
    return null
  },
}))

import { CalendarApp } from "./calendarApp"

pinTestClock()

beforeAll(async () => {
  await Promise.all([import("./quickCreateCard"), import("./eventPopover")])
})

let offScreen = () => {}
const on = (s: ScreenName) => {
  offScreen = putOnScreen(SCREENS[s])
}
afterEach(() => {
  cleanup()
  offScreen()
  offScreen = () => {}
  formOpen = false
  window.history.replaceState({}, "", "/app/calendar")
})

/** The all-day row's New on today: the same draft a slot's click makes, by keyboard. */
const newAllDay = () => fireEvent.click(screen.getAllByRole("button", { name: /^New all-day event on / })[0])

describe("the calendar's overlays follow the one sheet rule", () => {
  it("on a phone in landscape, New event is the full form (a sheet), never the floating card", async () => {
    on("a phone in landscape")
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(<CalendarApp />)
    newAllDay()
    await act(async () => {})
    expect(formOpen).toBe(true)
    expect(document.querySelector("[data-quick-create]")).toBeNull()
  })

  it("on a phone in landscape, an event's card is a sheet", async () => {
    on("a phone in landscape")
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(<CalendarApp />)
    // The keyboard's click (detail 0): a movable block opens on it.
    fireEvent.click(document.querySelector('[data-day-col] [data-event-uuid="e1"]')!)
    await waitFor(() => expect(document.querySelector("[data-event-sheet]")).toBeTruthy())
    expect(document.querySelector("[data-event-popover]")).toBeNull()
  })

  it("on a computer, New event is still the floating card by its place", async () => {
    on("a computer")
    window.history.replaceState({}, "", "/app/calendar?view=week")
    render(<CalendarApp />)
    newAllDay()
    await waitFor(() => expect(document.querySelector("[data-quick-create]")).toBeTruthy())
    expect(formOpen).toBe(false)
  })
})
