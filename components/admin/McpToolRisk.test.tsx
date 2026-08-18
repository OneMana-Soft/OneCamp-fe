import { describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { McpToolRiskBadge, McpToolRiskLegend } from "@/components/admin/McpToolRisk"
import { mcpToolRisk, parseMcpTools, type McpServer, type McpTool } from "@/services/mcpService"

// The risk affordance is the only place an admin learns what a given MCP tool
// will actually do, so these tests lock the mapping (fail-closed included) and
// the accessibility contract: never colour-only, always a readable label.

describe("mcpToolRisk", () => {
  it("maps the enforced flags to the three states", () => {
    expect(mcpToolRisk({ name: "list_commits", read_only: true })).toBe("auto")
    expect(mcpToolRisk({ name: "create_issue" })).toBe("approval")
    expect(mcpToolRisk({ name: "delete_file", destructive: true })).toBe("destructive")
  })

  it("fails closed: unclassified tools need approval, destructive wins", () => {
    expect(mcpToolRisk({ name: "do_thing" })).toBe("approval")
    // A contradictory payload must never buy auto-run.
    expect(mcpToolRisk({ name: "delete_file", read_only: true, destructive: true })).toBe(
      "destructive",
    )
  })
})

describe("McpToolRiskBadge", () => {
  const cases: { tool: McpTool; label: string }[] = [
    { tool: { name: "list_commits", read_only: true }, label: "Auto-runs" },
    { tool: { name: "create_issue" }, label: "Needs approval" },
    { tool: { name: "delete_file", destructive: true }, label: "Destructive" },
  ]

  it("labels every state in text, not colour alone", () => {
    for (const c of cases) {
      const { getByText, container } = render(<McpToolRiskBadge tool={c.tool} />)
      expect(getByText(c.label)).toBeTruthy()
      // Icon carries no meaning on its own for assistive tech.
      expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
      cleanup()
    }
  })

  it("keeps the label readable for screen readers when compact", () => {
    for (const c of cases) {
      const { getByText } = render(<McpToolRiskBadge tool={c.tool} compact />)
      expect(getByText(c.label).className).toContain("sr-only")
      cleanup()
    }
  })
})

describe("McpToolRiskLegend", () => {
  it("names all three states and credits OneCamp, not the external server", () => {
    const { getByText, container } = render(<McpToolRiskLegend />)
    expect(getByText("Auto-runs")).toBeTruthy()
    expect(getByText("Needs approval")).toBeTruthy()
    expect(getByText("Destructive")).toBeTruthy()
    expect(container.textContent).toContain("OneCamp decides this")
  })
})

describe("parseMcpTools", () => {
  const base: McpServer = {
    id: "s1",
    name: "GitHub",
    url: "https://mcp.example.com",
    transport: "http",
    auth_type: "none",
    has_auth_secret: false,
    enabled: true,
    tool_prefix: "mcp_github_",
    tools_cache: `[{"name":"delete_file","annotations":{"readOnlyHint":true}}]`,
    created_at: "",
    updated_at: "",
  }

  it("prefers the API-classified list over the raw cache", () => {
    const tools = parseMcpTools({
      ...base,
      tools: [{ name: "delete_file", destructive: true }],
    })
    expect(mcpToolRisk(tools[0])).toBe("destructive")
  })

  it("falls back to the raw cache, and those tools read as needing approval", () => {
    const tools = parseMcpTools(base)
    expect(tools.map((t) => t.name)).toEqual(["delete_file"])
    expect(mcpToolRisk(tools[0])).toBe("approval")
  })
})
