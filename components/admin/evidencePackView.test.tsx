import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import EvidencePackView, {
    cellText,
    sectionColumns,
    sectionRows,
    sectionTitle,
} from "@/components/admin/EvidencePackView"
import type { EvidencePack } from "@/services/settingsService"

afterEach(cleanup)

const pack = (over: Partial<EvidencePack> = {}): EvidencePack => ({
    pack: {
        generated_at: "2026-09-17T10:00:00Z",
        generated_by: "admin@example.com",
        from: "2026-06-19T00:00:00Z",
        to: "2026-09-17T00:00:00Z",
        product: "OneCamp",
    },
    integrity: {
        chain_verification: { ok: true, checked: 1204, message: "1204 entries verify", redacted: 3 },
        manifest: [
            { section: "audit_log", rows: 1204, sha256: "a".repeat(64), describes: "Every recorded action" },
            { section: "agent_actions", rows: 12, sha256: "b".repeat(64), describes: "What each agent was told" },
        ],
        pack_fingerprint: "f".repeat(64),
    },
    sections: {
        audit_log: [{ seq: 1, action: "agent.drill.refused" }],
        agent_actions: [{ agent: "triage", tool: "send_message" }],
    },
    how_to_verify: ["Recompute a row hash: SHA-256 over these fields."],
    limits: ["The chain proves integrity, not completeness."],
    ...over,
})

/**
 * The pack's sections are CONTRIBUTED by whichever packages an edition links, so
 * the set differs between builds and grows without this component being touched.
 * A renderer that knew the section names would silently drop a new one, which is
 * the single failure an evidence document must not have.
 */
describe("rendering a pack whose sections it does not know", () => {
    it("renders every section the manifest declares", () => {
        render(<EvidencePackView pack={pack()} />)
        expect(screen.getAllByText("Audit log").length).toBeGreaterThan(0)
        expect(screen.getAllByText("Agent actions").length).toBeGreaterThan(0)
    })

    it("renders a section this component has never heard of", () => {
        const p = pack({
            integrity: {
                ...pack().integrity,
                manifest: [{ section: "quantum_widgets", rows: 1, sha256: "c".repeat(64), describes: "Made up" }],
            },
            sections: { quantum_widgets: [{ colour: "green" }] },
        })
        render(<EvidencePackView pack={p} />)
        expect(screen.getAllByText("Quantum widgets").length).toBeGreaterThan(0)
        expect(screen.getByText("green")).toBeTruthy()
    })

    it("says a declared section is empty rather than omitting it", () => {
        // An omitted section reads as "somebody removed this", which is the
        // accusation the pack exists to answer.
        const p = pack({ sections: { audit_log: [], agent_actions: [] } })
        render(<EvidencePackView pack={p} />)
        expect(screen.getAllByText("Nothing in this window.").length).toBe(2)
    })
})

describe("what the document says about itself", () => {
    it("names the pack it is a reading of, and sends verification to the file", () => {
        render(<EvidencePackView pack={pack()} />)
        expect(screen.getByText(/reading of pack/i)).toBeTruthy()
        // The fingerprint is a digest of the JSON bytes. A printed page cannot be
        // verified and must never look as though it can.
        expect(screen.getByText(/verification is done against the file/i)).toBeTruthy()
    })

    it("reports redacted rows separately from checked ones", () => {
        // "I verified this row" and "I took this row's word for it" are different
        // statements, and the server reports them separately for that reason.
        render(<EvidencePackView pack={pack()} />)
        expect(screen.getByText(/3 taken at their word/i)).toBeTruthy()
    })

    it("carries the verification steps and the limits in full", () => {
        render(<EvidencePackView pack={pack()} />)
        expect(screen.getByText(/Recompute a row hash/)).toBeTruthy()
        expect(screen.getByText(/integrity, not completeness/)).toBeTruthy()
    })
})

describe("the shape a section arrives in", () => {
    it("takes an array as rows, an object as one row, and a bare value as a value", () => {
        expect(sectionRows([{ a: 1 }, { a: 2 }])).toHaveLength(2)
        expect(sectionRows({ a: 1 })).toEqual([{ a: 1 }])
        expect(sectionRows("hello")).toEqual([{ value: "hello" }])
        expect(sectionRows(null)).toEqual([])
    })

    it("keeps column order as first seen, and covers keys a later row adds", () => {
        expect(sectionColumns([{ b: 1 }, { a: 2, b: 3 }])).toEqual(["b", "a"])
    })

    it("prints an object rather than [object Object]", () => {
        expect(cellText({ k: "v" })).toBe('{"k":"v"}')
        expect(cellText(null)).toBe("")
        expect(cellText(0)).toBe("0")
    })

    it("turns an id into a title without losing a word", () => {
        expect(sectionTitle("agent_actions_unresolved")).toBe("Agent actions unresolved")
    })
})
