// Durable AI write-approval service.
//
// When the AI assistant / a bot / an agent proposes a WRITE action it is
// persisted server-side as a durable record and surfaced as an in-thread
// Approve/Deny card. Unlike an ephemeral client dialog, the card survives tab
// close / navigation / reload (reconciled via getOpenPendingActions on load and
// kept live over MQTT). Approval executes the action server-side, at most once,
// AS the approver, with that user's permissions re-checked. All routes are
// scoped server-side to the calling user.

import axiosInstance from "@/lib/axiosInstance"

export type PendingActionStatus =
    | "pending"
    | "executing"
    | "executed"
    | "failed"
    | "rejected"
    | "expired"

export interface PendingAction {
    id: string
    requested_by: string
    /**
     * Where the proposal was raised, so a card can be rendered in place.
     *
     * Typed as the union rather than a bare string with a comment, because the comment was
     * not true for a while: writes arriving over MCP were storing a resource kind here —
     * task, table, self_owned — and nothing caught it, since the in-thread tray filters on
     * surface_id and the home attention list ignores surface_type entirely. The backend now
     * maps every resource onto one of these four, so the type can state it.
     */
    surface_type: "channel" | "dm" | "group" | "assistant"
    /**
     * The surface's own id: a channel uuid, or a chat GROUPING id for a dm/group. Empty for
     * "assistant", which is not tied to a thread — those are reached through the home
     * attention list rather than an in-thread tray.
     */
    surface_id: string
    tool_name: string
    params: Record<string, string>
    description: string
    // Derived server-side: the proposed tool is an irreversible/high-risk write
    // (delete/drop/overwrite/force-push, or a write to a protected branch). The
    // approval card warns the human when true. Optional for backward compat.
    destructive?: boolean
    status: PendingActionStatus
    result?: string
    error?: string
    expires_at: string
    created_at: string
    resolved_at?: string
    resolved_by?: string
}

/** The surfaces an approval can be raised on. Mirrors the backend's constants. */
export const PENDING_ACTION_SURFACES = ["channel", "dm", "group", "assistant"] as const

export type PendingActionSurface = (typeof PENDING_ACTION_SURFACES)[number]

/**
 * Narrow an untrusted value to a surface, falling back to "assistant".
 *
 * NEEDED BECAUSE ONE PATH BUILDS A PendingAction FROM AN MQTT PAYLOAD, which arrives as
 * `any` from JSON.parse. TypeScript happily assigned that to the union, so a payload with a
 * surface the client does not know — or the previous `?? ""` default — would produce a value
 * the type says is impossible. Narrowing here makes the declared union true at runtime
 * rather than merely at compile time.
 *
 * "assistant" is the right fallback rather than the first member or an empty string: it means
 * "not tied to a thread", so an unrecognised card shows up in the home attention list instead
 * of being addressed to a thread that will never match it. An empty string matched neither,
 * which meant such a card rendered nowhere at all.
 */
export function toPendingActionSurface(value: unknown): PendingActionSurface {
    return PENDING_ACTION_SURFACES.includes(value as PendingActionSurface)
        ? (value as PendingActionSurface)
        : "assistant"
}

// getOpenPendingActions reconciles on load: the caller's open (pending,
// unexpired) approvals, newest first. Returns a real array even when the
// backend serializes an empty slice as JSON null.
export async function getOpenPendingActions(): Promise<PendingAction[]> {
    const res = await axiosInstance.get("/ai/pending-actions", {
        // @ts-expect-error — suppress the global loading bar for this background fetch
        silent: true,
    })
    const data = (res.data as { data?: PendingAction[] })?.data
    return Array.isArray(data) ? data : []
}

// approvePendingAction approves and executes a proposed write. The resolved
// record (with terminal status + result/error) is returned. A 409/410 (already
// handled / expired) also returns the authoritative record so the UI can
// reconcile rather than show a stale card.
export async function approvePendingAction(id: string): Promise<PendingAction | undefined> {
    const res = await axiosInstance.post(`/ai/pending-actions/${id}/approve`, {})
    return (res.data as { data?: PendingAction })?.data
}

export async function rejectPendingAction(id: string): Promise<PendingAction | undefined> {
    const res = await axiosInstance.post(`/ai/pending-actions/${id}/reject`, {})
    return (res.data as { data?: PendingAction })?.data
}
