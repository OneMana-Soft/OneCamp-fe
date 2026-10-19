import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import { RunRow } from "@/components/admin/AgentRunsDialog"
import type { AgentRun } from "@/services/agentService"

// A run's result is what the agent would have posted. Shown as source it read
// "```chart {"type":"bar" ..." to the person checking their agent's work; the
// channel it posts to draws the chart, so the builder draws it too.
//
// The chart's code is a chunk of its own since 17 Oct 2026 (MarkdownMessage's
// lazy parts, app/firstLoad.test.ts SHELL_LAZY), so the chart comes a moment
// after the row opens: its room is kept meanwhile, and the source never shows.

const CHART =
    "Open tickets by day.\n```chart\n" +
    JSON.stringify({ type: "bar", title: "Open tickets", labels: ["Mon", "Tue"], series: [{ name: "Open", values: [3, 5] }] }) +
    "\n```\nThey rose."

function run(result: string): AgentRun {
    return {
        id: "r1", agent_id: "a1", trigger_source: "manual", status: "succeeded",
        steps: "[]", step_count: 1, tokens: 12, result, started_at: "2026-09-19T10:00:00Z",
    }
}

describe("a run result with a chart in it", () => {
    afterEach(cleanup)

    it("draws the chart instead of printing its source", async () => {
        const { container, getByRole, findByRole } = render(<RunRow run={run(CHART)} currentSkills={new Map()} />)
        fireEvent.click(getByRole("button"))
        expect(container.textContent).not.toContain("```")
        expect(container.textContent).toContain("They rose.")

        const chart = await findByRole("img", { name: "Open tickets" })
        expect(chart.tagName.toLowerCase()).toBe("svg")
        expect(container.querySelector("[data-block-room]")).toBeNull()
        expect(container.textContent).not.toContain("```")
        expect(container.textContent).toContain("They rose.")
    })

    it("still shows plain prose as prose", () => {
        const { container, getByRole } = render(<RunRow run={run("Nothing to report.")} currentSkills={new Map()} />)
        fireEvent.click(getByRole("button"))
        expect(container.querySelector("svg[role='img']")).toBeNull()
        expect(container.textContent).toContain("Nothing to report.")
    })
})
