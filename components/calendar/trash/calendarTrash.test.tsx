import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import CalendarTrashDialog from "@/components/calendar/trash/calendarTrashDialog"
import { trashFailed } from "@/components/calendar/calendarTrash"
import type { TrashedEvent } from "@/lib/calendar/trash"

// The calendar's Trash (calendar head B, gcal-1a): the reader's own events deleted in the last 30 days, each with
// when it was, who deleted it and when, and Restore. Its chunk takes no data: the calendar reads and restores.
afterEach(cleanup)

const gone = (id: string, title: string, deletedAgoHours: number, by?: string): TrashedEvent => ({
  id,
  title,
  start: { at: "2026-10-16T14:00:00Z" },
  end: { at: "2026-10-16T15:00:00Z" },
  all_day: false,
  hue: id === "b" ? "#10b981" : "moss",
  deleted_at: new Date(Date.UTC(2026, 9, 15, 12) - deletedAgoHours * 3_600_000).toISOString(),
  ...(by ? { deleted_by: { user_uuid: "u1", user_name: by, user_full_name: by } } : {}),
})

// The calendar's read, answered at once with these.
const list = (items: TrashedEvent[]) => vi.fn().mockResolvedValue(items)

describe("the calendar's trash", () => {
  pinTestClock()

  it("lists each deleted event with when it was, who deleted it and when, newest first", async () => {
    render(<CalendarTrashDialog failed={trashFailed} read={list([gone("a", "Launch review", 2, "Sam Rivera"), gone("b", "Design critique", 50)])} onRestore={vi.fn()} onClose={vi.fn()} />)
    const dialog = screen.getByRole("dialog", { name: "Trash" })
    await waitFor(() => expect(dialog.querySelectorAll("[data-trash-event]")).toHaveLength(2))
    expect(within(dialog).getByText(/deleted in the last 30 days/i)).toBeTruthy()
    const rows = dialog.querySelectorAll("[data-trash-event]")
    expect([...rows].map((r) => r.getAttribute("data-trash-event"))).toEqual(["a", "b"])
    expect(rows[0].textContent).toContain("Launch review")
    expect(rows[0].textContent).toMatch(/Deleted .* by Sam Rivera/)
    expect(rows[0].textContent).toMatch(/Fri 16 Oct/)
    // Each row's mark is its event's colour, its own included.
    expect(rows[1].querySelector("[data-own-hue='#10b981']")).toBeTruthy()
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "Restore Launch review" })).toBeTruthy()
  })

  // CR-B21 row 2684, F1(a): an all-day row's days are read as every calendar surface reads them (lib/calendar
  // trashedWindow and allDayLastDay); a date that is no day (2026-02-30) gives no date line, and the row stays.
  it("says an all-day row's days as the grid does, and a date that is no day gets no date line", async () => {
    const days = (id: string, title: string, start: string, end: string): TrashedEvent => ({ ...gone(id, title, 2), all_day: true, start: { date: start }, end: { date: end } })
    render(<CalendarTrashDialog failed={trashFailed} read={list([days("a", "Offsite", "2026-10-22", "2026-10-25"), days("c", "Leap day", "2026-02-30", "2026-03-01"), days("d", "Holiday", "2026-10-23", "2026-10-24")])} onRestore={vi.fn()} onClose={vi.fn()} />)
    const rows = await waitFor(() => {
      const r = document.querySelectorAll<HTMLElement>("[data-trash-event]")
      expect(r).toHaveLength(3)
      return r
    })
    expect(rows[0].querySelector("[data-trash-when]")?.textContent).toBe("Thu 22 Oct to Sat 24 Oct")
    expect(rows[2].querySelector("[data-trash-when]")?.textContent).toBe("Fri 23 Oct")
    expect(rows[1].querySelector("[data-trash-when]")).toBeNull()
    expect(within(rows[1]).getByRole("button", { name: "Restore Leap day" })).toBeTruthy()
  })

  it("restores one: the row leaves once the calendar has it back", async () => {
    const onRestore = vi.fn().mockResolvedValue(null)
    render(<CalendarTrashDialog failed={trashFailed} read={list([gone("a", "Launch review", 2), gone("b", "Design critique", 50)])} onRestore={onRestore} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Restore Launch review" }))
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }))
    await waitFor(() => expect(document.querySelector("[data-trash-event='a']")).toBeNull())
    expect(document.querySelector("[data-trash-event='b']")).toBeTruthy()
  })

  it("says why a restore was refused on its row, which stays", async () => {
    const onRestore = vi.fn().mockResolvedValue("Only its organiser can restore it.")
    render(<CalendarTrashDialog failed={trashFailed} read={list([gone("a", "Launch review", 2)])} onRestore={onRestore} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Restore Launch review" }))
    const row = document.querySelector("[data-trash-event='a']") as HTMLElement
    await waitFor(() => expect(within(row).getByRole("alert").textContent).toBe("Only its organiser can restore it."))
    expect(within(row).getByRole("button", { name: "Restore Launch review" })).toBeTruthy()
  })

  it("loads in quiet rows, is empty in words, and says a failed read through the shared error state, with Try again", async () => {
    let answer: (v: TrashedEvent[]) => void = () => {}
    const { unmount } = render(<CalendarTrashDialog failed={trashFailed} read={() => new Promise((r) => (answer = r))} onRestore={vi.fn()} onClose={vi.fn()} />)
    expect(document.querySelector("[data-trash-loading]")).toBeTruthy()
    expect(screen.queryByText("Nothing in the trash")).toBeNull()
    answer([])
    expect(await screen.findByText("Nothing in the trash")).toBeTruthy()
    expect(screen.getByText("Events you delete stay here for 30 days.")).toBeTruthy()
    unmount()
    const read = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue([gone("a", "Launch review", 2)])
    render(<CalendarTrashDialog failed={trashFailed} read={read} onRestore={vi.fn()} onClose={vi.fn()} />)
    const failed = await screen.findByRole("alert")
    expect(within(failed).getByText("Couldn't load your trash")).toBeTruthy()
    expect(failed.textContent).toContain("Nothing has been lost.")
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: "Restore Launch review" })).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("asks for older ones after a full page, after its last row, by its deletion and its id (V-603)", async () => {
    const full = Array.from({ length: 50 }, (_, i) => gone(`p${i}`, `Event ${i}`, i + 1))
    const read = vi.fn().mockResolvedValueOnce(full).mockResolvedValue([gone("old", "Old offsite", 400)])
    render(<CalendarTrashDialog failed={trashFailed} read={read} onRestore={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Show older" }))
    expect(await screen.findByRole("button", { name: "Restore Old offsite" })).toBeTruthy()
    expect(read).toHaveBeenLastCalledWith({ before: full[49].deleted_at, before_id: "p49" })
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull()
  })

  it("says in one row under the list that older ones couldn't load, keeps the list, and Try again asks again", async () => {
    const full = Array.from({ length: 50 }, (_, i) => gone(`p${i}`, `Event ${i}`, i + 1))
    const read = vi.fn().mockResolvedValueOnce(full).mockRejectedValueOnce(new Error("down")).mockResolvedValue([gone("old", "Old offsite", 400)])
    render(<CalendarTrashDialog failed={trashFailed} read={read} onRestore={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Show older" }))
    const row = await waitFor(() => {
      const r = document.querySelector("[data-load-failed-row]")
      expect(r).toBeTruthy()
      return r as HTMLElement
    })
    expect(row.textContent).toContain("Couldn't load older events")
    expect(screen.getByRole("button", { name: "Restore Event 0" })).toBeTruthy()
    fireEvent.click(within(row).getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: "Restore Old offsite" })).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(3)
    expect(read).toHaveBeenLastCalledWith({ before: full[49].deleted_at, before_id: "p49" })
  })

  it("closes from its foot", () => {
    const onClose = vi.fn()
    render(<CalendarTrashDialog failed={trashFailed} read={list([])} onRestore={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalled()
  })
})
