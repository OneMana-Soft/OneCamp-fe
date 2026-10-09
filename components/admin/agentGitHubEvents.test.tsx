import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"
import type { Agent } from "@/services/agentService"

// The editor's lists (servers, models, channels, projects) are not under test,
// and a real fetch leaves SWR's retry timer running after the page is gone.
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }) }))

// A saved agent's evaluation and learning sections need the store; neither is
// under test.
vi.mock("@/components/admin/AgentEvalSection", () => ({ AgentEvalSection: () => null }))
vi.mock("@/components/admin/AgentLearningSection", () => ({ AgentLearningSection: () => null }))

vi.mock("@/services/agentService", async (orig) => ({
    ...(await orig<typeof import("@/services/agentService")>()),
    listAgentSkills: vi.fn().mockResolvedValue([]),
}))

// A GitHub event carries what anyone who can write on the repository wrote, so
// a run on one is asked for by nobody and refuses every tool. The server no
// longer lets an agent be set up on one; the form must not offer what saving
// would refuse, and an agent set up on one before must say what it does now.

const boundToGitHub: Agent = {
    id: "agent-1",
    name: "PR follower",
    instructions: "Summarise each pull request.",
    enabled_tools: "[]",
    trigger_type: "event",
    trigger_config: JSON.stringify({ event: "github.pr.opened" }),
    scope: "{}",
    max_steps: 8,
    is_active: true,
    dm_able: false,
    autonomy: "approval",
    run_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
}

// The "Run when…" box: the tool list elsewhere in the dialog may name GitHub.
async function eventSection() {
    return (await screen.findByText("Run when…")).parentElement as HTMLElement
}

function chooseEventTrigger() {
    fireEvent.click(screen.getByRole("button", { name: /On an event/ }))
}

describe("GitHub events in the agent editor", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("are not offered to a new agent", async () => {
        render(<AgentEditDialog open agent={null} onClose={() => {}} onSaved={() => {}} />)
        chooseEventTrigger()
        const section = await eventSection()
        expect(within(section).queryAllByRole("button", { name: /GitHub|pull request/i })).toHaveLength(0)
    })

    it("are explained to an agent set up on one before", async () => {
        render(<AgentEditDialog open agent={boundToGitHub} onClose={() => {}} onSaved={() => {}} />)
        const section = await eventSection()
        expect(within(section).getByText(/A GitHub pull request is opened/)).toBeTruthy()
        expect(within(section).getByText(/answers in words only/)).toBeTruthy()
        expect(within(section).queryAllByRole("button", { name: /GitHub|pull request/i })).toHaveLength(0)
    })
})
