import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import AdminAuditLog from "@/components/admin/AdminAuditLog"
import type { AuditEntry, AuditLogPage } from "@/services/settingsService"

/**
 * "Nobody watching" is the filter an auditor reaches for first: what ran on
 * somebody's authority while they were away. The actor column cannot answer
 * it, because a scheduled run asserts its owner as the actor; only the
 * initiator can, and it is the server's word, not this component's.
 */

let page: AuditLogPage = { entries: [], categories: [], initiators: [] }
const getAdminAuditLog = vi.fn(async () => page)

vi.mock("@/services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settingsService")>()
  return {
    ...actual,
    getAdminAuditLog: (...args: unknown[]) => getAdminAuditLog(...(args as [])),
    verifyAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
    downloadEvidencePack: vi.fn(),
    listEvidenceReceipts: vi.fn(async () => []),
  }
})

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: "e1",
  action: "agent.run",
  category: "agent",
  summary: "Triage ran",
  actor_email: "priya@example.com",
  actor_kind: "agent",
  created_at: "2026-09-19T10:00:00Z",
  ...over,
} as AuditEntry)

const kinds = [
  { kind: "person", unattended: false },
  { kind: "schedule", unattended: true },
  { kind: "event", unattended: true },
  { kind: "handoff", unattended: true },
  { kind: "eval", unattended: false },
]

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  page = { entries: [], categories: ["agent"], initiators: kinds }
})

describe("nobody watching", () => {
  it("asks the server, rather than filtering rows it already has", async () => {
    render(<AdminAuditLog />)
    const toggle = await screen.findByRole("button", { name: /nobody watching/i })
    await act(async () => { fireEvent.click(toggle) })
    // The last call carries the server's one-word filter. Filtering client-side
    // would only ever narrow the first fifty rows, and say nothing about the rest.
    const last = getAdminAuditLog.mock.calls.at(-1) as unknown as unknown[]
    expect(last?.[3]).toBe("unattended")
  })

  it("says in a word when nobody was there", async () => {
    page = {
      ...page,
      entries: [entry({ metadata: JSON.stringify({ initiator: "schedule" }) })],
    }
    render(<AdminAuditLog />)
    // "ran on Priya's authority" and "ran while Priya was asleep" are the same
    // actor and different facts; the word is what tells them apart.
    expect(await screen.findByText(/schedule, nobody watching/i)).toBeTruthy()
  })

  it("does not call a person's presence unattended", async () => {
    page = {
      ...page,
      entries: [entry({ metadata: JSON.stringify({ initiator: "person" }) })],
    }
    render(<AdminAuditLog />)
    await screen.findByText("Triage ran")
    expect(screen.queryByText(/nobody watching ·/i)).toBeNull()
    expect(screen.getByText(/person ·/)).toBeTruthy()
  })

  it("says nothing on a row that never said", async () => {
    // A row written before the key existed, or a person's own action. Guessing
    // "person" would put an assertion into a compliance record that nothing
    // supports.
    page = { ...page, entries: [entry({ metadata: JSON.stringify({ x: 1 }) })] }
    render(<AdminAuditLog />)
    await screen.findByText("Triage ran")
    expect(screen.queryByText(/person ·|schedule|handoff|nobody watching ·/i)).toBeNull()
  })

  it("takes which kinds count from the server, not from a list here", async () => {
    // If the server one day decides "eval" is unattended, this component must
    // follow without an edit. The kinds and their judgement come in the page.
    page = {
      ...page,
      initiators: [{ kind: "eval", unattended: true }],
      entries: [entry({ metadata: JSON.stringify({ initiator: "eval" }) })],
    }
    render(<AdminAuditLog />)
    expect(await screen.findByText(/eval, nobody watching/i)).toBeTruthy()
  })
})
