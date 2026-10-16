import { describe, expect, it } from "vitest"
import type { ThreadView } from "@/components/threads/types"
import type { ResolvedAnchor } from "@/lib/anchors/types"
import { foldComments, lostLabel, orderThreads, peopleIn, quoteLine, quotesWords, threadLabel, wroteIn } from "./threadView"

const person = (id: string, name: string) => ({ user_uuid: id, user_name: name, user_profile_object_key: "" })
const SAM = person("u-sam", "Sam Rivera")
const MAYA = person("u-maya", "Maya Chen")

const thread = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: `words of ${id}` },
    status: "open",
    created_by: SAM.user_uuid,
    created_at: "2026-10-12T09:00:00Z",
    updated_at: "2026-10-12T09:00:00Z",
    comments: [{ comment_uuid: `${id}-c`, thread_id: id, comment_text: "<p>x</p>", comment_by: SAM, comment_created_at: "2026-10-12T09:00:00Z" }],
    participants: [],
    unread: false,
    can_reply: true,
    can_resolve: true,
    ...over,
})

describe("a doc's threads, in order", () => {
    const at = (from: number): ResolvedAnchor => ({ state: "attached", from, to: from + 3 })
    const lost: ResolvedAnchor = { state: "detached", reason: "deleted", quote: "x" }

    it("Open: the page's own first, oldest first; then the doc's order; then those whose words changed, newest first", () => {
        const page1 = thread("page-early", { anchor: { kind: "none" }, created_at: "2026-10-12T08:00:00Z" })
        const page2 = thread("page-late", { anchor: { kind: "none" }, created_at: "2026-10-12T10:00:00Z" })
        const legacy = thread("legacy", { legacy: true, anchor: { kind: "none" }, created_at: "2026-10-12T09:30:00Z" })
        const low = thread("low", { created_at: "2026-10-12T07:00:00Z" })
        const high = thread("high", { created_at: "2026-10-12T11:00:00Z" })
        const goneOld = thread("gone-old", { created_at: "2026-10-12T06:00:00Z" })
        const goneNew = thread("gone-new", { created_at: "2026-10-12T12:00:00Z" })
        const where = new Map([["low", at(90)], ["high", at(5)], ["gone-old", lost], ["gone-new", lost]])
        expect(orderThreads([low, goneOld, page2, high, legacy, goneNew, page1], "open", where).map((t) => t.id)).toEqual([
            "page-early",
            "legacy",
            "page-late",
            "high",
            "low",
            "gone-new",
            "gone-old",
        ])
    })

    it("Open, with no doc beside it (a phone): the page's first, then as they were started", () => {
        const a = thread("a", { created_at: "2026-10-12T09:00:00Z" })
        const b = thread("b", { created_at: "2026-10-12T08:00:00Z" })
        const page = thread("page", { anchor: { kind: "none" } })
        expect(orderThreads([a, b, page], "open").map((t) => t.id)).toEqual(["page", "b", "a"])
    })

    it("Resolved: the latest resolved first", () => {
        const a = thread("a", { status: "resolved", resolved_at: "2026-10-12T10:00:00Z" })
        const b = thread("b", { status: "resolved", resolved_at: "2026-10-12T11:00:00Z" })
        expect(orderThreads([a, b], "resolved").map((t) => t.id)).toEqual(["b", "a"])
    })
})

describe("the person filter", () => {
    it("names each person who wrote, once, the viewer first, then by name", () => {
        const zed = person("u-zed", "Zed Park")
        const t1 = thread("t1", { comments: [...thread("t1").comments, { ...thread("t1").comments[0], comment_uuid: "r", comment_by: zed }] })
        const t2 = thread("t2", { comments: [{ ...thread("t2").comments[0], comment_by: MAYA }] })
        expect(peopleIn([t1, t2], SAM.user_uuid).map((p) => p.user_uuid)).toEqual(["u-sam", "u-maya", "u-zed"])
        expect(wroteIn(t2, MAYA.user_uuid)).toBe(true)
        expect(wroteIn(t2, SAM.user_uuid)).toBe(false)
    })
})

describe("a long thread", () => {
    it("folds to its first comment and its latest two, saying how many are between", () => {
        expect(foldComments([1, 2, 3, 4], false)).toEqual({ shown: [1, 2, 3, 4], hidden: 0, at: 4 })
        expect(foldComments([1, 2, 3, 4, 5, 6], false)).toEqual({ shown: [1, 5, 6], hidden: 3, at: 1 })
        expect(foldComments([1, 2, 3, 4, 5, 6], true).hidden).toBe(0)
    })
})

describe("a thread in words", () => {
    it("is one line, cut where long", () => {
        expect(quoteLine("  ship\n on   Thursday ")).toBe("ship on Thursday")
        expect(quoteLine("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`)
    })

    it("names what it is on, how many comments, and whether there is news", () => {
        expect(threadLabel(thread("t1", { unread: true }))).toBe("Comment on “words of t1”, 1 comment, unread")
        expect(threadLabel(thread("t2", { anchor: { kind: "none" }, status: "resolved" }))).toBe("Comment on the page, 1 comment, resolved")
    })
})

describe("a thread that lost its place", () => {
    it("says whether its words changed or its blocks went", () => {
        expect(lostLabel({ kind: "yrange", quote: "x" })).toBe("Original text was changed")
        expect(lostLabel({ kind: "block", block_id: "b", quote: "x" })).toBe("The block was removed")
        expect(lostLabel({ kind: "block", block_id: "a", quote: "x", meta: { block_ids: ["a", "c"] } })).toBe("Those blocks were removed")
    })

    it("is offered its words again, never a block's kind", () => {
        expect(quotesWords({ kind: "yrange", quote: "ship it" })).toBe(true)
        expect(quotesWords({ kind: "block", block_id: "b", quote: "Plan" })).toBe(true)
        expect(quotesWords({ kind: "block", block_id: "pic", quote: "Image", meta: { named: true } })).toBe(false)
        expect(quotesWords({ kind: "yrange" })).toBe(false)
    })
})
