import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

// The event panel reads like the task panel: quiet labels in one column,
// each value on one line, sentence-case section titles, and no accent on
// what is only a label.

const SAM = { user_uuid: "289b6b5d-c30c-427a-bcec-634cb294f285", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_profile_object_key: "" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-000000000002", user_name: "Maya", user_full_name: "Maya Chen", user_profile_object_key: "" }
let participants: (typeof SAM)[] = []
let times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({
    data: {
      data: [
        {
          event_uuid: "e1",
          event_title: "Standup",
          ...times,
          event_created_by: SAM,
          event_participants: participants,
        },
      ],
    },
    isLoading: false,
    mutate: vi.fn(),
  }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: SAM.user_uuid } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => vi.fn() }))
vi.mock("swr", async (importOriginal) => ({ ...(await importOriginal<typeof import("swr")>()), useSWRConfig: () => ({ mutate: vi.fn() }) }))
vi.mock("@/components/ai/RescheduleDialog", () => ({ default: () => null }))
vi.mock("@/components/ai/MeetingPrepDialog", () => ({ default: () => null }))

import EventInfoPanel from "./eventInfoPanel"

afterEach(() => {
  cleanup()
  participants = []
  times = { event_start_time: "2026-09-28T09:30:00", event_end_time: "2026-09-28T09:45:00" }
})

function panel() {
  return render(<EventInfoPanel eventUUID="e1" />)
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
    for (const name of ["Prep brief", "Find a better time", "Edit event"]) {
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
})

