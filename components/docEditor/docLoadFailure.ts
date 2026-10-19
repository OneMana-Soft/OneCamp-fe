/**
 * Why a doc didn't open (small-details E3). Any failure said "This doc isn't
 * available. It may have been deleted", even with no network or the server
 * down, so a person offline was told their doc might be gone.
 *
 * - "gone": the server answered no (a missing doc is a 400, one not shared
 *   with them a 403; any 4xx). The page keeps its way back to the docs.
 * - "unreachable": no answer at all (offline, a dropped connection, the proxy
 *   in front of the API failing, which the browser reports as a network
 *   error), or the server failed (5xx). Nothing is lost; Try again.
 */
type DocLoadFailure = "deleted" | "gone" | "unreachable"

/**
 * - "deleted": 410, the doc is in the trash and was there for this person
 *   (the server says so only to people who could see it; anyone else gets 404).
 */
/**
 * Whether a 410 says this person may restore the doc (its owner, its
 * editors, an admin): the server says so in the answer. Older servers don't,
 * and then nobody is offered Restore. Pure.
 */
export function canRestoreDeleted(error: unknown): boolean {
    const answer = (error as { response?: { status?: unknown; data?: { can_restore?: unknown } } } | null | undefined)?.response
    return answer?.status === 410 && answer.data?.can_restore === true
}

export function docLoadFailure(error: unknown): DocLoadFailure {
    const status = (error as { response?: { status?: unknown } } | null | undefined)?.response?.status
    if (typeof status !== "number") return "unreachable"
    if (status === 410) return "deleted"
    return status >= 500 ? "unreachable" : "gone"
}

/**
 * Where a doc that belongs to something else is (a table row's page, docs
 * D-18): the server refuses it on the doc page with 403 {code: "hosted", msg,
 * path} to someone its host lets open it, so the page takes them to its host.
 * Only a path inside the app is ever followed, with no "." or ".." in it. Null
 * for any other answer. Pure.
 */
export function hostedPlace(error: unknown): { msg: string; path: string } | null {
    const answer = (error as { response?: { status?: unknown; data?: { code?: unknown; msg?: unknown; path?: unknown } } } | null | undefined)?.response
    const path = answer?.data?.path
    if (answer?.status !== 403 || answer.data?.code !== "hosted" || typeof path !== "string") return null
    if (!path.startsWith("/app/") || path.startsWith("//") || path.includes("\\") || /[\s]/.test(path)) return null
    // No "." or ".." segment: the jump stays inside /app/.
    if (path.split(/[?#]/)[0].split("/").some((segment) => segment === "." || segment === "..")) return null
    return { msg: typeof answer.data?.msg === "string" ? answer.data.msg : "This page belongs to a row of a table.", path }
}
