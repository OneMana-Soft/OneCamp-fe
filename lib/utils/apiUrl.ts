/**
 * Building an absolute API URL from the configured base.
 *
 * WHY THIS IS A SHARED FUNCTION. NEXT_PUBLIC_BACKEND_URL carries a TRAILING SLASH in the deployed
 * environment files — `https://onecamp-backend.onemana.dev/` — which is why call sites throughout the
 * app write `${base}auth/login` with no slash of their own. Anything that adds its own slash produces
 * `//path`, and a URL with a doubled separator is the kind of fault that works behind one proxy and
 * 404s behind the next.
 *
 * That normalisation was written once for the MCP endpoint, whose comment stated the intent plainly:
 * done here "instead of being a detail each caller has to remember". Then the SCIM card needed the same
 * thing and copied it, which is how a rule stops being one. Extracted so there is a single
 * implementation, and so the next surface that has to show somebody a URL inherits the fix rather than
 * the bug.
 *
 * Takes the base explicitly with an env default, so every shape below is testable without a browser and
 * without an environment.
 */

/**
 * Joins the API base and a path with exactly one slash between them.
 *
 * Returns "" when the base is unset, and the caller decides what to show. It does NOT invent a
 * hostname: a plausible-looking wrong URL inside a block somebody copies without reading is worse than
 * an obvious absence the UI can report.
 *
 * @param path relative to the API root, with or without a leading slash
 * @param base defaults to the configured backend URL
 */
export function apiUrl(
    path: string,
    base: string | undefined = process.env.NEXT_PUBLIC_BACKEND_URL,
): string {
    const trimmedBase = (base ?? "").trim()
    if (trimmedBase === "") return ""

    // Both sides are stripped, so a caller passing "/v1/mcp" and one passing "v1/mcp" produce the same
    // URL. Accepting either matters more than picking one: the two conventions are already both in use
    // in this codebase, and a helper that silently mangles one of them is worse than no helper.
    const root = trimmedBase.replace(/\/+$/, "")
    const suffix = path.trim().replace(/^\/+/, "")
    if (suffix === "") return root
    return `${root}/${suffix}`
}
