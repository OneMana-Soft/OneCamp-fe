import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// PM-3: quick create, the full dialog, the Calendars panel, Go to, an event's
// pop card and its menu, the month view and the agenda are chunks of their own (app/firstLoad.test.ts holds the route to that). Their
// code is fetched ahead, when the pointer heads for one and at the first
// quiet moment, so none waits on its first use. Each module records when it
// is first asked for, once per file: the cases run in this order.
const loaded = vi.hoisted(() => new Set<string>())
// The server's optional features (useClientConfig), asked of nothing here:
// repeats are off, as on a server whose calendar isn't in its one store.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => false }))
vi.mock("@/components/calendar/calendarsPopover", async (real) => (loaded.add("calendars"), await real()))
vi.mock("@/components/calendar/createCalendarEventDialog", async () => (loaded.add("dialog"), { CreateCalendarEventDialog: () => null }))
vi.mock("@/components/calendar/quickCreateCard", async () => (loaded.add("quick"), { QuickCreateCard: () => null }))
vi.mock("@/components/calendar/goToDate", async () => (loaded.add("goTo"), { GoToDate: () => null }))
vi.mock("@/components/calendar/eventMenu", async () => (loaded.add("menu"), { EventMenu: () => null }))
vi.mock("@/components/calendar/eventPopover", async () => (loaded.add("card"), { EventPopover: () => null }))
vi.mock("@/components/calendar/monthView", async (real) => (loaded.add("month"), await real()))
vi.mock("@/components/calendar/calendarAgenda", async (real) => (loaded.add("agenda"), await real()))

// What repeats (head 9) answers nothing here, one object kept as SWR keeps it: a fresh one each render loops its effect.
const NO_REPEATS = { data: undefined, isLoading: false, mutate: vi.fn() }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url.startsWith("/calendar/repeats") ? NO_REPEATS : { data: url.includes("/event/getEvents") ? { data: [] } : { data: { isConnected: false } }, isLoading: false, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useAssignedTasks", () => ({ useAssignedTasks: () => ({ data: { msg: "", data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { isOpen: false, data: {} } } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { CalendarApp } from "./calendarApp"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"

let offScreen = () => {}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mobile = false
  offScreen()
  offScreen = () => {}
})

const settle = () => act(async () => {})

describe("the calendar's surfaces", () => {
  it("come with nothing but the grid", async () => {
    render(<CalendarApp />)
    await settle()
    expect([...loaded]).toEqual([])
  })

  it("on a phone, fetch the agenda it opens on at once, then only the dialog, the event's card (its sheet) and the month it can open at the first quiet moment", async () => {
    // A phone by both rules: the layout's width (isMobile) and the overlays' sheet rule.
    mobile = true
    offScreen = putOnScreen(SCREENS["a phone in portrait"])
    vi.useFakeTimers()
    render(<CalendarApp />)
    // The agenda it opens on is asked for at once: its chunk is in before the
    // quiet moment's timers have run (the agenda is in the idle list too).
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect([...loaded]).toEqual(["agenda"])
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    vi.useRealTimers()
    await settle()
    expect([...loaded].sort()).toEqual(["agenda", "card", "dialog", "month"])
  })

  it("are fetched when the pointer heads for one, so it opens at once", async () => {
    render(<CalendarApp />)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Calendars" }))
    fireEvent.pointerEnter(document.querySelector("[data-new-event]")!)
    // The fetch the pointer started has landed.
    await act(async () => {
      await import("@/components/calendar/calendarsPopover")
    })
    expect(loaded.has("calendars")).toBe(true)
    expect(loaded.has("dialog")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Calendars" }))
    // Drawn at once: no placeholder while its code comes.
    expect(screen.queryByRole("status", { name: "Loading your calendars" })).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Personal" })).toBeTruthy()
  })

  it("are all fetched at the first quiet moment", async () => {
    vi.useFakeTimers()
    render(<CalendarApp />)
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    vi.useRealTimers()
    await settle()
    expect([...loaded].sort()).toEqual(["agenda", "calendars", "card", "dialog", "goTo", "menu", "month", "quick"])
  })
})
