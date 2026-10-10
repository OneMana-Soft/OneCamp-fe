import { afterEach, describe, expect, it, vi } from "vitest"

// Mock the axios instance BEFORE importing the service, since vitest hoists
// vi.mock and the service captures the binding at import time.
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn(),
  },
}))

import axiosInstance from "@/lib/axiosInstance"
import { getAdminAuditLog } from "./settingsService"

const mockGet = axiosInstance.get as unknown as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * The audit log's category filters come from the SERVER.
 *
 * They used to be a hardcoded list in the component, and it drifted: the backend
 * added an `agent` category for agent and MCP activity, this list never learned
 * about it, and every entry recorded under it — including every refusal — could only
 * be seen under "all". For a product whose case rests on being auditable, evidence
 * you cannot select is barely evidence.
 *
 * These tests pin the contract that replaced it, including the failure modes, because
 * the whole point is that the UI follows the server rather than its own memory.
 */
describe("getAdminAuditLog category passthrough", () => {
  it("returns the categories the server reports, including agent", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          entries: [],
          categories: ["settings", "integration", "auth", "app", "security", "agent"],
        },
      },
    })

    const page = await getAdminAuditLog()

    expect(page.categories).toContain("agent")
    // Order is the server's, because the filter buttons render in this order and
    // re-sorting here would make the UI disagree with the source of truth.
    expect(page.categories).toEqual([
      "settings",
      "integration",
      "auth",
      "app",
      "security",
      "agent",
    ])
  })

  it("passes a category through as a query parameter, and omits it for 'all'", async () => {
    mockGet.mockResolvedValue({ data: { data: { entries: [], categories: [] } } })

    await getAdminAuditLog("agent")
    expect(mockGet.mock.calls[0][0]).toContain("category=agent")

    // No category means no parameter at all, rather than category=all — the server
    // filters on the value verbatim, so "all" would match nothing.
    await getAdminAuditLog()
    expect(mockGet.mock.calls[1][0]).not.toContain("category=")
  })

  it("returns an empty category list when the server omits one", async () => {
    // Empty rather than a guessed default. The component keeps whatever list it
    // already has, so a partial or older response cannot silently remove a filter an
    // admin is using.
    mockGet.mockResolvedValueOnce({ data: { data: { entries: [] } } })

    const page = await getAdminAuditLog()

    expect(page.categories).toEqual([])
    expect(page.entries).toEqual([])
  })

  it("survives a malformed response without throwing", async () => {
    // An admin viewer that throws on an unexpected shape is worse than one that
    // renders nothing: the first hides the whole page, the second still shows the
    // verify and export controls.
    for (const body of [{}, { data: null }, { data: { entries: null } }]) {
      mockGet.mockResolvedValueOnce({ data: body })
      const page = await getAdminAuditLog()
      expect(page.entries).toEqual([])
      expect(page.categories).toEqual([])
    }
  })

  it("returns entries alongside the categories", async () => {
    const entry = {
      id: "1",
      seq: 1,
      category: "agent",
      action: "mcp.tool_call.refused",
      created_at: new Date().toISOString(),
    }
    mockGet.mockResolvedValueOnce({
      data: { data: { entries: [entry], categories: ["agent"] } },
    })

    const page = await getAdminAuditLog("agent")

    expect(page.entries).toHaveLength(1)
    expect(page.entries[0].action).toBe("mcp.tool_call.refused")
  })
})
