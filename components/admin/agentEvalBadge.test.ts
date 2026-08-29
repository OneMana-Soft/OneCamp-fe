import { describe, expect, it } from "vitest"

import type { AgentEvalSummary } from "@/services/agentService"

/**
 * The badge's job is to be honest about how old its own number is.
 *
 * The failure it exists to prevent: an agent shows a green 100%, its owner
 * rewrites the instructions, and the badge keeps showing 100% because nothing
 * reran. The number is true about a version that no longer exists, and the
 * reader has no way to tell.
 *
 * This tests the decision, not the markup: which of the three states a summary
 * resolves to. Mirrors the branches in AgentEvalBadge.
 */

type State = "none" | "untested" | "stale" | "scored"

function badgeState(summary?: AgentEvalSummary): State {
    if (!summary || summary.scenario_count === 0) return "none"
    if (summary.scored === 0) return "untested"
    if (summary.stale) return "stale"
    return "scored"
}

const s = (over: Partial<AgentEvalSummary> = {}): AgentEvalSummary => ({
    scenario_count: 4,
    passed: 4,
    scored: 4,
    last_evaluated_at: "2026-08-30T00:00:00Z",
    ...over,
})

describe("the agent eval badge", () => {
    it("says nothing when there are no tests", () => {
        expect(badgeState(undefined)).toBe("none")
        expect(badgeState(s({ scenario_count: 0 }))).toBe("none")
    })

    it("distinguishes written-but-never-run from measured", () => {
        // Scenarios exist and nobody has run them. Not a failure, and not a score.
        expect(badgeState(s({ scored: 0, passed: 0 }))).toBe("untested")
    })

    it("stops showing a confident score once the agent has changed", () => {
        // The whole point. A perfect score that predates an edit must not read as
        // a perfect score.
        expect(badgeState(s({ stale: true }))).toBe("stale")
        expect(badgeState(s({ passed: 0, stale: true }))).toBe("stale")
    })

    it("shows the score when the measurement is current", () => {
        expect(badgeState(s())).toBe("scored")
        expect(badgeState(s({ stale: false }))).toBe("scored")
    })

    it("treats a missing stale flag as current", () => {
        // An older backend does not send the field. Falling back to "current"
        // keeps the badge behaving exactly as it did before rather than marking
        // every agent as rechecking forever.
        const { stale, ...withoutFlag } = s()
        void stale
        expect(badgeState(withoutFlag as AgentEvalSummary)).toBe("scored")
    })
})
