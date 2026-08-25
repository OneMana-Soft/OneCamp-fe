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

/** The env values the policy is derived from. Passed in so the builder is pure. */
export interface CspOrigins {
    backendUrl?: string
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
    const value = (raw ?? "").trim()
    if (!value) return []

    // A bare host (the MQTT broker is often configured this way) has no scheme
    // for the URL parser to work with.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`

    let url: URL
    try {
        url = new URL(withScheme)
    } catch {
        return []
    }
    if (!url.host) return []

    const ws = url.protocol === "http:" ? "ws:" : "wss:"
    return [`${url.protocol}//${url.host}`, `${ws}//${url.host}`]
}

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
    const collab = originsFrom(origins.collaborationUrl)
    const livekit = originsFrom(origins.livekitUrl)
    const mqtt = originsFrom(origins.mqttHost)
    const app = originsFrom(origins.appUrl)

    const services = unique([...backend, ...collab, ...livekit, ...mqtt, ...app])

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

    return Object.entries(directives)
        .map(([name, values]) => `${name} ${unique(values).join(" ")}`)
        .join("; ")
}

/** Build the policy from process.env. Kept separate so buildCsp stays pure. */
export function cspFromEnv(): string {
    return buildCsp({
        backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
        collaborationUrl: process.env.NEXT_PUBLIC_COLLABORATION_URL,
        livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        mqttHost: process.env.NEXT_PUBLIC_MQTT_HOST,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
    })
}
