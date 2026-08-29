import { describe, expect, it } from "vitest"

// @ts-expect-error - plain ESM script, no type declarations by design
import { normaliseDomain, renderEnv } from "./setup-env.mjs"

/**
 * `pnpm configure` is the first command a buyer runs, and the only one where a
 * mistake is invisible: a fumbled domain produces a file that looks right and a
 * build that reaches nothing. So the parsing is tested rather than trusted.
 */

describe("normaliseDomain", () => {
    it("accepts what people actually type", () => {
        // Every one of these is a real shape somebody pastes: copied from a
        // browser bar, from a DNS panel, from an email.
        for (const [input, expected] of [
            ["acme.com", "acme.com"],
            ["  acme.com  ", "acme.com"],
            ["ACME.com", "acme.com"],
            ["https://acme.com", "acme.com"],
            ["https://acme.com/", "acme.com"],
            ["http://acme.com/some/path", "acme.com"],
            ["www.acme.com", "acme.com"],
            ["acme.com:8443", "acme.com"],
            ["acme.com.", "acme.com"], // fully-qualified, trailing dot
            ["team.acme.co.uk", "team.acme.co.uk"],
        ] as const) {
            expect(normaliseDomain(input), `input: ${input}`).toBe(expected)
        }
    })

    it("refuses what cannot be a domain", () => {
        // Returning null here is what produces "Not a domain" instead of a
        // config file full of nonsense.
        for (const input of ["", "   ", "localhost", "acme", "-acme.com", "acme-.com", "acme .com", "http://", null, undefined]) {
            expect(normaliseDomain(input as string), `input: ${JSON.stringify(input)}`).toBeNull()
        }
    })
})

describe("renderEnv", () => {
    const rendered = renderEnv("acme.com")

    it("sets every variable the app needs to reach a server", () => {
        for (const key of [
            "NEXT_PUBLIC_BACKEND_URL",
            "NEXT_PUBLIC_FRONTEND_URL",
            "NEXT_PUBLIC_APP_URL",
            "NEXT_PUBLIC_LIVEKIT_URL",
            "NEXT_PUBLIC_COLLABORATION_URL",
            "NEXT_PUBLIC_MQTT_HOST",
        ]) {
            expect(rendered, `${key} is missing from the generated file`).toContain(`${key}=`)
        }
    })

    it("puts every host under the domain it was given", () => {
        // The failure this prevents: one subdomain left pointing somewhere else
        // after an edit, which breaks exactly one feature and looks like a bug in
        // that feature.
        const hosts = [...rendered.matchAll(/^NEXT_PUBLIC_\w+=(.+)$/gm)].map(([, v]) =>
            v.replace(/^\w+:\/\//, "").replace(/\/$/, ""),
        )
        expect(hosts.length).toBe(6)
        for (const host of hosts) expect(host, `${host} is not under acme.com`).toMatch(/\.acme\.com$/)
    })

    it("writes URLs the build can parse", () => {
        // lib/env.ts validates NEXT_PUBLIC_BACKEND_URL as a URL and throws in
        // production, so a trailing-slash or scheme slip fails the build rather
        // than a page load.
        const backend = rendered.match(/^NEXT_PUBLIC_BACKEND_URL=(.+)$/m)?.[1]
        expect(() => new URL(backend!)).not.toThrow()
        expect(backend).toMatch(/^https:\/\/.+\/$/)
        expect(rendered).toMatch(/^NEXT_PUBLIC_COLLABORATION_URL=wss:\/\//m)
    })

    it("carries no Firebase project, so push stays off until configured", () => {
        expect(rendered).not.toContain("NEXT_PUBLIC_FIREBASE")
    })
})
