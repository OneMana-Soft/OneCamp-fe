import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import AdminAuditLog from "@/components/admin/AdminAuditLog"
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

  it("marks the filter in use without the accent fill", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1)]))
    render(<AdminAuditLog />)
    await screen.findByText("Change 1")
    const all = screen.getByRole("button", { name: "all", pressed: true })
    expect(all.className).not.toMatch(/bg-primary/)
    const nobody = screen.getByRole("button", { name: /nobody watching/i })
    await act(async () => void fireEvent.click(nobody))
    expect(nobody.getAttribute("aria-pressed")).toBe("true")
    expect(nobody.className).not.toMatch(/bg-primary/)
  })

  it("draws an agent row in the agent's colour", async () => {
    getAdminAuditLog.mockResolvedValue(page([entry(1, { category: "agent", summary: "Release Captain was refused" })]))
    render(<AdminAuditLog />)
    await screen.findByText("Release Captain was refused")
    const badge = screen.getAllByText("agent").find((el) => el.tagName !== "BUTTON")!
    expect(badge.className).toMatch(/text-agent/)
    expect(badge.className).not.toMatch(/teal/)
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
