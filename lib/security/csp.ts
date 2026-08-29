/**
 * Content-Security-Policy, built from the same NEXT_PUBLIC_* values the app
 * already uses to reach its services.
 *
 * WHY IT IS GENERATED RATHER THAN WRITTEN OUT. OneCamp is self-hosted: every
 * install has different origins for its backend, collaboration service, LiveKit
 * and MQTT broker. A policy with our hostnames in it would block every customer
 * except us, and a policy loose enough to suit everyone (https:) would block
 * nothing worth blocking. Deriving it from the configured origins means a
 * customer's own domains are allowed, and nothing else is.
 *
 * WHY IT SHIPS REPORT-ONLY FIRST. A wrong CSP takes the whole product down, and
 * this one has to satisfy Tiptap, LiveKit, an MQTT websocket, uploads and Firebase
 * push at once. Report-Only reports what WOULD have been blocked without blocking
 * it, so the policy can be corrected against real traffic before it is enforced.
 * It is a validation window, not a destination: report-only forever is
 * observability with no protection.
 *
 * WHAT IT DOES NOT DO. There are no nonces, because nonce-based script-src
 * requires every page to be dynamically rendered, and this app is mostly a static
 * shell. Without a nonce, script-src needs 'unsafe-inline' for Next.js's own
 * bootstrap, so this policy does not stop injected inline script. It still stops
 * loading script from another origin, framing by a third party, form submission
 * to an attacker, <base> hijacking and plugin embedding, which is most of what a
 * CSP is asked to do in a review.
 */

import { mediaOriginFromEnv } from "./mediaOrigin"
import { parseOrigin } from "./origin"

/** The env values the policy is derived from. Passed in so the builder is pure. */
export interface CspOrigins {
    backendUrl?: string
    /** Object store serving avatars and attachments. See mediaOrigin.ts. */
    mediaUrl?: string
    collaborationUrl?: string
    livekitUrl?: string
    mqttHost?: string
    appUrl?: string
}

/**
 * Origins for one configured URL: the http(s) origin and its websocket twin.
 *
 * Returns [] for anything unusable. That case is the whole reason this is a
 * function: interpolating an unset variable straight into the header writes the
 * literal string "undefined" into the policy, which is a valid host expression
 * and silently allows nothing while looking configured.
 */
export function originsFrom(raw?: string): string[] {
    const url = parseOrigin(raw)
    if (!url) return []
    const ws = url.protocol === "http:" ? "ws:" : "wss:"
    return [`${url.protocol}//${url.host}`, `${ws}//${url.host}`]
}

/**
 * Where violation reports go: THIS install's own API, never ours.
 *
 * The policy shipped Report-Only with no collector at all, so every violation
 * went to the individual visitor's browser console and nowhere else. The comment
 * on this module describes a validation window before enforcing; without a
 * collector that window gathers nothing and the policy can never be promoted.
 *
 * It has to be the customer's own backend. OneCamp is self-hosted and the whole
 * argument for it is that their data stays on their infrastructure; a policy that
 * posted reports to us would mean every install quietly telling us which pages
 * its users open and what those pages tried to load.
 *
 * Cross-origin (the app and the API are different subdomains), so the browser
 * sends a CORS preflight first and the API answers it. Returns "" when there is
 * no usable backend, because "report-uri " with nothing after it is a malformed
 * directive and browsers differ on whether that invalidates the whole policy.
 */
export function cspReportEndpoint(backendUrl?: string): string {
    const origin = originsFrom(backendUrl)[0]
    return origin ? `${origin}/public/csp-report` : ""
}

/**
 * The group name tying the CSP's report-to directive to the Reporting-Endpoints
 * header. Exported so next.config cannot drift from the policy: if these two
 * strings stop matching, reports go nowhere and nothing says so.
 */
export const CSP_REPORT_GROUP = "csp-endpoint"

/** Deduplicate while keeping order, so the header reads predictably. */
function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))]
}

// Firebase Cloud Messaging registers and polls from these. Named explicitly
// rather than allowing *.googleapis.com, which would also permit every other
// Google API.
const FIREBASE_CONNECT = [
    "https://fcmregistrations.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://firebase.googleapis.com",
]

/**
 * buildCsp returns the policy string for the configured origins.
 *
 * Every directive is stated, including the ones that fall back to default-src,
 * because a reviewer reads the header and an unstated directive looks like an
 * oversight rather than a decision.
 */
export function buildCsp(origins: CspOrigins): string {
    const backend = originsFrom(origins.backendUrl)
    const media = originsFrom(origins.mediaUrl)
    const collab = originsFrom(origins.collaborationUrl)
    const livekit = originsFrom(origins.livekitUrl)
    const mqtt = originsFrom(origins.mqttHost)
    const app = originsFrom(origins.appUrl)

    const services = unique([...backend, ...media, ...collab, ...livekit, ...mqtt, ...app])

    const directives: Record<string, string[]> = {
        "default-src": ["'self'"],

        // 'unsafe-inline' is required by Next.js's bootstrap while there is no
        // nonce. See the note at the top: this is the known weak point.
        "script-src": ["'self'", "'unsafe-inline'"],

        // Tailwind and Tiptap both write inline styles at runtime.
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],

        // data: for inline avatars and icons, blob: for locally generated
        // previews and pasted images before they are uploaded.
        "img-src": ["'self'", "data:", "blob:", ...services],
        "media-src": ["'self'", "blob:", ...services],

        // The API, the collaboration websocket, LiveKit signalling, the MQTT
        // broker and push registration.
        "connect-src": ["'self'", "blob:", ...services, ...FIREBASE_CONNECT],

        // Web workers and the collaboration provider are created from blobs.
        "worker-src": ["'self'", "blob:"],

        // The document preview (PDF / DOCX) renders in a same-origin iframe, and
        // the board UI studio uses a sandboxed blob iframe.
        "frame-src": ["'self'", "blob:", "data:"],

        // Nothing embeds OneCamp. This is the header version of X-Frame-Options,
        // which is also set for browsers that predate CSP support here.
        "frame-ancestors": ["'self'"],

        // No plugins, no <base> rewriting, and forms may only post back to us.
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
    }

    // BOTH reporting mechanisms, because neither covers every browser. report-uri
    // is deprecated and is still the only one Firefox and Safari act on; report-to
    // is the modern one that Chrome and Edge batch and retry. A browser that
    // understands report-to ignores report-uri, so naming both costs nothing and
    // omitting either loses a slice of the traffic the validation window is for.
    const reportTo = cspReportEndpoint(origins.backendUrl)
    if (reportTo) {
        directives["report-uri"] = [reportTo]
        directives["report-to"] = [CSP_REPORT_GROUP]
    }

    return Object.entries(directives)
        .map(([name, values]) => `${name} ${unique(values).join(" ")}`)
        .join("; ")
}

/**
 * The Reporting-Endpoints header value, or "" when there is nothing to report to.
 *
 * report-to names a group; this header is what binds that name to a URL. Sending
 * the directive without this header is the quiet failure: the policy looks
 * complete and the browser has no address for the group.
 */
export function reportingEndpointsFromEnv(): string {
    const endpoint = cspReportEndpoint(process.env.NEXT_PUBLIC_BACKEND_URL)
    return endpoint ? `${CSP_REPORT_GROUP}="${endpoint}"` : ""
}

/** Build the policy from process.env. Kept separate so buildCsp stays pure. */
export function cspFromEnv(): string {
    return buildCsp({
        backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
        // Not a variable of its own in most installs: derived from the backend
        // host by convention, so a stock deployment needs no extra setting.
        mediaUrl: mediaOriginFromEnv(),
        collaborationUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
        livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        mqttHost: process.env.NEXT_PUBLIC_MQTT_HOST,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
    })
}
