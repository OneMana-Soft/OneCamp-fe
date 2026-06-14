import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Default security headers applied to every response. CSP is omitted
 * here because it interacts with Tiptap / LiveKit / MQTT in ways that
 * need per-route tuning; the upstream proxy (Traefik) is the correct
 * place to enforce it.
 *
 * X-Frame-Options is also set by middleware on auth routes; this
 * default catches every other path (e.g. static assets).
 */
const securityHeaders = [
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
        remotePatterns: [
            {
                protocol: "http",
                hostname: "localhost",
                port: "3000",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "9000",
            },
            {
                protocol: "https",
                hostname: "onecamp-minio.onemana.dev",
            },
            {
                protocol: "http",
                hostname: "onecamp-minio.onemana.dev",
            },
        ],
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
