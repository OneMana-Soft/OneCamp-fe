import { describe, it, expect } from "vitest"
import { parseAuditMetadata, auditReason } from "./auditMetadata"

/**
 * These render in the admin audit log, on every row, from a blob written by any recorder in
 * the backend. Two properties matter more than the formatting: it must never throw, and it
 * must never silently drop a field — an audit view that hides evidence is worse than one
 * that shows it awkwardly.
 */

describe("parseAuditMetadata — nothing to show", () => {
    it.each([
        ["undefined", undefined],
        ["null", null],
        ["empty string", ""],
        ["whitespace", "   \n "],
    ])("returns null for %s so the caller omits the disclosure entirely", (_l, input) => {
        expect(parseAuditMetadata(input as string | null | undefined)).toBeNull()
    })
})

describe("parseAuditMetadata — a real MCP refusal", () => {
    // The exact shape business/MCPServer/audit.go records.
    const raw = JSON.stringify({
        token_id: "tok-1",
        principal_user_id: "user-1",
        tool: "read_doc",
        decision: "refused",
        reason: "the originating person has no grant on this private doc",
        client_name: "Claude",
        client_version: "1.2.3",
        enforced_depth: 1,
        declared_depth: 1,
        agent_id: "agent-1",
        agent_name: "Triage Bot",
    })

    it("surfaces the reason, which is the sentence a reviewer came for", () => {
        expect(auditReason(raw)).toBe("the originating person has no grant on this private doc")
    })

    it("marks the row as refused from the decision word", () => {
        expect(parseAuditMetadata(raw)?.refused).toBe(true)
    })

    it("keeps every recorded field — an audit view must not hide evidence", () => {
        const meta = parseAuditMetadata(raw)!
        const keys = meta.fields.map((f) => f.key)
        for (const k of Object.keys(JSON.parse(raw))) {
            expect(keys, `${k} was dropped`).toContain(k)
        }
        expect(meta.fields).toHaveLength(11)
    })

    it("puts the reason first so the row reads as an explanation", () => {
        expect(parseAuditMetadata(raw)!.fields[0].key).toBe("reason")
    })

    it("labels the agent by name rather than leaving a hex string", () => {
        const meta = parseAuditMetadata(raw)!
        const agent = meta.fields.find((f) => f.key === "agent_name")!
        expect(agent.label).toBe("Agent")
        expect(agent.value).toBe("Triage Bot")
    })
})

describe("parseAuditMetadata — refusal detection follows a convention, not a feature", () => {
    it.each([
        ['allowed: false', { allowed: false }, true],
        ['decision: "refused"', { decision: "refused" }, true],
        ['decision: "Refused"', { decision: "Refused" }, true],
        ['allowed: true', { allowed: true }, false],
        ['decision: "allowed"', { decision: "allowed" }, false],
        ["neither field", { tool: "x" }, false],
    ])("%s -> refused=%s", (_label, obj, expected) => {
        expect(parseAuditMetadata(JSON.stringify(obj))?.refused).toBe(expected)
    })

    it("does not treat a missing outcome as permitted", () => {
        // A recorder that says nothing about the outcome must show no outcome, rather than
        // being rendered as an allow.
        const meta = parseAuditMetadata(JSON.stringify({ note: "x" }))!
        expect(meta.refused).toBe(false)
        expect(meta.fields.map((f) => f.key)).not.toContain("allowed")
    })
})

describe("parseAuditMetadata — generic over any recorder's shape", () => {
    it("humanises an unmapped key rather than hiding the field", () => {
        const meta = parseAuditMetadata(JSON.stringify({ some_new_field: "v" }))!
        expect(meta.fields[0].label).toBe("Some new field")
        expect(meta.fields[0].value).toBe("v")
    })

    it("labels the same logical field identically however it was spelled", () => {
        // Two backends recording the same thing as some_new_field and someNewField must not
        // read as two different fields in the log.
        const snake = parseAuditMetadata(JSON.stringify({ some_new_field: "v" }))!
        const camel = parseAuditMetadata(JSON.stringify({ someNewField: "v" }))!
        expect(camel.fields[0].label).toBe(snake.fields[0].label)
        expect(snake.fields[0].label).toBe("Some new field")
    })

    it("preserves an acronym so a key does not read as a typo", () => {
        const meta = parseAuditMetadata(JSON.stringify({ some_id: "v", a_url: "u" }))!
        const labels = meta.fields.map((f) => f.label)
        expect(labels).toContain("Some ID")
        expect(labels).toContain("A URL")
    })

    it("formats each value type readably", () => {
        const meta = parseAuditMetadata(
            JSON.stringify({
                a_bool_true: true,
                a_bool_false: false,
                a_number: 42,
                a_null: null,
                an_empty_string: "",
                a_list: ["x", "y"],
                an_empty_list: [],
                an_object: { k: "v" },
            }),
        )!
        const byKey = Object.fromEntries(meta.fields.map((f) => [f.key, f.value]))
        expect(byKey.a_bool_true).toBe("Yes")
        expect(byKey.a_bool_false).toBe("No")
        expect(byKey.a_number).toBe("42")
        expect(byKey.a_null).toBe("—")
        expect(byKey.an_empty_string).toBe("—")
        expect(byKey.a_list).toBe("x, y")
        expect(byKey.an_empty_list).toBe("—")
        expect(byKey.an_object).toBe('{"k":"v"}')
    })

    it("truncates a very long value so one row cannot swamp the list", () => {
        const long = "x".repeat(1000)
        const meta = parseAuditMetadata(JSON.stringify({ v: long }))!
        expect(meta.fields[0].value.length).toBeLessThan(long.length)
        expect(meta.fields[0].value.endsWith("…")).toBe(true)
    })

    it("keeps a non-object payload visible", () => {
        const meta = parseAuditMetadata(JSON.stringify("just a string"))!
        expect(meta.malformed).toBe(false)
        expect(meta.fields[0].value).toBe("just a string")
    })
})

describe("parseAuditMetadata — malformed input", () => {
    it("never throws, and surfaces the raw blob rather than dropping it", () => {
        const bad = "{not json at all"
        expect(() => parseAuditMetadata(bad)).not.toThrow()
        const meta = parseAuditMetadata(bad)!
        expect(meta.malformed).toBe(true)
        expect(meta.raw).toBe(bad)
        expect(meta.fields).toHaveLength(0)
    })

    it("reports no reason for a malformed blob rather than a partial one", () => {
        expect(auditReason("{not json")).toBe("")
    })

    it.each([
        ["a truncated object", '{"reason":"x"'],
        ["a lone brace", "{"],
        ["an array of junk", "[1,2,"],
        ["a NUL byte", "\u0000"],
    ])("survives %s", (_l, input) => {
        expect(() => parseAuditMetadata(input)).not.toThrow()
    })
})

describe("auditReason", () => {
    it("returns empty when there is no reason field, so nothing renders", () => {
        expect(auditReason(JSON.stringify({ tool: "x" }))).toBe("")
    })

    it("returns empty for a blank reason rather than an em dash", () => {
        // The em dash is right inside the detail table and wrong as an inline explanation.
        expect(auditReason(JSON.stringify({ reason: "" }))).toBe("")
        expect(auditReason(JSON.stringify({ reason: null }))).toBe("")
    })

    it("is stable for the same input", () => {
        const raw = JSON.stringify({ reason: "because" })
        expect(auditReason(raw)).toBe(auditReason(raw))
    })
})
