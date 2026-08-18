import { describe, expect, it } from "vitest"
import { applyAgentWorkEvent } from "@/lib/utils/agentWork"
import type { ActiveWorkItem } from "@/services/agentService"

// The in-thread agent-work strip follows a running agent from pushed events
// instead of polling, so these three cases ARE the feature: get them wrong and
// the failure is silent — a row that lingers after the run finished, a phantom
// refetch loop, or a state that never advances past "working".

const item = (over: Partial<ActiveWorkItem> = {}): ActiveWorkItem => ({
    task_id: "task-1",
    agent_id: "agent-1",
    agent_name: "Ops",
    state: "working",
    where: "in a channel thread",
    started_at: "2026-07-31T10:00:00Z",
    updated_at: "2026-07-31T10:00:00Z",
    can_stop: true,
    ...over,
})

describe("applyAgentWorkEvent", () => {
    it("patches a known job's state without asking the server", () => {
        const items = [item()]
        const { items: next, needsFetch } = applyAgentWorkEvent(items, {
            task_id: "task-1",
            state: "stopping",
            open: true,
            updated_at: "2026-07-31T10:01:00Z",
        })
        expect(needsFetch).toBe(false)
        expect(next[0].state).toBe("stopping")
        expect(next[0].updated_at).toBe("2026-07-31T10:01:00Z")
        // Untouched fields survive — can_stop is per-person and never broadcast,
        // so an event must never be allowed to clear it.
        expect(next[0].can_stop).toBe(true)
        expect(next[0].agent_name).toBe("Ops")
    })

    it("drops a job that has finished, with no follow-up request", () => {
        const { items: next, needsFetch } = applyAgentWorkEvent([item(), item({ task_id: "task-2" })], {
            task_id: "task-1",
            state: "stopped",
            open: false,
        })
        expect(needsFetch).toBe(false)
        expect(next.map((i) => i.task_id)).toEqual(["task-2"])
    })

    it("asks for one fetch when work it has never seen starts", () => {
        const { items: next, needsFetch } = applyAgentWorkEvent([], {
            task_id: "new-task",
            state: "working",
            open: true,
        })
        // The list can't be updated from the event alone: whether this person may
        // stop the job is decided server-side and deliberately not broadcast.
        expect(needsFetch).toBe(true)
        expect(next).toEqual([])
    })

    it("ignores an event about unknown work that has already finished", () => {
        const { needsFetch } = applyAgentWorkEvent([], { task_id: "gone", state: "done", open: false })
        expect(needsFetch).toBe(false)
    })

    it("is idempotent under redelivery — same reference, no re-render", () => {
        const items = [item({ state: "working", updated_at: "2026-07-31T10:00:00Z" })]
        const event = { task_id: "task-1", state: "working", open: true, updated_at: "2026-07-31T10:00:00Z" }
        const first = applyAgentWorkEvent(items, event)
        expect(first.items).toBe(items)
        const second = applyAgentWorkEvent(first.items, event)
        expect(second.items).toBe(items)
        expect(second.needsFetch).toBe(false)
    })

    it("ignores malformed or empty events", () => {
        const items = [item()]
        expect(applyAgentWorkEvent(items, null).items).toBe(items)
        expect(applyAgentWorkEvent(items, undefined).needsFetch).toBe(false)
        expect(applyAgentWorkEvent(items, { open: true }).items).toBe(items)
    })
})
