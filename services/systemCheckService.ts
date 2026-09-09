import axiosInstance from "@/lib/axiosInstance"

// "Does this installation actually work?"
//
// Read-only: every probe looks for the observable signature a defect leaves
// behind and never writes to a workspace. See helpers/systemcheck.go on the
// backend for why the checks exist at all.

export interface SystemCheckResult {
    name: string
    /** What this proves and what it does not. Shown, never dropped: a green tick with no scope is worth less than nothing. */
    describe: string
    healthy: boolean
    /** Present only when unhealthy: what is wrong, in terms an operator can act on. */
    detail?: string
    took_ms: number
}

export interface SystemCheckReport {
    healthy: number
    unhealthy: number
    total: number
    /** Unix seconds. The server's clock, not the browser's. */
    checked_at: number
    checks: SystemCheckResult[]
}

// One definition of the path, so the request target and any cache key cannot
// drift apart.
export const systemCheckUrl = "/admin/system-check"

export async function runSystemCheck(): Promise<SystemCheckReport | undefined> {
    const res = await axiosInstance.get(systemCheckUrl)
    return (res.data as { data?: SystemCheckReport })?.data
}
