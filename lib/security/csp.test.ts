import { describe, expect, it } from "vitest"
import { buildCsp, originsFrom, cspReportEndpoint, CSP_REPORT_GROUP } from "./csp"

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

describe("violation reporting", () => {
    const csp = buildCsp({ backendUrl: "https://onecamp-backend.acme.com/" })

    it("names both mechanisms, because neither covers every browser", () => {
        // report-uri is deprecated and is the only one Firefox and Safari act on.
        // report-to is what Chrome and Edge batch and retry. A browser that
        // understands report-to ignores report-uri, so both is correct.
        expect(csp).toContain("report-uri https://onecamp-backend.acme.com/public/csp-report")
        expect(csp).toContain(`report-to ${CSP_REPORT_GROUP}`)
    })

    it("reports to this install's own API and never to ours", () => {
        // The product's whole argument is that a customer's data stays on their
        // infrastructure. A policy posting reports to us would tell us which
        // pages their users open and what those pages tried to load.
        const endpoint = cspReportEndpoint("https://onecamp-backend.acme.com/")
        expect(endpoint.startsWith("https://onecamp-backend.acme.com/")).toBe(true)
        expect(csp).not.toMatch(/onemana\.dev/)
    })

    it("emits no reporting directive when there is no backend to report to", () => {
        // "report-uri " with nothing after it is a malformed directive, and
        // browsers differ on whether that invalidates the whole policy.
        const bare = buildCsp({})
        expect(bare).not.toContain("report-uri")
        expect(bare).not.toContain("report-to")
        expect(cspReportEndpoint(undefined)).toBe("")
        expect(cspReportEndpoint("not a url")).toBe("")
    })

    it("keeps the group name in the policy and the header identical", () => {
        // THE SILENT FAILURE THIS PINS. report-to names a group; the
        // Reporting-Endpoints header binds that name to a URL. If the two strings
        // drift apart the policy still looks complete and reports go nowhere,
        // which is indistinguishable from having no violations.
        const header = `${CSP_REPORT_GROUP}="${cspReportEndpoint("https://onecamp-backend.acme.com/")}"`
        const group = csp.match(/report-to ([^;]+)/)?.[1].trim()
        expect(group).toBeTruthy()
        expect(header.startsWith(`${group}=`)).toBe(true)
    })
})
