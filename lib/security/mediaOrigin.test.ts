import { describe, expect, it } from "vitest"

import { imageRemotePatterns, mediaOrigin, mediaOriginWarning } from "./mediaOrigin"

/**
 * The bug being pinned: remotePatterns held our own object-store hostname as a
 * literal, so `next/image` returned 400 for every avatar and attachment on every
 * install that was not ours. It looked like a broken image, not a config error,
 * and there was nothing to read that would have said so.
 */

describe("mediaOrigin", () => {
    it("prefers an explicitly configured object store", () => {
        expect(mediaOrigin("https://files.acme.com", "https://onecamp-backend.acme.com/")).toBe(
            "https://files.acme.com",
        )
    })

    it("accepts an explicit value as a bare host", () => {
        // How the MQTT host is already configured, so somebody will write this one
        // the same way.
        expect(mediaOrigin("files.acme.com")).toBe("https://files.acme.com")
    })

    it("derives the stock host from the backend, so a normal install needs no setting", () => {
        for (const [backend, expected] of [
            ["https://onecamp-backend.acme.com/", "https://onecamp-backend.acme.com".replace("backend", "minio")],
            ["https://onecamp-backend.team.acme.co.uk", "https://onecamp-minio.team.acme.co.uk"],
            ["http://onecamp-backend.acme.com:8080", "http://onecamp-minio.acme.com:8080"],
        ] as const) {
            expect(mediaOrigin(undefined, backend), `backend: ${backend}`).toBe(expected)
        }
    })

    it("refuses to guess when the backend does not follow the convention", () => {
        // A backend at api.acme.com says nothing about where the object store is.
        // Inventing one would put a host nobody uses into two allowlists.
        expect(mediaOrigin(undefined, "https://api.acme.com")).toBe("")
        expect(mediaOrigin(undefined, "https://acme.com")).toBe("")
    })

    it("returns empty rather than a broken value for unusable input", () => {
        for (const input of ["", "   ", "http://", undefined]) {
            expect(mediaOrigin(input, input)).toBe("")
        }
    })

    it("never returns the literal string 'undefined'", () => {
        // The failure mode this whole module exists to avoid: an unset variable
        // interpolated into an allowlist reads as a hostname and allows nothing
        // while looking configured.
        expect(mediaOrigin(String(undefined))).not.toContain("undefined")
    })
})

describe("imageRemotePatterns", () => {
    it("always allows local development", () => {
        const hosts = imageRemotePatterns("").map((p) => `${p.hostname}:${p.port ?? ""}`)
        expect(hosts).toEqual(["localhost:3000", "localhost:9000"])
    })

    it("allows this install's object store and nothing else", () => {
        const patterns = imageRemotePatterns("https://onecamp-minio.acme.com")
        expect(patterns).toContainEqual({ protocol: "https", hostname: "onecamp-minio.acme.com" })

        // Not a wildcard over the parent domain: the optimiser fetches whatever
        // URL it is handed, so this allowlist is also the blast radius.
        for (const p of patterns) expect(p.hostname).not.toContain("*")
    })

    it("carries a non-default port through", () => {
        expect(imageRemotePatterns("http://onecamp-minio.acme.com:9000")).toContainEqual({
            protocol: "http",
            hostname: "onecamp-minio.acme.com",
            port: "9000",
        })
    })

    it("names no host belonging to anyone but the configured install", () => {
        // The regression guard. Any hostname here that was not derived from the
        // caller's own configuration is somebody else's server.
        const patterns = imageRemotePatterns("https://onecamp-minio.acme.com")
        const foreign = patterns
            .map((p) => p.hostname)
            .filter((h) => h !== "localhost" && !h.endsWith("acme.com"))
        expect(foreign).toEqual([])
    })
})

describe("mediaOriginWarning", () => {
    it("says nothing when the object store resolved", () => {
        expect(mediaOriginWarning(undefined, "https://onecamp-backend.acme.com")).toBeNull()
        expect(mediaOriginWarning("https://files.acme.com", "https://api.acme.com")).toBeNull()
    })

    it("says nothing during local development", () => {
        // localhost:3000 and localhost:9000 are both allowlisted unconditionally,
        // so there is nothing to fix. This fired on every dev build before it was
        // fixed, which is how a warning stops being read by the time it matters.
        expect(mediaOriginWarning(undefined, "http://localhost:3000/")).toBeNull()
        expect(mediaOriginWarning(undefined, "http://localhost:3000")).toBeNull()
    })

    it("says nothing before anything is configured", () => {
        // A fresh clone with placeholders is not a misconfiguration to shout about.
        expect(mediaOriginWarning(undefined, undefined)).toBeNull()
        expect(mediaOriginWarning(undefined, "")).toBeNull()
    })

    it("names the variable to set when the convention does not apply", () => {
        // The case this exists for: a legitimate backend hostname that the
        // derivation cannot work from. Silence here is images that never load.
        const w = mediaOriginWarning(undefined, "https://api.acme.com")
        expect(w).toContain("NEXT_PUBLIC_MINIO_URL")
        expect(w).toContain("api.acme.com")
    })
})
