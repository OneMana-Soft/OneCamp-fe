// Stub: nudgeService — AI nudge system not available in this build.

export type Nudge = {
    id: string
    kind: string
    title: string
    body: string
    cta_url?: string
    cta_text?: string
    status: string
    priority: number
    created_at: string
    updated_at: string
}

export async function fetchNudges(): Promise<Nudge[]> {
    return []
}

export async function dismissNudge(_id: string): Promise<void> {
    // no-op in public build
}
