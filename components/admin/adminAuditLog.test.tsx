import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import AdminAuditLog, { AuditSkeleton } from "@/components/admin/AdminAuditLog"
import type { AuditEntry, AuditLogPage } from "@/services/settingsService"

// The audit log says when it could not be read (it said "No audit entries
// yet", which an auditor takes as a fact about the workspace), reaches entries
// older than the latest page, marks the filter in use without spending the
// accent on it, and writes times in the app's one format. Design v3 (A11):
// the page frame names the section, the category is a menu, rows are 44px
// and grouped by day (auditLogRows.test.tsx holds the row rules).

const getAdminAuditLog = vi.fn<(...args: unknown[]) => Promise<AuditLogPage>>()

vi.mock("@/services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settingsService")>()
  return {
    ...actual,
    getAdminAuditLog: (...args: unknown[]) => getAdminAuditLog(...args),
    verifyAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
    downloadEvidencePack: vi.fn(),
    listEvidenceReceipts: vi.fn(async () => []),
  }
})
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ freePlan: false, isLocked: () => false, upgradeUrl: undefined }),
}))

const entry = (i: number, over: Partial<AuditEntry> = {}): AuditEntry =>
  ({
    id: `e${i}`,
    action: "settings.retention",
    category: "settings",
    summary: `Change ${i}`,
    actor_email: "priya@kestrel.example",
    actor_kind: "human",
    created_at: "2026-10-10T08:42:11Z",
    ...over,
  }) as AuditEntry

const page = (entries: AuditEntry[]): AuditLogPage => ({ entries, categories: ["settings", "agent"], initiators: [] })

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  // Drops answers a failed test left queued, so one test can't feed the next.
  getAdminAuditLog.mockReset()
})

describe("the audit log", () => {
  it("says it could not be read, and tries again", async () => {
    getAdminAuditLog.mockRejectedValueOnce(new Error("503"))
    render(<AdminAuditLog />)
    expect(await screen.findByText("Couldn't load the audit log")).toBeTruthy()
    expect(screen.queryByText(/No audit entries yet/)).toBeNull()
    getAdminAuditLog.mockResolvedValueOnce(page([entry(1)]))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("Change 1")).toBeTruthy()
  })

  it("shows the page spot, 96px, when nothing has been recorded yet", async () => {
    getAdminAuditLog.mockResolvedValue(page([]))
    render(<AdminAuditLog />)
    expect(await screen.findByText("No audit entries yet")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration] svg.hue-sun")).toBeTruthy()
  })

  it("reaches entries older than the latest page", async () => {
    // Pages of three, not the log's fifty: fifty rows drawn twice took the
    // test to 2 s on a quiet machine and past vitest's 5 on a busy one, and
    // the paging is the same at any size.
    const first = Array.from({ length: 3 }, (_, i) => entry(i))
    getAdminAuditLog.mockResolvedValueOnce(page(first)).mockResolvedValueOnce(page([entry(3, { summary: "The oldest change" })]))
    render(<AdminAuditLog pageSize={3} />)
    await screen.findByText("Change 0")
    expect(getAdminAuditLog.mock.calls.at(-1)?.[1]).toBe(3)
    const older = screen.getByRole("button", { name: "Show older entries" })
    await act(async () => void fireEvent.click(older))
    // The next page, from the end of the ones shown.
    expect(getAdminAuditLog.mock.calls.at(-1)?.slice(1, 3)).toEqual([3, 3])
    expect(await screen.findByText("The oldest change")).toBeTruthy()
    expect(screen.getByText("Change 0")).toBeTruthy()
    // Fewer than a page came back, so that was the end.
    expect(screen.queryByText("Show older entries")).toBeNull()
  })

  it("filters by category on the server, and marks the filters in use as neutral chips", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    fireEvent.keyDown(screen.getByRole("button", { name: "Filter audit entries by category" }), { key: "Enter" })
    const agent = await screen.findByRole("menuitemradio", { name: "Agent" })
    await act(async () => void fireEvent.click(agent))
    expect(getAdminAuditLog.mock.calls.at(-1)?.[0]).toBe("agent")
    const chip = document.querySelector("[data-chip]") as HTMLElement
    expect(chip.textContent).toContain("Agent")
    expect(chip.className).not.toMatch(/hue-|bg-brand|bg-primary/)
    // Nobody watching: pressed, on the pressed overlay, never the accent.
    const nobody = screen.getByRole("button", { name: /^nobody watching$/i })
    await act(async () => void fireEvent.click(nobody))
    expect(nobody.getAttribute("aria-pressed")).toBe("true")
    expect(nobody.className).toMatch(/bg-press/)
    expect(nobody.className).not.toMatch(/bg-primary|bg-brand-muted/)
  })

  it("writes a time in the app's one format, the whole date in its title", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    const time = document.querySelector("time")
    expect(time?.getAttribute("dateTime")).toBe("2026-10-10T08:42:11Z")
    // The day is the sticky header's; the row's own column is the time of day.
    expect(time?.textContent).toMatch(/^\d{1,2}:\d{2}\u00a0(AM|PM)$/)
    expect(time?.getAttribute("title")).toMatch(/October 2026/)
  })
})

// One frame for every admin tab: the log was a bordered Card with a p-4 header,
// its title a div in Inter 17px right and down of every other tab's title.
describe("the audit log's frame", () => {
  it("draws no title of its own: the page frame names it, Verify and Export sit on its toolbar", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    const { container } = render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    const region = screen.getByRole("region", { name: "Audit log" })
    expect(region.id).toBe("audit-log")
    expect(region.querySelector("h1, h2")).toBeNull()
    expect(container.querySelector(".rounded-xl")).toBeNull()
    const actions = region.querySelector("[data-audit-actions]") as HTMLElement
    expect(within(actions).getByRole("button", { name: "Verify" })).toBeTruthy()
    expect(within(actions).getByRole("button", { name: /export/i })).toBeTruthy()
  })

  it("draws its loading rows in the list's own row shape, ten of them", () => {
    render(<AuditSkeleton />)
    const list = screen.getByRole("status", { name: "Loading the audit log" })
    const rows = list.querySelectorAll("li")
    expect(rows.length).toBe(10)
    for (const row of rows) expect(row.className).toContain("audit-row")
  })

  it("says nothing matches a filter, with the tile and a way back to every entry", async () => {
    getAdminAuditLog.mockResolvedValueOnce(page([entry(1)])).mockResolvedValue(page([]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    fireEvent.keyDown(screen.getByRole("button", { name: "Filter audit entries by category" }), { key: "Enter" })
    await act(async () => void fireEvent.click(await screen.findByRole("menuitemradio", { name: "Agent" })))
    expect(await screen.findByText("No entries match this filter")).toBeTruthy()
    // The magnifier spot (design v3, A11: a filter with no results).
    expect(document.querySelector("[data-empty-illustration] svg[data-spot]")).toBeTruthy()
    getAdminAuditLog.mockResolvedValue(page([entry(2)]))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show every entry" })))
    expect(await screen.findByText("Change 2")).toBeTruthy()
    expect(getAdminAuditLog.mock.calls.at(-1)?.[0]).toBeUndefined()
  })

  it("says the server's reason when it refused", async () => {
    getAdminAuditLog.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only admins can read the audit log." } } })
    render(<AdminAuditLog />)
    expect(await screen.findByText("Only admins can read the audit log.")).toBeTruthy()
  })
})
