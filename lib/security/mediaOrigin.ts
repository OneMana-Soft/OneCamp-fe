/**
 * Where this install serves uploaded files from, and the two allowlists that
 * have to agree about it.
 *
 * WHY THIS EXISTS. Avatars, attachments and image previews are not served by the
 * app or by the API. They come from the object store, on its own hostname, in
 * presigned URLs the backend mints. Two separate allowlists have to name that
 * host or the images do not render:
 *
 *   next.config images.remotePatterns  the optimiser refuses an un-allowed host
 *   Content-Security-Policy img-src    the browser refuses to load it
 *
 * Both were wrong. remotePatterns held OUR object-store hostname, hard-coded, so
 * `next/image` returned 400 for every avatar and attachment on every install
 * that was not ours. The CSP never mentioned the object store at all, which is
 * harmless only while the policy is Report-Only and becomes a second, identical
 * outage the day it is enforced.
 *
 * Deriving it in one place is what keeps the two allowlists from disagreeing
 * again. The old arrangement had no shared source: one was a literal in a config
 * file, the other an omission.
 *
 * HOW IT IS RESOLVED. NEXT_PUBLIC_MINIO_URL if set, otherwise by convention from
 * the backend URL, because the backend's compose file names the object store
 * `onecamp-minio.<domain>` next to `onecamp-backend.<domain>`. So a stock install
 * needs no new configuration, and an install that put the object store somewhere
 * else sets one variable.
 */

/** Object-store subdomain in a stock install, and the backend's, which it replaces. */
const STOCK_BACKEND_LABEL = "onecamp-backend"
const STOCK_MEDIA_LABEL = "onecamp-minio"

/**
 * The origin uploaded files are served from, or "" if it cannot be determined.
 *
 * Empty is returned rather than a guess: a wrong origin in an allowlist permits
 * a host nobody uses, which is worse than an allowlist that is honestly short.
 */
export function mediaOrigin(explicit?: string, backendUrl?: string): string {
    const direct = originOf(explicit)
    if (direct) return direct

    const backend = originOf(backendUrl)
    if (!backend) return ""

    // Swap only the leading label, and only when it is the one the convention
    // uses. A backend at api.acme.com says nothing about where the object store
    // is, so guessing from it would invent a host.
    const url = new URL(backend)
    if (!url.hostname.startsWith(`${STOCK_BACKEND_LABEL}.`)) return ""
    url.hostname = STOCK_MEDIA_LABEL + url.hostname.slice(STOCK_BACKEND_LABEL.length)
    return `${url.protocol}//${url.host}`
}

/** scheme://host for a URL or bare host, or "" for anything unusable. */
function originOf(raw?: string): string {
    const value = (raw ?? "").trim()
    if (!value) return ""
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
    try {
        const url = new URL(withScheme)
        return url.host && isBrowserReachable(url.hostname) ? `${url.protocol}//${url.host}` : ""
    } catch {
        return ""
    }
}

/**
 * A hostname a browser could actually resolve on the public internet.
 *
 * The check is for a dot, and it is not pedantry. `new URL()` accepts any single
 * word as a hostname, so the literal string "undefined" from an unset variable
 * parses to a perfectly valid origin and lands in an allowlist looking like
 * configuration. A Docker-internal name like `minio` does the same thing and is
 * equally unreachable from the browser that has to enforce the list.
 */
function isBrowserReachable(hostname: string): boolean {
    return hostname === "localhost" || hostname.includes(".")
}

/** Resolve from process.env, so callers do not each repeat the variable names. */
export function mediaOriginFromEnv(): string {
    return mediaOrigin(process.env.NEXT_PUBLIC_MINIO_URL, process.env.NEXT_PUBLIC_BACKEND_URL)
}

/** One entry of next.config's images.remotePatterns. */
export interface RemotePattern {
    protocol: "http" | "https"
    hostname: string
    port?: string
}

/**
 * The hosts `next/image` may fetch from: local development, and this install's
 * object store.
 *
 * Deliberately not a wildcard over the parent domain. The optimiser fetches
 * whatever URL it is handed, so the allowlist is also the blast radius of an
 * injected image src, and "every subdomain we own" is a much larger one than
 * "the object store".
 */
export function imageRemotePatterns(origin = mediaOriginFromEnv()): RemotePattern[] {
    const patterns: RemotePattern[] = [
        // The API and the object store as they run under `pnpm dev`.
        { protocol: "http", hostname: "localhost", port: "3000" },
        { protocol: "http", hostname: "localhost", port: "9000" },
    ]

    if (!origin) return patterns

    const { protocol, hostname, port } = new URL(origin)
    patterns.push({
        protocol: protocol === "http:" ? "http" : "https",
        hostname,
        ...(port ? { port } : {}),
    })
    return patterns
}
