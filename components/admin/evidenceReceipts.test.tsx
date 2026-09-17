import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import type { EvidenceReceipt } from "@/services/settingsService"

let receipts: EvidenceReceipt[] = []
vi.mock("@/services/settingsService", async (orig) => {
    const actual = await orig<typeof import("@/services/settingsService")>()
    return { ...actual, listEvidenceReceipts: async () => receipts }
})

const { EvidenceReceipts, receiptRows, receiptSummary, shortFingerprint } = await import("./EvidenceReceipts")
const { evidencePageHref, receiptLabel } = await import("@/services/settingsService")

const receipt = (over: Partial<EvidenceReceipt> = {}): EvidenceReceipt => ({
    id: "r1",
    period_start: "2026-08-01T00:00:00Z",
    period_end: "2026-09-01T00:00:00Z",
    generated_at: "2026-09-01T00:05:00Z",
    pack_fingerprint: "abcdef0123456789".repeat(4),
    manifest: [],
    chain_ok: true,
    chain_checked: 1204,
    chain_redacted: 0,
    ...over,
})

afterEach(() => {
    cleanup()
    receipts = []
})

describe("the months already fingerprinted", () => {
    it("says nothing at all when there are none", async () => {
        // A new workspace has no completed month. "No receipts" would read as
        // something failing rather than as a month that has not finished.
        const { container } = render(<EvidenceReceipts />)
        await waitFor(() => expect(container.textContent).toBe(""))
    })

    it("links each month to the document for exactly its window", async () => {
        receipts = [receipt()]
        render(<EvidenceReceipts />)
        const link = await screen.findByRole("link")
        // Two different windows would produce two different fingerprints and one
        // confused reader, so the href carries the receipt's own bounds.
        expect(link.getAttribute("href")).toContain("from=2026-08-01T00%3A00%3A00Z")
        expect(link.getAttribute("href")).toContain("to=2026-09-01T00%3A00%3A00Z")
    })

    it("shows a month a person recognises and a digest they can compare", async () => {
        receipts = [receipt()]
        render(<EvidenceReceipts />)
        expect(await screen.findByText("August 2026")).toBeTruthy()
        expect(screen.getByText("abcdef01")).toBeTruthy()
    })
})

describe("what a receipt says about its window", () => {
    const manifest = (rows: number[]) =>
        rows.map((n, i) => ({ section: `s${i}`, rows: n, sha256: "x", describes: "" }))

    it("counts the window from the manifest, not from the chain verification", () => {
        // The chain count walks the WHOLE log, so it is the same number on every
        // month's receipt. Showing it per month reads as "August had 17 rows"
        // when it means "the log has 17 rows and they verify".
        const r = { chain_ok: true, chain_checked: 17, chain_redacted: 0, manifest: manifest([40, 2]) }
        expect(receiptRows(r)).toBe(42)
        expect(receiptSummary(r)).toContain("42 rows")
        expect(receiptSummary(r)).not.toContain("17")
    })

    it("totals a section it has never heard of", () => {
        expect(receiptRows({ manifest: manifest([1, 2, 3, 4]) })).toBe(10)
    })

    it("leaves out a section describing the deployment rather than the window", () => {
        // retention_policy contributes one row to every window forever. Counting
        // it made nine consecutive empty months read as months with something in
        // them, each anchored with an identical fingerprint.
        const withPolicy = [
            { section: "audit_log", rows: 0, sha256: "x", describes: "" },
            { section: "retention_policy", rows: 1, sha256: "y", describes: "", contextual: true },
        ]
        expect(receiptRows({ manifest: withPolicy })).toBe(0)
    })

    it("names redacted rows rather than folding them into the verdict", () => {
        const s = receiptSummary({ chain_ok: true, chain_checked: 900, chain_redacted: 12, manifest: manifest([900]) })
        expect(s).toContain("12 taken at their word")
    })

    it("says the chain failed rather than leading with a reassuring count", () => {
        const s = receiptSummary({ chain_ok: false, chain_checked: 900, chain_redacted: 0, manifest: manifest([900]) })
        expect(s).toContain("did not verify")
    })

    it("reads as English at one row", () => {
        const s = receiptSummary({ chain_ok: true, chain_checked: 1, chain_redacted: 0, manifest: manifest([1]) })
        expect(s).toBe("1 row, log verified")
    })
})

describe("the small helpers", () => {
    it("shortens a digest to what an eye compares", () => {
        expect(shortFingerprint("abcdef0123456789")).toBe("abcdef01")
        expect(shortFingerprint("")).toBe("")
    })

    it("labels a window in UTC, so two readers in two timezones see one month", () => {
        // Built from period_start, which is midnight UTC on the first. Rendered
        // in local time it would show July for a reader west of Greenwich.
        expect(receiptLabel({ period_start: "2026-08-01T00:00:00Z" })).toBe("August 2026")
    })

    it("falls back to the raw value rather than rendering Invalid Date", () => {
        expect(receiptLabel({ period_start: "not a date" })).toBe("not a date")
    })

    it("builds an href with both bounds", () => {
        const href = evidencePageHref({ period_start: "2026-08-01T00:00:00Z", period_end: "2026-09-01T00:00:00Z" })
        expect(href.startsWith("/app/admin/evidence?")).toBe(true)
        expect(href).toContain("from=")
        expect(href).toContain("to=")
    })
})
