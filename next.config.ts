import type { NextConfig } from "next";
import { cspFromEnv, reportingEndpointsFromEnv } from "./lib/security/csp";
import { imageRemotePatterns, mediaOriginWarning } from "./lib/security/mediaOrigin";

const isProd = process.env.NODE_ENV === "production";

/**
 * Default security headers applied to every response.
 *
 * CSP used to be omitted here, deferred to "the upstream proxy". It was never
 * set there: a live check of the deployed app returned Permissions-Policy,
 * Referrer-Policy, HSTS, X-Content-Type-Options and X-Frame-Options, and no
 * Content-Security-Policy at all. Deferring it to another layer and not telling
 * that layer is the same as not having one.
 *
 * It is generated from the configured service origins (lib/security/csp.ts)
 * because this product is self-hosted and every install has different hostnames.
 * It ships REPORT-ONLY: the policy has to satisfy Tiptap, LiveKit, an MQTT
 * websocket, uploads and Firebase push simultaneously, and report-only reports
 * what would have broken without breaking it. Switch the key to
 * "Content-Security-Policy" once the reports are clean.
 *
 * X-Frame-Options is also set by middleware on auth routes; this
 * default catches every other path (e.g. static assets).
 */
const securityHeaders = [
    {
        // Report-only for now. See the note above before enforcing.
        key: "Content-Security-Policy-Report-Only",
        value: cspFromEnv(),
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "X-Frame-Options",
        // SAMEORIGIN allows the OneCamp app to embed its own preview
        // iframes (PDF / DOCX viewer) without being clickjack-iframed
        // by a third-party page.
        value: "SAMEORIGIN",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "Permissions-Policy",
        // Disable browser features OneCamp doesn't use. camera +
        // microphone + display-capture stay open for LiveKit.
        value: [
            "accelerometer=()",
            "ambient-light-sensor=()",
            "autoplay=(self)",
            "battery=()",
            "camera=(self)",
            "display-capture=(self)",
            "document-domain=()",
            "encrypted-media=()",
            "fullscreen=(self)",
            "geolocation=()",
            "gyroscope=()",
            "magnetometer=()",
            "microphone=(self)",
            "midi=()",
            "payment=()",
            "picture-in-picture=(self)",
            "publickey-credentials-get=()",
            "screen-wake-lock=()",
            "sync-xhr=()",
            "usb=()",
            "xr-spatial-tracking=()",
        ].join(", "),
    },
    {
        key: "Cross-Origin-Opener-Policy",
        // same-origin-allow-popups so OAuth pop-ups still work; pure
        // same-origin would break Google / GitHub login windows.
        value: "same-origin-allow-popups",
    },
];

// Said once, at build time, where somebody configuring this is already looking.
// The alternative is finding out from broken avatars in a browser.
const mediaWarning = mediaOriginWarning();
if (mediaWarning) console.warn(`\n  [OneCamp] ${mediaWarning}\n`);

// report-to in the policy names a GROUP; this header is what binds that name to a
// URL. Sending one without the other is the quiet failure the collector exists to
// end: the policy reads as complete and the browser has no address for the group.
// Conditional because a build with no backend configured should carry neither.
const reportingEndpoints = reportingEndpointsFromEnv();
if (reportingEndpoints) {
    securityHeaders.push({ key: "Reporting-Endpoints", value: reportingEndpoints });
}

const nextConfig: NextConfig = {
    reactStrictMode: false,
    // Strip console.log / console.debug from prod bundles to avoid
    // accidentally leaking request bodies, user objects, or tokens
    // via DevTools. We keep console.error / console.warn so the
    // legitimate operational logging the FE relies on still surfaces.
    compiler: isProd
        ? {
              removeConsole: { exclude: ["error", "warn"] },
          }
        : undefined,
    images: {
        // unoptimized: true,
        dangerouslyAllowLocalIP: true,
        // Derived from this install's own configuration. This list used to name
        // OUR object-store hostname as a literal, which meant `next/image`
        // returned 400 for every avatar and attachment on every install that was
        // not ours. See lib/security/mediaOrigin.ts.
        remotePatterns: imageRemotePatterns(),
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
