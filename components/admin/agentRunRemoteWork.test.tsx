import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import { RunRow } from "@/components/admin/AgentRunsDialog"
import type { AgentRun } from "@/services/agentService"

// A remote brain's own work is in the transcript so the record is whole, and
// it is marked, so nobody reads it as something this workspace ran or could
// have refused.

const STEPS = JSON.stringify([
    {
        iteration: 1,
        assistant: "Opening the page.",
        tool_calls: [
            { tool: "browser_open", params: { arguments: '{"url":"https://example.com"}' }, result: "opened", remote: true },
            { tool: "send_message", params: { channel: "general" }, result: "sent" },
        ],
    },
])

function run(): AgentRun {
    return {
        id: "r1", agent_id: "a1", trigger_source: "manual", status: "succeeded",
        steps: STEPS, step_count: 1, tokens: 0, result: "Done.", started_at: "2026-09-19T10:00:00Z",
    }
}

describe("a run with work the remote brain did itself", () => {
    afterEach(cleanup)

    it("marks that call as remote and leaves the workspace's own call unmarked", () => {
        const { getByRole, getAllByText, queryAllByText } = render(<RunRow run={run()} currentSkills={new Map()} />)
        fireEvent.click(getByRole("button"))

        const badges = getAllByText("remote")
        expect(badges).toHaveLength(1)
        expect(badges[0].getAttribute("title")).toMatch(/could not have refused/)
        // The badge sits in the same card as the remote call, not the local one.
        const card = badges[0].closest("div.rounded-md")
        expect(card?.textContent).toContain("opened")
        expect(card?.textContent).not.toContain("sent")
        expect(queryAllByText("skipped")).toHaveLength(0)
    })
})
