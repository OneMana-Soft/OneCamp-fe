// AI Proactive Nudges service — the user-facing "push" surface of the
// workspace AI. All routes are scoped server-side to the calling user.

import axiosInstance from "@/lib/axiosInstance"
import { forgetShared, sharedRequest } from "@/lib/utils/sharedRequest"

export type NudgeKind =
    | "overdue_commitment"
    | "stale_question"
    | "blocked_task"
    | "unreviewed_pr"
    | "idle_decision"
    | "generic"

export interface Nudge {
    id: string
    kind: NudgeKind
    title: string
    body: string
    cta_url?: string
    cta_text?: string
    source_type?: string
    source_id?: string
    status: string
    priority: number
    created_at: string
    updated_at: string
}

interface NudgeListResponse {
    nudges: Nudge[]
    open_count: number
}

export const NUDGES_KEY = "ai/nudges"

/**
 * The nudge list. The bell sits in both navigation bars, so both ask at once;
 * they share one request. fresh: true when the panel opens, so what the person
 * sees is current.
 */
export function getNudges(opts: { fresh?: boolean } = {}): Promise<NudgeListResponse> {
    return sharedRequest(NUDGES_KEY, fetchNudges, { fresh: opts.fresh })
}

async function fetchNudges(): Promise<NudgeListResponse> {
    const res = await axiosInstance.get("/ai/nudges", {
        // @ts-expect-error — suppress the global loading bar for this background fetch
        silent: true,
    })
    const data = (res.data as { data?: Partial<NudgeListResponse> })?.data
    // Harden against a null/missing list: Go serializes an empty slice as JSON
    // `null`, so `data.nudges` can be null even when `data` is present. Always
    // return a real array so callers (and the bell's `nudges.length`) are safe.
    return {
        nudges: Array.isArray(data?.nudges) ? (data!.nudges as Nudge[]) : [],
        open_count: typeof data?.open_count === "number" ? (data!.open_count as number) : 0,
    }
}

export async function dismissNudge(id: string): Promise<number> {
    forgetShared(NUDGES_KEY)
    const res = await axiosInstance.post(`/ai/nudges/${id}/dismiss`, {})
    return (res.data as { data?: { open_count: number } })?.data?.open_count ?? 0
}

export async function dismissAllNudges(): Promise<number> {
    forgetShared(NUDGES_KEY)
    const res = await axiosInstance.post(`/ai/nudges/dismiss-all`, {})
    return (res.data as { data?: { dismissed: number } })?.data?.dismissed ?? 0
}
