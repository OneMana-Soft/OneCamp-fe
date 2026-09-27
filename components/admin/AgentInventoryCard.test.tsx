import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { AgentInventoryCard, brainText, reachText } from "@/components/admin/AgentInventoryCard"
import {
  getAgentInventory,
  revokeInventoryCredential,
  setAgentActive,
  type AgentInventory,
} from "@/services/agentService"

vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  getAgentInventory: vi.fn(),
  setAgentActive: vi.fn().mockResolvedValue(undefined),
  revokeInventoryCredential: vi.fn().mockResolvedValue(undefined),
}))

const inventory = (): AgentInventory => ({
  window_days: 7,
  agents: [
    {
      id: "a1", name: "Release Captain", is_active: true, sponsor_id: "u1", sponsor: "Priya N",
      brain: "a2a:agents.acme.dev", autonomy: "auto", trigger: "mention", channels: 2, tools: 3,
      credentials: 1, runs_7d: 4, actions_7d: 2, refusals_7d: 1,
    },
    {
      id: "a2", name: "Orphan", is_active: false, sponsor_id: "u9", sponsor: "",
      brain: "workspace", autonomy: "auto", trigger: "mention", channels: 0, tools: 1,
      credentials: 0, runs_7d: 0, actions_7d: 0, refusals_7d: 0,
    },
  ],
  credentials: [
    {
      id: "t1", name: "ci script", token_prefix: "oc_ab12", scopes: ["tasks:read"], sponsor_id: "u1",
      sponsor: "Priya N", created_at: "2026-09-01T00:00:00Z", refusals_7d: 3,
    },
  ],
})

describe("the agent inventory", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("names who answers for each agent, where it thinks and what it was refused", async () => {
    vi.mocked(getAgentInventory).mockResolvedValue(inventory())
    render(<AgentInventoryCard />)
    await screen.findByText("Release Captain")
    const text = document.body.textContent || ""
    expect(text).toMatch(/for Priya N/)
    expect(text).toMatch(/A2A · agents\.acme\.dev/)
    expect(text).toMatch(/2 channels · 3 tools/)
    expect(text).toMatch(/1 refusal/)
    // An unresolved sponsor is said, not left blank or shown as an id.
    expect(text).toMatch(/sponsor not found/)
    expect(text).not.toMatch(/u9/)
    expect(text).toMatch(/Acts as its maker/)
    expect(text).toMatch(/3 refusals/)
  })

  it("pauses an agent from the switch", async () => {
    vi.mocked(getAgentInventory).mockResolvedValue(inventory())
    render(<AgentInventoryCard />)
    fireEvent.click(await screen.findByRole("switch", { name: "Pause Release Captain" }))
    await waitFor(() => expect(setAgentActive).toHaveBeenCalledWith("a1", false))
  })

  it("asks before revoking a credential, and revokes only on confirm", async () => {
    vi.mocked(getAgentInventory).mockResolvedValue(inventory())
    render(<AgentInventoryCard />)
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }))
    expect(await screen.findByText("Revoke ci script?")).toBeTruthy()
    expect(revokeInventoryCredential).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(screen.queryByText("Revoke ci script?")).toBeNull())
    expect(revokeInventoryCredential).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Revoke")!)
    await waitFor(() => expect(revokeInventoryCredential).toHaveBeenCalledWith("t1"))
  })

  it("offers a retry when it cannot load", async () => {
    vi.mocked(getAgentInventory).mockRejectedValueOnce(new Error("down")).mockResolvedValue(inventory())
    render(<AgentInventoryCard />)
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Release Captain")).toBeTruthy()
  })
})

describe("inventory wording", () => {
  it("says where an agent thinks", () => {
    expect(brainText("workspace")).toBe("Workspace model")
    expect(brainText("agui:bots.example.com")).toBe("AG-UI · bots.example.com")
    expect(brainText("a2a:agents.acme.dev")).toBe("A2A · agents.acme.dev")
  })
  it("says what an agent reaches", () => {
    expect(reachText({ channels: 0, tools: 1 })).toBe("any channel it is mentioned in · 1 tool")
    expect(reachText({ channels: 1, tools: 0 })).toBe("1 channel · 0 tools")
  })
})
