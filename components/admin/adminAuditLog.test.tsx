import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import AdminAuditLog, { AuditSkeleton, CHIP_COLUMN } from "@/components/admin/AdminAuditLog"
import type { AuditEntry, AuditLogPage } from "@/services/settingsService"

// The audit log says when it could not be read (it said "No audit entries
// yet", which an auditor takes as a fact about the workspace), reaches entries
// older than the latest fifty, marks the filter in use without spending the
// accent on it, draws agent rows in the agent's colour, and writes times in
// the app's one format.

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
    actor_email: "priya@kestrel.studio",
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

  it("shows the inbox illustration in sun when nothing has been recorded yet", async () => {
    getAdminAuditLog.mockResolvedValue(page([]))
    render(<AdminAuditLog />)
    expect(await screen.findByText("No audit entries yet")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration] svg.hue-sun")).toBeTruthy()
  })

  it("reaches entries older than the latest fifty", async () => {
    const first = Array.from({ length: 50 }, (_, i) => entry(i))
    getAdminAuditLog.mockResolvedValueOnce(page(first)).mockResolvedValueOnce(page([entry(50, { summary: "The oldest change" })]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 0")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show older entries" })))
    expect(getAdminAuditLog.mock.calls.at(-1)?.[2]).toBe(50)
    expect(await screen.findByText("The oldest change")).toBeTruthy()
    expect(screen.getByText("Change 0")).toBeTruthy()
    // Fewer than fifty came back, so that was the end.
    expect(screen.queryByRole("button", { name: "Show older entries" })).toBeNull()
  })

  it("marks the filter in use as the current selection, not as a second filled button", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    // The category is a choice of one: the app's segmented control, its choice
    // raised on the card colour, never the filled accent, which stays with the
    // section's one primary action. (It was a row of pressed buttons.)
    const categories = screen.getByRole("radiogroup", { name: "Filter audit entries by category" })
    const all = within(categories).getByRole("radio", { name: "All" })
    expect(all.getAttribute("aria-checked")).toBe("true")
    expect(all.className).toMatch(/data-\[state=checked\]:bg-card/)
    expect(all.className).not.toMatch(/bg-primary/)
    await act(async () => void fireEvent.click(within(categories).getByRole("radio", { name: "Agent" })))
    expect(getAdminAuditLog.mock.calls.at(-1)?.[0]).toBe("agent")
    // The selection's soft accent ground, as the app marks a current place.
    const nobody = screen.getByRole("button", { name: /nobody watching/i })
    await act(async () => void fireEvent.click(nobody))
    expect(nobody.getAttribute("aria-pressed")).toBe("true")
    expect(nobody.className).toMatch(/bg-brand-muted/)
    expect(nobody.className).not.toMatch(/bg-primary/)
  })

  it("draws each category as a chip in its own camp hue, agent in dusk", async () => {
    getAdminAuditLog.mockResolvedValue({
      entries: [
        entry(1, { category: "agent", summary: "Release Captain was refused" }),
        entry(2, { category: "settings", summary: "Retention set to 365 days" }),
        entry(3, { category: "integration", summary: "GitHub connected" }),
      ],
      categories: ["settings", "integration", "agent"],
      initiators: [],
    })
    render(<AdminAuditLog />)
    await screen.findByText("Release Captain was refused")
    const chip = (name: string) => screen.getAllByText(name).find((el) => el.tagName !== "BUTTON")!
    // Tint behind ink, in one fixed hue per category: a category names a
    // thing, so its colour is identity, never the accent or a raw hue.
    expect(chip("agent").className).toMatch(/hue-dusk/)
    expect(chip("settings").className).toMatch(/hue-sun/)
    expect(chip("integration").className).toMatch(/hue-lake/)
    for (const name of ["agent", "settings", "integration"]) {
      expect(chip(name).className).toMatch(/bg-hue-tint/)
      expect(chip(name).className).toMatch(/text-hue-ink/)
      expect(chip(name).className).toMatch(/rounded-sm/)
      expect(chip(name).className).not.toMatch(/(blue|violet|teal)-\d|primary/)
    }
  })

  it("writes a time in the app's one format", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    const time = document.querySelector("time")
    expect(time?.getAttribute("dateTime")).toBe("2026-10-10T08:42:11Z")
    // Day before month, as everywhere in the app ("10 Oct, 8:42 AM" in the
    // runner's zone), never the browser's "Oct 10, 08:42 AM".
    expect(time?.textContent).toMatch(/^\d{1,2} Oct, \d{1,2}:\d{2} (AM|PM)$/)
  })
})

// One frame for every admin tab: the log was a bordered Card with a p-4 header,
// its title a div in Inter 17px right and down of every other tab's title.
describe("the audit log's frame", () => {
  it("is a section titled by a level 2 heading, with no card around it", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    const { container } = render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    const region = screen.getByRole("region", { name: "Audit log" })
    expect(screen.getByRole("heading", { level: 2, name: "Audit log" })).toBeTruthy()
    expect(region.id).toBe("audit-log")
    expect(container.querySelector(".rounded-xl")).toBeNull()
    // Verify and the evidence pack sit on the title's row, in its action slot.
    const actions = region.querySelector("[data-section-action]") as HTMLElement
    expect(within(actions).getByRole("button", { name: "Verify" })).toBeTruthy()
    expect(within(actions).getByRole("link", { name: /evidence pack/i })).toBeTruthy()
  })

  // The chip led each row at its own width, so summaries started anywhere
  // from 575 to 599px. A column as wide as the widest chip lines them up.
  it("starts every summary on one line, whatever its category", async () => {
    getAdminAuditLog.mockResolvedValue({
      entries: [entry(1, { category: "app" }), entry(2, { category: "integration" }), entry(3, { category: "security" })],
      categories: ["app", "integration", "security"],
      initiators: [],
    })
    render(<AdminAuditLog />)
    await screen.findByText("Change 3")
    const rows = within(screen.getByRole("list", { name: "Audit entries" })).getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const column = row.firstElementChild as HTMLElement
      expect(column.className).toBe(CHIP_COLUMN)
      expect(column.className).toContain("w-[5.5rem]")
      expect(column.className).toContain("shrink-0")
      expect(row.className).toContain("px-4")
    }
  })

  // Its rows sat 8px further in than the loaded ones, which a margin pulled out.
  it("draws its loading rows in the list's own frame, padding and columns", () => {
    render(<AuditSkeleton />)
    const list = screen.getByRole("status", { name: "Loading the audit log" })
    expect(list.className).toContain("rounded-lg")
    expect(list.className).toContain("border")
    const rows = list.querySelectorAll("li")
    expect(rows.length).toBe(6)
    for (const row of rows) {
      expect(row.className).toContain("px-4 py-3")
      expect((row.firstElementChild as HTMLElement).className).toBe(CHIP_COLUMN)
    }
  })

  it("says nothing matches a filter, with the tile and a way back to every entry", async () => {
    getAdminAuditLog.mockResolvedValueOnce(page([entry(1)])).mockResolvedValue(page([]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    await act(async () => void fireEvent.click(screen.getByRole("radio", { name: "Agent" })))
    expect(await screen.findByText("No entries match this filter")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeNull()
    expect(document.querySelector(".hue-sun")).toBeTruthy()
    getAdminAuditLog.mockResolvedValue(page([entry(2)]))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show every entry" })))
    expect(await screen.findByText("Change 2")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("true")
  })

  it("says the server's reason when it refused, under the title", async () => {
    getAdminAuditLog.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only admins can read the audit log." } } })
    render(<AdminAuditLog />)
    expect(await screen.findByText("Only admins can read the audit log.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Audit log" })).toBeTruthy()
  })
})
