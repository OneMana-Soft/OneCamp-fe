import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"

// The dialog's lists (channels, projects, models, MCP servers, what AI can do)
// aren't what's under test; it opens with none of them loaded.
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }),
}))

vi.mock("@/services/agentService", async (orig) => ({
    ...(await orig<typeof import("@/services/agentService")>()),
    listAgentSkills: vi.fn().mockResolvedValue([]),
}))

// A new agent should not have to start from a blank page.
describe("creating an agent from a template", () => {
    afterEach(cleanup)

    it("fills name, instructions and description, and says what is left to choose", async () => {
        render(<AgentEditDialog open agent={null} onClose={() => {}} onSaved={() => {}} />)
        fireEvent.click(await screen.findByRole("button", { name: "Weekly status report" }))
        expect((screen.getByLabelText(/^Name/i) as HTMLInputElement).value).toBe("Weekly status report")
        expect(screen.getByText(/Pick the channel it posts in/)).toBeTruthy()
        expect(screen.getByRole("button", { name: "Weekly status report" }).getAttribute("aria-pressed")).toBe("true")
    })

    it("replaces the first template's fields when another is chosen", async () => {
        render(<AgentEditDialog open agent={null} onClose={() => {}} onSaved={() => {}} />)
        fireEvent.click(await screen.findByRole("button", { name: "Weekly status report" }))
        fireEvent.click(screen.getByRole("button", { name: "Channel Q&A helper" }))
        expect((screen.getByLabelText(/^Name/i) as HTMLInputElement).value).toBe("Channel Q&A helper")
        expect(screen.getByRole("button", { name: "Weekly status report" }).getAttribute("aria-pressed")).toBe("false")
    })
})
