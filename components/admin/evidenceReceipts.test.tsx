import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import type { EvidenceReceipt } from "@/services/settingsService"

let receipts: EvidenceReceipt[] = []
vi.mock("@/services/settingsService", async (orig) => {
    const actual = await orig<typeof import("@/services/settingsService")>()
    return { ...actual, listEvidenceReceipts: async () => receipts }
})

const { EvidenceReceipts, receiptSummary, shortFingerprint } = await import("./EvidenceReceipts")
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

describe("what a receipt says about its verification", () => {
    it("names redacted rows rather than folding them into the verified count", () => {
        // "I verified this row" and "I took this row's word for it" are different
        // statements, which is why the server reports them separately.
        expect(receiptSummary({ chain_ok: true, chain_checked: 900, chain_redacted: 12 })).toBe(
            "900 rows verified, 12 taken at their word",
        )
    })

    it("does not report a count as reassurance when the chain failed", () => {
        const s = receiptSummary({ chain_ok: false, chain_checked: 900, chain_redacted: 0 })
        expect(s).toContain("did not verify")
        expect(s).not.toContain("900")
    })

    it("reads as English at one row", () => {
        expect(receiptSummary({ chain_ok: true, chain_checked: 1, chain_redacted: 0 })).toBe("1 row verified")
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
