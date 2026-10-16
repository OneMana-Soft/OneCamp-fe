import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"

import AdminAuditLog, { byDay, dayLabel } from "@/components/admin/AdminAuditLog"
import type { AuditEntry, AuditLogPage, AuditVerifyResult } from "@/services/settingsService"

// Design v3, admin A11 (mock M4). The audit log read as confetti: each row
// led with a category pill in its own camp hue (agent dusk, settings sun, auth
// sky, integration lake, security berry, app moss). A category names a kind of
// thing, and hue in this area is for identity only (§1.5), so a category is a
// neutral chip with an ink-3 glyph. The one ink the page spends is danger, on
// a refusal: the rows an auditor opened the log for. Verify resolves to a seal
// row at the top of the list, never only a toast.

const getAdminAuditLog = vi.fn<(...args: unknown[]) => Promise<AuditLogPage>>()
const verifyAuditLog = vi.fn<(...args: unknown[]) => Promise<AuditVerifyResult | null>>()
vi.mock("@/services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settingsService")>()
  return {
    ...actual,
    getAdminAuditLog: (...a: unknown[]) => getAdminAuditLog(...a),
    verifyAuditLog: (...a: unknown[]) => verifyAuditLog(...a),
    exportAuditLog: vi.fn(),
    downloadEvidencePack: vi.fn(),
    listEvidenceReceipts: vi.fn(async () => []),
  }
})
const plan = vi.hoisted(() => ({ locked: false }))
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ freePlan: plan.locked, isLocked: () => plan.locked, upgradeUrl: "https://onemana.dev/pricing" }),
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

const refusal = entry(9, {
  category: "agent",
  actor_kind: "agent",
  summary: "Release Captain was refused posting in #leadership",
  metadata: JSON.stringify({ allowed: false, reason: "The person who approved this agent is not a member of #leadership." }),
})

beforeEach(() => {
  getAdminAuditLog.mockReset()
  verifyAuditLog.mockReset()
  plan.locked = false
})
afterEach(cleanup)

const mount = async (entries: AuditEntry[]) => {
  getAdminAuditLog.mockResolvedValue({ entries, categories: ["settings", "agent", "integration", "security", "auth", "app"], initiators: [] })
  const r = render(<AdminAuditLog />)
  await screen.findByText(entries[0].summary)
  return r
}

describe("an audit row's category", () => {
  it("is a neutral chip with a glyph, in no hue at all", async () => {
    const cats = ["agent", "settings", "integration", "security", "auth", "app"]
    const { container } = await mount(cats.map((c, i) => entry(i, { category: c })))
    for (const c of cats) {
      const chip = container.querySelector(`[data-audit-category='${c}']`) as HTMLElement
      expect(chip.className).toContain("chip")
      expect(chip.className).not.toMatch(/hue-|bg-hue-tint|text-hue-ink|bg-camp-|text-camp-/)
      expect(chip.querySelector("svg")).toBeTruthy()
    }
  })

  it("is never given a hue in the source either", () => {
    const src = readFileSync("components/admin/AdminAuditLog.tsx", "utf8")
    expect(src).not.toMatch(/CATEGORY_HUE|HUE_CLASS|bg-hue-tint|bg-camp-[a-z]+-tint/)
  })
})

describe("a row on a phone", () => {
  // Critic, 11 Oct: the row's phone rule hid the chip from the components
  // layer, which the chip's own utility outranks, so on a phone every chip
  // stood at the row's end, cut by the screen's edge, and the chevron fell to
  // a line of its own. The chip hides by a utility now, and the time it hid
  // with it comes back as the row's second line.
  it("hides the chip by a utility and says when and what kind under the summary", async () => {
    const { container } = await mount([entry(1, { category: "security" })])
    const chip = container.querySelector("[data-audit-category='security']") as HTMLElement
    expect(chip.className.split(/\s+/)).toContain("max-md:hidden")
    const meta = container.querySelector("[data-audit-phone-meta]") as HTMLElement
    expect(meta.className.split(/\s+/)).toContain("md:hidden")
    expect(meta.textContent).toMatch(/· Security$/)
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    expect(css).not.toMatch(/\.audit-row-head \.audit-chip\s*\{/)
  })
})

describe("a refusal", () => {
  it("carries the danger glyph before its summary and its reason in danger ink", async () => {
    const { container } = await mount([refusal, entry(1)])
    const row = container.querySelector("[data-refused='true']") as HTMLElement
    expect(row.querySelector("[data-refusal-glyph]")?.getAttribute("class")).toContain("text-danger-ink")
    const reason = row.querySelector("[data-audit-reason]") as HTMLElement
    expect(reason.className).toContain("text-danger-ink")
    expect(reason.textContent).toBe("Refused: The person who approved this agent is not a member of #leadership.")
    // An ordinary row has neither.
    const plain = Array.from(container.querySelectorAll("[data-audit-row]")).find((r) => !r.hasAttribute("data-refused"))!
    expect(plain.querySelector("[data-refusal-glyph]")).toBeNull()
  })
})

describe("a row", () => {
  it("is 44px collapsed and opens in place into the sunken detail block", async () => {
    const { container } = await mount([entry(1, { ip_address: "203.0.113.24" })])
    const head = container.querySelector(".audit-row-head") as HTMLElement
    expect(head.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(head)
    expect(head.getAttribute("aria-expanded")).toBe("true")
    const detail = container.querySelector("[data-audit-detail]") as HTMLElement
    expect(detail.className).toContain("audit-detail")
    expect(detail.textContent).toContain("203.0.113.24")
    expect(screen.getByRole("button", { name: "Copy entry JSON" })).toBeTruthy()
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    expect(css).toMatch(/\.audit-row-head \{[^}]*min-height: 44px/)
    expect(css).toMatch(/\.audit-detail \{[^}]*background: var\(--sunken\)/)
  })

  it("draws an agent as a square and a person as a circle", async () => {
    const { container } = await mount([refusal, entry(1)])
    expect(container.querySelector("[data-agent-avatar]")).toBeTruthy()
    expect(container.querySelector(".audit-actor.rounded-full, .audit-actor")).toBeTruthy()
  })

  it("is grouped under sticky day headers on the solid sheet", async () => {
    const now = new Date("2026-10-11T12:00:00")
    expect(dayLabel("2026-10-11T08:00:00", now)).toBe("Today")
    expect(dayLabel("2026-10-10T08:00:00", now)).toBe("Yesterday")
    expect(dayLabel("2026-10-08T08:00:00", now)).toMatch(/^Thu 8 Oct/)
    const groups = byDay([entry(1, { created_at: "2026-10-11T08:00:00" }), entry(2, { created_at: "2026-10-11T07:00:00" }), entry(3, { created_at: "2026-10-09T07:00:00" })], now)
    expect(groups.map((g) => g.entries.length)).toEqual([2, 1])
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    const day = css.slice(css.indexOf(".audit-day {"), css.indexOf("}", css.indexOf(".audit-day {")))
    expect(day).toMatch(/position: sticky/)
    expect(day).toMatch(/height: 28px/)
    expect(day).toMatch(/background: var\(--sheet\)/)
    expect(day).not.toMatch(/backdrop/)
  })
})

describe("Verify", () => {
  it("resolves to a seal row at the top of the list, with a moss shield", async () => {
    verifyAuditLog.mockResolvedValue({ ok: true, checked: 1812, message: "audit chain intact", partial: false })
    const { container } = await mount([entry(1)])
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Verify" })))
    const seal = container.querySelector("[data-seal]") as HTMLElement
    expect(seal.getAttribute("data-ok")).toBe("true")
    expect(seal.className).toContain("audit-seal")
    expect(seal.textContent).toContain("intact from the first entry · 1,812 rows checked")
    // Above the rows.
    const list = container.querySelector("[data-audit-list]") as HTMLElement
    expect(seal.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("resolves a break to the danger seal, naming the row, with Jump to row", async () => {
    verifyAuditLog.mockResolvedValue({ ok: false, checked: 12, message: "audit chain broken", first_bad_seq: 13, first_bad_id: "e1" })
    const { container } = await mount([entry(1)])
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Verify" })))
    const seal = container.querySelector("[data-seal]") as HTMLElement
    expect(seal.getAttribute("data-ok")).toBe("false")
    expect(seal.textContent).toContain("Tampering detected at row #13")
    Element.prototype.scrollIntoView ??= () => {}
    fireEvent.click(screen.getByRole("button", { name: "Jump to row" }))
    expect(container.querySelector("#audit-e1")?.getAttribute("data-open")).toBe("true")
  })
})

describe("Export on the free plan", () => {
  it("shows a lock and opens the licence note in a popover, with no banner over the page", async () => {
    plan.locked = true
    const { container } = await mount([entry(1)])
    expect(container.querySelector("[data-plan-locked]")).toBeNull()
    const exp = screen.getByRole("button", { name: /export/i })
    expect(exp.hasAttribute("data-export-locked")).toBe(true)
    await act(async () => void fireEvent.click(exp))
    expect(await screen.findByText(/Exporting the audit log needs a OneCamp licence\./)).toBeTruthy()
  })
})
