import { describe, expect, it } from "vitest"

import {
    OUTCOME_UNMEASURED,
    type AgentOutcome,
    outcomeBadgeState,
    outcomeMeasured,
    sumOutcomes,
} from "@/services/agentService"

/**
 * The outcome badge answers "did people want what this agent proposed", which
 * is a different question from the eval badge beside it and must not be
 * mistaken for it.
 *
 * Tests the exported decision the component itself calls, rather than a copy of
 * its branches, so the badge cannot start saying something the test still
 * approves of.
 */

const o = (over: Partial<AgentOutcome> = {}): AgentOutcome => ({
    approved: 3,
    rejected: 1,
    expired: 0,
    pending: 0,
    failed: 0,
    decided: 4,
    acceptance_rate: 0.75,
    ignored: false,
    ...over,
})

describe("the agent outcome badge", () => {
    it("says nothing until a person has actually decided", () => {
        expect(outcomeBadgeState(undefined)).toBe("none")
        expect(outcomeBadgeState(null)).toBe("none")
        // Proposals are out there, nobody has ruled on them yet.
        expect(
            outcomeBadgeState(o({ approved: 0, rejected: 0, decided: 0, pending: 5, acceptance_rate: OUTCOME_UNMEASURED })),
        ).toBe("none")
    })

    it("does not read 'nobody decided' as 'everybody said no'", () => {
        // The distinction the sentinel exists for on both sides of the wire.
        const nothingDecided = o({ approved: 0, rejected: 0, decided: 0, acceptance_rate: OUTCOME_UNMEASURED })
        const allRejected = o({ approved: 0, rejected: 4, decided: 4, acceptance_rate: 0 })
        expect(outcomeMeasured(nothingDecided)).toBe(false)
        expect(outcomeMeasured(allRejected)).toBe(true)
        expect(outcomeBadgeState(allRejected)).toBe("scored")
    })

    it("leads with ignored, even when the rate looks good", () => {
        // A true "3 of 4 kept" beside an agent nobody answers any more tells the
        // reader the opposite of what is happening.
        expect(outcomeBadgeState(o({ ignored: true, expired: 9 }))).toBe("ignored")
    })
})

describe("the workspace roll-up", () => {
    it("adds the parts and recomputes the rate rather than averaging rates", () => {
        // Averaging two percentages would weight a two-decision agent the same
        // as a two-hundred-decision one.
        const total = sumOutcomes({
            a: o({ approved: 1, rejected: 1, decided: 2, acceptance_rate: 0.5 }),
            b: o({ approved: 90, rejected: 10, decided: 100, acceptance_rate: 0.9 }),
        })
        expect(total.approved).toBe(91)
        expect(total.decided).toBe(102)
        expect(total.acceptance_rate).toBeCloseTo(91 / 102)
    })

    it("stays unmeasured when nothing has been decided anywhere", () => {
        const empty = sumOutcomes({
            a: o({ approved: 0, rejected: 0, decided: 0, pending: 3, acceptance_rate: OUTCOME_UNMEASURED }),
        })
        expect(empty.decided).toBe(0)
        expect(empty.acceptance_rate).toBe(OUTCOME_UNMEASURED)
        // The tile must show "nothing yet", never a confident 0%.
        expect(outcomeMeasured(empty)).toBe(false)
    })

    it("survives no agents at all", () => {
        for (const input of [undefined, null, {}]) {
            expect(sumOutcomes(input).decided).toBe(0)
        }
    })
})
