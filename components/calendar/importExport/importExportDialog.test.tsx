import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CONTENT_IO_JOB_EVENT, type ContentIOJob } from "@/lib/export/contentIO"

const startImport = vi.fn()
const getJob = vi.fn()
vi.mock("@/lib/export/contentIO", async (original) => ({
  ...(await original<typeof import("@/lib/export/contentIO")>()),
  loadCapabilities: async () => ({ export: true, export_formats: [], import_extensions: [".md"], max_import_bytes: 1000, max_direct_bytes: 500 }),
  startImport: (...a: unknown[]) => startImport(...a),
  getJob: (...a: unknown[]) => getJob(...a),
}))
const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))
const downloadBlob = vi.fn()
vi.mock("@/lib/utils/download", () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a) }))

import ImportExportDialog from "./importExportDialog"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { OWN_HUE } from "@/components/calendar/calendarTones"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(() => {
  cleanup()
  startImport.mockReset()
  getJob.mockReset()
  get.mockReset()
  downloadBlob.mockReset()
})

const job = (patch: Partial<ContentIOJob>): ContentIOJob => ({ id: "job-1", kind: "import", format: "ics", status: "queued", progress: 0, created_at: "2026-10-19T00:00:00Z", ...patch })

// Calendar A4: a calendar file, or Google's export, in; every event out.
describe("importing and exporting a calendar", () => {
  it("imports into the calendar, says how many came in, into which calendars, and what it left out, folded away", async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: "running", progress: 40 }))
    const imported = vi.fn()
    render(<ImportExportDialog onClose={() => {}} onImported={imported} />)
    const input = document.querySelector<HTMLInputElement>("[data-import-input]")!
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.md"), new File(["BEGIN:VCALENDAR"], "takeout.zip")] } })
    expect(await screen.findByText("Choose a calendar file (.ics), or the zip Google Calendar exports.")).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: "Import" }))
    await waitFor(() => expect(startImport).toHaveBeenCalledTimes(1))
    expect(startImport.mock.calls[0][0].name).toBe("takeout.zip")
    expect(startImport.mock.calls[0][1]).toBe("")
    expect(startImport.mock.calls[0][3]).toBe("calendar")
    act(() => {
      window.dispatchEvent(new CustomEvent(CONTENT_IO_JOB_EVENT, { detail: { ...job({ status: "done", progress: 100, unchanged: 3,
        created: [{ kind: "event", uuid: "e1", title: "Review" }],
        skipped: [{ what: "Buy milk", why: "Only events come across, not to-dos." }, { what: "Weekly sync", why: "It was cancelled." }] }),
        made: 128, into: [{ uuid: "cal-me", kind: "personal", title: "Personal", count: 96 }, { uuid: "cal-fam", kind: "external", title: "Family", count: 32 }],
        show: { uuid: "e1", title: "Review", at: "2026-10-22T09:00:00Z" } } }))
    })
    const result = (await screen.findByText("128 events came in · 3 were already here")).closest("[data-events-made]")!
    // Each calendar with its colour and count; Google imports into one.
    expect([...result.querySelectorAll("[data-into]")].map((r) => r.textContent)).toEqual(["Personal· 96", "Family· 32"])
    // What it left out is folded away, one row each, its reason after a dot.
    const left = result.querySelector("details[data-left-out]") as HTMLDetailsElement
    expect(left.open).toBe(false)
    expect(left.querySelector("summary")?.textContent).toContain("Left out (2)")
    expect([...left.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["Buy milk · only events come across, not to-dos", "Weekly sync · it was cancelled"])
    expect(result.textContent).not.toMatch(/\(.*\(/)
    expect(imported).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull()
  })

  // DESIGN-BUILD-3, 20 Oct 2026: Family was blue here and berry in the
  // Calendars panel. One helper colours a calendar in the panel, the week and here.
  it("draws each calendar it came into in the colour the Calendars panel draws it", async () => {
    get.mockImplementation(async (url: string) =>
      url.startsWith("/calendar/calendars")
        ? { data: { data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }, { id: "cal-fam", name: "Family", kind: "external", access: "manage", mine: true, hue: "berry" }] } }
        : { data: {} },
    )
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: "running", progress: 40 }))
    render(<ImportExportDialog onClose={() => {}} onImported={vi.fn()} />)
    fireEvent.change(document.querySelector<HTMLInputElement>("[data-import-input]")!, { target: { files: [new File(["BEGIN:VCALENDAR"], "family.ics")] } })
    fireEvent.click(await screen.findByRole("button", { name: "Import" }))
    await waitFor(() => expect(startImport).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new CustomEvent(CONTENT_IO_JOB_EVENT, { detail: { ...job({ status: "done", progress: 100 }), made: 2,
        into: [{ uuid: "cal-me", kind: "personal", title: "Personal", count: 1 }, { uuid: "cal-fam", kind: "external", title: "Family", count: 1 }] } }))
    })
    const dot = (uuid: string) => document.querySelector(`[data-into="${uuid}"] span[aria-hidden]`)?.className ?? ""
    await waitFor(() => expect(dot("cal-fam")).toMatch(/\bhue-berry\b/))
    expect(dot("cal-me")).toMatch(new RegExp(`\\b${HUE_CLASS[OWN_HUE]}\\b`))
  })

  it("shows them once it is done: the week of the next that came, with their calendars shown", async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: "running", progress: 40 }))
    const shown = vi.fn()
    const closed = vi.fn()
    render(<ImportExportDialog onClose={closed} onShow={shown} />)
    fireEvent.change(document.querySelector<HTMLInputElement>("[data-import-input]")!, { target: { files: [new File(["BEGIN:VCALENDAR"], "family.ics")] } })
    fireEvent.click(await screen.findByRole("button", { name: "Import" }))
    await waitFor(() => expect(startImport).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("button", { name: "Show them" })).toBeNull()
    act(() => {
      window.dispatchEvent(new CustomEvent(CONTENT_IO_JOB_EVENT, { detail: { ...job({ status: "done", progress: 100, created: [{ kind: "event", uuid: "e2", title: "Offsite" }] }),
        made: 1, into: [{ uuid: "cal-fam", kind: "external", title: "Family", count: 1 }], show: { uuid: "e2", title: "Offsite", at: "2026-11-05" } } }))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Show them" }))
    expect(closed).toHaveBeenCalled()
    expect(shown).toHaveBeenCalledWith(new Date(2026, 10, 5), ["cal-fam"])
    // Close steps back beside it.
    const close = screen.getAllByRole("button", { name: "Close" }).find((b) => b.textContent === "Close")
    expect(close?.className).toContain("bg-raised")
  })

  it("exports every event as one .ics, and says when it couldn't", async () => {
    get.mockResolvedValueOnce({ data: "BEGIN:VCALENDAR" })
    render(<ImportExportDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Download .ics/ }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("BEGIN:VCALENDAR", "text/calendar;charset=utf-8", "OneCamp calendar.ics"))
    expect(get.mock.calls[0][0]).toBe("/calendar/events/export")
    get.mockRejectedValueOnce(new Error("offline"))
    fireEvent.click(screen.getByRole("button", { name: /Download .ics/ }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be exported|offline/)
  })
})
