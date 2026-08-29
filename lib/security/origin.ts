/**
 * Parsing a configured address into an origin, once.
 *
 * WHY IT IS ITS OWN MODULE. Two allowlists are built from the same NEXT_PUBLIC_
 * values: the Content-Security-Policy and the image optimiser's remote patterns.
 * Both had to answer "is this string a host we should permit", and both answered
 * it separately. They disagreed, in the specific way that matters: one rejected
 * an empty value and the other rejected an empty value, and NEITHER rejected the
 * literal string "undefined", which `new URL()` accepts as a perfectly good
 * hostname. So an unset variable produced `https://undefined` and went into an
 * allowlist looking like something a person had configured.
 *
 * The rule now has one home. That is the actual fix; requiring a dot was only the
 * content of the rule.
 */

/**
 * A hostname a browser could resolve.
 *
 * The check is for a dot, and it is not pedantry. Every consumer of this module
 * builds a list the BROWSER enforces, and a browser is not on the Docker network:
 * a single-label name is either a container (`minio`, reachable only inside the
 * compose network) or the string form of a mistake (`undefined`, `null`). Both
 * parse. Neither is a place a user's browser can fetch from.
 *
 * localhost is the one single-label name that is genuinely reachable, and it is
 * how the app is developed.
 */
function isBrowserReachable(hostname: string): boolean {
    return hostname === "localhost" || hostname.includes(".")
}

/**
 * Parse a configured value into a URL, or null if it cannot name a reachable origin.
 *
 * Accepts a full URL or a bare host, because the MQTT broker is configured as a
 * bare host and somebody will write the others that way too. Returns null rather
 * than throwing: every caller is assembling a list, and one unusable entry should
 * shorten the list rather than fail the build.
 */
export function parseOrigin(raw?: string): URL | null {
    const value = (raw ?? "").trim()
    if (!value) return null

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`

    let url: URL
    try {
        url = new URL(withScheme)
    } catch {
        return null
    }
    if (!url.host || !isBrowserReachable(url.hostname)) return null
    return url
}

/** scheme://host for a configured value, or "" if it names no reachable origin. */
export function originOf(raw?: string): string {
    const url = parseOrigin(raw)
    return url ? `${url.protocol}//${url.host}` : ""
}
