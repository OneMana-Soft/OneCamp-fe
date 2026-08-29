import { describe, expect, it } from "vitest"

import { originOf, parseOrigin } from "./origin"

/**
 * The rule these assertions pin used to exist twice, once in the CSP builder and
 * once in the image allowlist, and both copies had the same hole. Testing it here
 * is the point of having extracted it: there is now one place to get it wrong.
 */

describe("parseOrigin", () => {
    it("accepts a full URL and keeps its scheme and port", () => {
        for (const [input, expected] of [
            ["https://acme.com", "https://acme.com"],
            ["https://acme.com/", "https://acme.com"],
            ["https://acme.com/some/path", "https://acme.com"],
            ["http://acme.com:8080", "http://acme.com:8080"],
            ["wss://collab.acme.com", "wss://collab.acme.com"],
        ] as const) {
            expect(originOf(input), `input: ${input}`).toBe(expected)
        }
    })

    it("accepts a bare host, which is how the broker is configured", () => {
        expect(originOf("emqx.acme.com")).toBe("https://emqx.acme.com")
    })

    it("rejects the string an unset variable produces", () => {
        // THE BUG. `new URL("https://undefined")` succeeds and yields hostname
        // "undefined", so both allowlists used to permit a host by that name and
        // look configured while permitting nothing real.
        for (const input of ["undefined", "null", "NaN", "https://undefined"]) {
            expect(parseOrigin(input), `input: ${input}`).toBeNull()
        }
    })

    it("rejects a container name, which resolves only inside the compose network", () => {
        // Every consumer builds a list the browser enforces, and the browser is
        // not on that network.
        for (const input of ["http://minio:9000", "go-service", "http://emqx"]) {
            expect(parseOrigin(input), `input: ${input}`).toBeNull()
        }
    })

    it("allows localhost, the one single-label name that is really reachable", () => {
        expect(originOf("http://localhost:3000")).toBe("http://localhost:3000")
    })

    it("returns null for anything unparseable rather than throwing", () => {
        // Callers are assembling lists. One bad entry should shorten the list, not
        // fail the build.
        for (const input of ["", "   ", "http://", "://nope", undefined]) {
            expect(parseOrigin(input), `input: ${JSON.stringify(input)}`).toBeNull()
        }
    })

    it("never produces an origin containing the word undefined", () => {
        // The property, stated directly, so it survives a rewrite of the rule.
        for (const input of [String(undefined), `https://${undefined}`, "undefined.undefined"]) {
            const out = originOf(input)
            if (out) expect(out).not.toMatch(/^https?:\/\/undefined(:|$)/)
        }
    })
})
