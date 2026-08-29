import { describe, expect, it } from "vitest"
import { buildCsp, originsFrom } from "./csp"

/**
 * The failure mode worth testing is not "the header is wrong", it is "the header
 * looks configured and allows nothing". Interpolating an unset environment
 * variable writes the literal string "undefined" into the policy, which is a
 * valid host expression, so the page silently fails to reach its own backend and
 * the header still reads as though someone thought about it.
 */

describe("originsFrom", () => {
    it("returns the https origin and its websocket twin", () => {
        expect(originsFrom("https://api.example.com")).toEqual([
            "https://api.example.com",
            "wss://api.example.com",
        ])
    })

    it("pairs ws with http, not wss", () => {
        expect(originsFrom("http://localhost:3000")).toEqual([
            "http://localhost:3000",
            "ws://localhost:3000",
        ])
    })

    it("accepts a bare host, which is how the MQTT broker is usually configured", () => {
        expect(originsFrom("mqtt.example.com")).toEqual([
            "https://mqtt.example.com",
            "wss://mqtt.example.com",
        ])
    })

    it("keeps the port, because a wrong port is a blocked connection", () => {
        expect(originsFrom("https://api.example.com:8443")[0]).toBe("https://api.example.com:8443")
    })

    it("returns nothing for unset, blank or unparseable values", () => {
        expect(originsFrom(undefined)).toEqual([])
        expect(originsFrom("")).toEqual([])
        expect(originsFrom("   ")).toEqual([])
        expect(originsFrom("://")).toEqual([])
    })
})

describe("buildCsp", () => {
    const configured = {
        backendUrl: "https://api.example.com",
        collaborationUrl: "https://collab.example.com",
        livekitUrl: "https://lk.example.com",
        mqttHost: "mqtt.example.com",
        appUrl: "https://app.example.com",
    }

    it("never emits the string undefined, whatever is unset", () => {
        for (const policy of [buildCsp({}), buildCsp({ backendUrl: undefined }), buildCsp(configured)]) {
            expect(policy).not.toContain("undefined")
            expect(policy).not.toContain("null")
        }
    })

    it("allows the configured services to be reached", () => {
        const policy = buildCsp(configured)
        const connect = policy.split("; ").find((d) => d.startsWith("connect-src")) ?? ""
        for (const origin of [
            "https://api.example.com",
            "wss://collab.example.com",
            "wss://lk.example.com",
            "wss://mqtt.example.com",
        ]) {
            expect(connect).toContain(origin)
        }
    })

    it("still produces a usable policy with nothing configured", () => {
        const policy = buildCsp({})
        expect(policy).toContain("default-src 'self'")
        expect(policy).toContain("object-src 'none'")
    })

    it("locks down the directives that do not depend on configuration", () => {
        const policy = buildCsp(configured)
        expect(policy).toContain("object-src 'none'")
        expect(policy).toContain("base-uri 'self'")
        expect(policy).toContain("form-action 'self'")
        expect(policy).toContain("frame-ancestors 'self'")
    })

    it("does not fall back to a blanket https:, which would allow any host", () => {
        const policy = buildCsp(configured)
        expect(policy).not.toMatch(/(^|[ ;])https:([ ;]|$)/)
        expect(policy).not.toContain("*")
    })

    it("states every directive rather than leaning on default-src", () => {
        const policy = buildCsp(configured)
        for (const directive of [
            "script-src",
            "style-src",
            "font-src",
            "img-src",
            "media-src",
            "connect-src",
            "worker-src",
            "frame-src",
        ]) {
            expect(policy).toContain(`${directive} `)
        }
    })

    it("does not repeat an origin that several services share", () => {
        const policy = buildCsp({
            backendUrl: "https://one.example.com",
            collaborationUrl: "https://one.example.com",
        })
        const connect = policy.split("; ").find((d) => d.startsWith("connect-src")) ?? ""
        const occurrences = connect.split("https://one.example.com").length - 1
        expect(occurrences).toBe(1)
    })
})

describe("originsFrom refuses a hostname a browser cannot reach", () => {
    it("rejects the literal string an unset variable produces", () => {
        // The module's own header calls this out as the reason it is a function.
        // It guarded against empty and not against "undefined", which parses to a
        // valid origin and reads in the header as a host somebody configured.
        for (const input of ["undefined", "null", "NaN"]) {
            expect(originsFrom(input), `input: ${input}`).toEqual([])
        }
    })

    it("rejects a container name, which only resolves inside the network", () => {
        // The browser enforces this policy, and it is not on the Docker network.
        expect(originsFrom("http://minio:9000")).toEqual([])
    })

    it("still allows localhost for development", () => {
        expect(originsFrom("http://localhost:3000")).toEqual([
            "http://localhost:3000",
            "ws://localhost:3000",
        ])
    })
})
