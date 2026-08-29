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

import { originOf } from "./origin"

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

/** Resolve from process.env, so callers do not each repeat the variable names. */
export function mediaOriginFromEnv(): string {
    return mediaOrigin(process.env.NEXT_PUBLIC_MINIO_URL, process.env.NEXT_PUBLIC_BACKEND_URL)
}

/**
 * The one configuration this module cannot rescue, described in the build log.
 *
 * A backend at api.acme.com rather than onecamp-backend.acme.com is legitimate
 * and defeats the convention, so nothing is derived and both allowlists come up
 * short. The install then works in every respect except that avatars and
 * attachments do not appear, which reads as a broken product rather than as a
 * missing setting: `next/image` returns 400 and the CSP reports a violation, and
 * neither says "you did not configure the object store".
 *
 * Returns null when there is nothing to say, so the caller stays a one-liner.
 * Deliberately a warning rather than a thrown error: an operator who genuinely
 * serves files elsewhere should not be blocked from building, and the build log
 * is where a person is already looking when they set this up.
 */
export function mediaOriginWarning(
    explicit = process.env.NEXT_PUBLIC_MINIO_URL,
    backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL,
): string | null {
    if (mediaOrigin(explicit, backendUrl)) return null

    const backend = originOf(backendUrl)
    if (!backend) return null // nothing configured yet; not this module's complaint

    // Local development is not a misconfiguration. The backend runs on
    // localhost:3000 and the object store on localhost:9000, and both ports are
    // in the allowlist unconditionally, so there is nothing here to fix. Warning
    // anyway would put this line in front of every developer on every build,
    // which is how a warning stops being read by the time it matters.
    if (new URL(backend).hostname === "localhost") return null

    return (
        `Could not work out where uploaded files are served from. ` +
        `NEXT_PUBLIC_BACKEND_URL is ${backendUrl}, which does not start with ` +
        `"${STOCK_BACKEND_LABEL}.", so the "${STOCK_MEDIA_LABEL}." host cannot be derived from it. ` +
        `Avatars and attachments will not load. Set NEXT_PUBLIC_MINIO_URL to your object store.`
    )
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
