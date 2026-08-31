import { describe, expect, it } from "vitest"

import { sanitizeRichHtml } from "./sanitizeHtml"

/**
 * AI-generated content carries a machine-readable marker, and the sanitizer is
 * the one place that can silently remove it.
 *
 * The AI Act's transparency obligations require generated content to be marked
 * so artificial generation is detectable. The backend wraps every machine
 * written body in `data-ai-generated="true"`, and if sanitisation strips that on
 * the way to the screen the marking exists only in the documentation.
 *
 * The second half matters as much: the attribute is provenance, not permission,
 * so allowing it must not have widened what else gets through.
 */
describe("the AI-generated marker", () => {
    it("survives sanitisation", () => {
        const out = sanitizeRichHtml(`<div data-ai-generated="true"><p>A recap.</p></div>`)
        expect(out).toContain(`data-ai-generated="true"`)
        expect(out).toContain("A recap.")
    })

    it("did not open the door to anything else", () => {
        const out = sanitizeRichHtml(
            `<div data-ai-generated="true" onclick="steal()" style="position:fixed"><script>bad()</script><p>text</p></div>`,
        )
        expect(out).toContain(`data-ai-generated="true"`)
        for (const forbidden of ["onclick", "<script", "style="]) {
            expect(out, `${forbidden} survived`).not.toContain(forbidden)
        }
    })
})
