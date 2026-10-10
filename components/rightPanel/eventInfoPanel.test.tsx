import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { fieldLabel } from "@/lib/ui/fieldRow"

// The event panel reads like the task panel: quiet labels in one column,
// each value on one line, sentence-case section titles, and no accent on
// what is only a label.

const SAM = { user_uuid: "289b6b5d-c30c-427a-bcec-634cb294f285", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-000000000002", user_name: "Maya", user_full_name: "Maya Chen", user_profile_object_key: "" }
let participants: (typeof SAM)[] = []
let times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
let loading = false
let eventId = "e1"
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({
    data: loading ? undefined : {
      data: [
        {
          event_uuid: eventId,
          event_title: "Standup",
          ...times,
          event_created_by: SAM,
          event_participants: participants,
        },
      ],
    },
    isLoading: loading,
    mutate: vi.fn(),
  }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: SAM.user_uuid } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => vi.fn() }))
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), useSWRConfig: () => ({ mutate: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

import EventInfoPanel from "./eventInfoPanel"

afterEach(() => {
  cleanup()
  loading = false
  eventId = "e1"
  participants = []
  times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
})

function panel(props: { onClose?: () => void } = {}) {
  return render(
    <TooltipProvider>
      <EventInfoPanel eventUUID="e1" {...props} />
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
    expect(form.textContent).toMatch(/28 Sep, 9:30\sAM/)
  })

  it("shows its own shape while it loads, and a way out when the event is gone", () => {
    loading = true
    panel()
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
    expect(screen.queryByText(/Loading event details/)).toBeNull()
    cleanup()
    loading = false
    eventId = "someone-elses"
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
