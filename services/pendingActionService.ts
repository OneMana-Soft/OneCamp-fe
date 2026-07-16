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
    surface_type: string // "channel" | "dm" | "group" | "assistant"
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
