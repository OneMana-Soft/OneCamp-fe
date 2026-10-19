import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// From the review (rvLazyRetry): the new-event dialog is a chunk of its own
// (PM-3) and stays mounted from its first use. One failed load of that chunk
// (a moment offline) left it unopenable: nothing asked for it again.
const asked = vi.hoisted(() => ({ dialog: 0 }))
// The server's optional features (useClientConfig), asked of nothing here:
// repeats are off, as on a server whose calendar isn't in its one store.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => false }))
vi.mock("@/components/calendar/createCalendarEventDialog", async () => {
  asked.dialog++
  if (asked.dialog === 1) throw new Error("Failed to fetch dynamically imported module")
  return { CreateCalendarEventDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="New event" /> : null) }
})
vi.mock("@/components/calendar/quickCreateCard", async () => ({ QuickCreateCard: () => null }))
vi.mock("@/components/calendar/goToDate", async () => ({ GoToDate: () => null }))
vi.mock("@/components/calendar/eventMenu", async () => ({ EventMenu: () => null }))
vi.mock("@/components/calendar/eventPopover", async () => ({ EventPopover: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url.includes("/event/getEvents") ? { data: [] } : { data: { isConnected: false } }, isLoading: false, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useAssignedTasks", () => ({ useAssignedTasks: () => ({ data: { msg: "", data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { isOpen: false, data: {} } } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { CalendarApp } from "./calendarApp"

afterEach(cleanup)

const settle = () => act(async () => {})

describe("the new-event dialog after its chunk failed to load once", () => {
  it("opens on C once the network is back", async () => {
    // No quiet moment: only C asks for the dialog's code.
    ;(window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = () => 0
    ;(window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => {}
    render(<CalendarApp />)
    fireEvent.keyDown(window, { key: "c" })
    await settle()
    expect(asked.dialog).toBe(1)
    expect(screen.queryByRole("dialog", { name: "New event" })).toBeNull()

    // Back online: C again.
    fireEvent.keyDown(window, { key: "c" })
    await settle()
    await settle()
    expect(asked.dialog, "the dialog's code is asked for again").toBe(2)
    expect(screen.queryByRole("dialog", { name: "New event" })).not.toBeNull()
  })
})
