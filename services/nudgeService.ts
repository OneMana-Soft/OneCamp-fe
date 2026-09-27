// AI Proactive Nudges service — the user-facing "push" surface of the
// workspace AI. All routes are scoped server-side to the calling user.


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
