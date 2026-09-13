import axiosInstance from "@/lib/axiosInstance"

// The governance drill: does this install actually refuse an agent the thing it
// promises to refuse?
//
// The run WRITES to the audit log, which is the point rather than a side effect,
// so it is a POST and the status read is a GET. See
// business/AIDrill/governanceDrill.go on the backend for why it drives the tool
// executor directly instead of asking a model, and why it fails closed.

/** One line of the drill as a reader follows it. */
export interface DrillStep {
    name: string
    /** What this step proves. Always shown: a green tick with no scope is worth less than nothing. */
    explain: string
    ok: boolean
    /** Present only when something is wrong, and written to be acted on. */
    detail?: string
}

/** A real row from the audit log, quoted back so the page does not have to be trusted. */
export interface DrillAuditRow {
    seq: number
    id: string
    action: string
    summary: string
    entry_hash?: string
    created_at: string
}

export interface DrillResult {
    /** True only when the action was refused AND the refusal was recorded AND the chain verifies. */
    passed: boolean
    steps: DrillStep[]
    /** The permission layer's own sentence, quoted rather than paraphrased. */
    refusal_reason?: string
    rows?: DrillAuditRow[]
    chain_ok: boolean
    chain_checked: number
    chain_message?: string
    ran_at: string
}

export interface DrillStatus {
    seeded: boolean
    allowed_channel: string
    forbidden_channel: string
}

// One definition of each path, so the request target cannot drift from the route.
export const drillStatusUrl = "/admin/governance-drill"
export const drillSetupUrl = "/admin/governance-drill/setup"
export const drillRunUrl = "/admin/governance-drill/run"

export async function getDrillStatus(): Promise<DrillStatus | undefined> {
    const res = await axiosInstance.get(drillStatusUrl)
    return (res.data as { data?: DrillStatus })?.data
}

export async function setupDrill(): Promise<DrillStatus | undefined> {
    const res = await axiosInstance.post(drillSetupUrl)
    return (res.data as { data?: DrillStatus })?.data
}

export async function runDrill(): Promise<DrillResult | undefined> {
    const res = await axiosInstance.post(drillRunUrl)
    return (res.data as { data?: DrillResult })?.data
}
