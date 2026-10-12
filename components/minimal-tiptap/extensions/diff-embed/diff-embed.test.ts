import { describe, expect, it } from "vitest"
import { countChanges, parseUnifiedDiff } from "./diff-embed-view"

/**
 * Line numbering is the part of a diff viewer that is quietly wrong: an added
 * line must not advance the OLD counter and a removed line must not advance the
 * NEW one. Get that wrong and every number below the first change is off by one,
 * which is worse than showing no numbers.
 */

describe("parseUnifiedDiff", () => {
    it("numbers old and new sides independently", () => {
        const rows = parseUnifiedDiff(["@@ -10,3 +10,3 @@", " ctx", "-gone", "+added", " tail"].join("\n"))
        const body = rows.filter((r) => r.kind !== "hunk")

        expect(body.map((r) => [r.kind, r.oldNo, r.newNo])).toEqual([
            ["context", 10, 10],
            ["del", 11, null],
            ["add", null, 11],
            ["context", 12, 12],
        ])
    })

    it("starts from the hunk header rather than line 1", () => {
        const rows = parseUnifiedDiff("@@ -42,1 +99,1 @@\n ctx")
        expect(rows[1].oldNo).toBe(42)
        expect(rows[1].newNo).toBe(99)
    })

    it("treats file headers as metadata, not content", () => {
        const rows = parseUnifiedDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b")
        expect(rows.filter((r) => r.kind === "meta")).toHaveLength(3)
        // "--- a/x" must not be counted as a removed line of code.
        expect(countChanges(rows)).toEqual({ added: 1, removed: 1 })
    })

    it("survives a patch with no hunk header", () => {
        const rows = parseUnifiedDiff("-old\n+new")
        expect(countChanges(rows)).toEqual({ added: 1, removed: 1 })
    })
})
