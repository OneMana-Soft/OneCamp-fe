import { PERMISSIONS_POLICY } from "./lib/security/permissionsPolicy";
import type { NextConfig } from "next";
import { CALL_PAGES, cspFromEnv, reportingEndpointsFromEnv } from "./lib/security/csp";
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
// Report-only for now. See the note above before enforcing.
const CSP_HEADER = "Content-Security-Policy-Report-Only";

const securityHeaders = [
    {
        key: CSP_HEADER,
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
        // microphone + display-capture stay open for LiveKit, and the two
        // publickey-credentials features for passkeys: with get=() the
        // browser refused every passkey sign-in before showing anything.
        // lib/security/permissionsPolicy.test.ts keeps them open.
        value: PERMISSIONS_POLICY,
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

// One id per build, given to Next as its build id and baked into the page, so
// the "A new version is ready" pill (hooks/useUpdateReady) can tell this
// page's build from the one the server runs now (app/build-id). A deploy
// pipeline may pin it with ONECAMP_BUILD_ID.
// Kept in the environment, so the build's workers, which load this file
// again, use the same id.
const buildId = (process.env.ONECAMP_BUILD_ID ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

const nextConfig: NextConfig = {
    // A self-contained server for the container build (see Dockerfile). Off
    // otherwise, so a Vercel or `next start` deployment is unchanged.
    output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
    // `next dev` (Next 16.3) writes AGENTS.md and CLAUDE.md into the root when it
    // detects an AI coding agent: instructions every agent working in the tree
    // would read, and files that could be committed with other work. Off, and
    // .gitignore names both (app/agentRules.test.ts).
    agentRules: false,
    reactStrictMode: false,
    generateBuildId: async () => buildId,
    env: { NEXT_PUBLIC_BUILD_ID: buildId },
    experimental: {
        // Every build starts from nothing. Next 16.3 starts `next build` from
        // Turbopack's cache in .next/cache/turbopack, and Vercel restores
        // .next/cache before each deploy: on 21 Oct 2026 that shipped
        // stylesheets from before their change (app/agentRules.test.ts).
        turbopackFileSystemCacheForBuild: false,
    },
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
            // The pages a call can be on may compile WebAssembly, for the call
            // effects (lib/calls/processors); every other page may not. A later
            // rule's header replaces an earlier one's of the same name.
            ...CALL_PAGES.map((source) => ({ source, headers: [{ key: CSP_HEADER, value: cspFromEnv({ wasm: true }) }] })),
            // The call effects' WebAssembly and model (lib/calls/processors):
            // every path names its version or its hash, so a browser keeps
            // them for good rather than fetch 9 MB again for every call.
            {
                source: "/calls/:dir(vendor|models)/:path*",
                headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
        ];
    },
    // Design v3 renamed two places (shell N1). Inbox is notifications and
    // nudges, the page that was Activity; Mail is the person's Gmail, which
    // was Inbox. Old links keep working: /app/activity (and its ?tab=) opens
    // Inbox, and the Gmail connect callback, which still returns to
    // /app/inbox?connector=..., lands on Mail. Next carries the query string
    // across. Temporary, so a later rename is free to move them again.
    async redirects() {
        return [
            { source: "/app/activity", destination: "/app/inbox", permanent: false },
            {
                source: "/app/inbox",
                has: [{ type: "query", key: "connector" }],
                destination: "/app/mail",
                permanent: false,
            },
        ];
    },
};

export default nextConfig;
