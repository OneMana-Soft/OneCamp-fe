/**
 * Applying a pushed agent-work event to a list of live work.
 *
 * This is the logic that lets the in-thread "working… / Stop" strip follow a
 * running agent WITHOUT polling, so it is worth having as a pure function rather
 * than a closure inside a component: the whole benefit of push depends on getting
 * the three cases right, and getting them wrong is silent (a row that lingers
 * after the run finished, or a phantom refetch loop).
 *
 * The three cases:
 *   known job, still open  → patch its state in place; no request.
 *   known job, now closed  → drop it; no request.
 *   unknown job            → the caller must fetch once, because whether THIS
 *                            person may stop it is decided server-side and is
 *                            deliberately never broadcast.
 */

import type { ActiveWorkItem, ActiveWorkState } from "@/services/agentService"
import type { msgAgentWorkInterface } from "@/services/mqttService"

export interface AgentWorkEventOutcome {
    /** The list to render now. Reference-equal to the input when nothing changed. */
    items: ActiveWorkItem[]
    /**
     * True when the event refers to work this client doesn't know yet, so the
     * caller should re-read the authorized list once. Never true for an event
     * about work that is already finished — there is nothing to show.
     */
    needsFetch: boolean
}

/**
 * applyAgentWorkEvent folds one pushed event into a list of live work.
 *
 * Returns the same array reference when the event changes nothing, so a caller
 * can hand the result straight to setState without causing a re-render for an
 * event it had already applied (QoS-1 redelivery makes duplicates normal).
 */
export function applyAgentWorkEvent(
    items: ActiveWorkItem[],
    work: msgAgentWorkInterface | null | undefined,
): AgentWorkEventOutcome {
    const taskId = work?.task_id
    if (!work || !taskId) return { items, needsFetch: false }

    const existing = items.find((i) => i.task_id === taskId)
    if (!existing) {
        // Work we've never seen. Only worth fetching if it is still running —
        // an event about a job that already finished has nothing to display.
        return { items, needsFetch: !!work.open }
    }

    if (!work.open) {
        return { items: items.filter((i) => i.task_id !== taskId), needsFetch: false }
    }

    const nextState = (work.state as ActiveWorkState) || existing.state
    const nextUpdated = work.updated_at || existing.updated_at
    if (nextState === existing.state && nextUpdated === existing.updated_at) {
        // Redelivery of something already applied: keep the reference stable.
        return { items, needsFetch: false }
    }
    return {
        items: items.map((i) =>
            i.task_id === taskId ? { ...i, state: nextState, updated_at: nextUpdated } : i,
        ),
        needsFetch: false,
    }
}
