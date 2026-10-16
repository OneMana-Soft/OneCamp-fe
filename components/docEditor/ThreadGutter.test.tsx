import { describe, expect, it } from "vitest"
import type { ThreadView } from "@/components/threads/types"
import { marksFor } from "./ThreadGutter"

// The margin's markers (B7): one per line that has open threads, counting
// their comments, a dot for news, never two over each other.
const thread = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    anchor: { kind: "yrange", start: "AQ==", end: "Ag==", quote: id },
    status: "open",
    created_by: "u",
    created_at: "2026-10-12T09:00:00Z",
    updated_at: "2026-10-12T09:00:00Z",
    comments: [{ comment_uuid: `${id}-c`, thread_id: id, comment_text: "x", comment_by: { user_uuid: "u", user_name: "U", user_profile_object_key: "" }, comment_created_at: "2026-10-12T09:00:00Z" }],
    participants: [],
    unread: false,
    can_reply: true,
    can_resolve: true,
    ...over,
})

const byId = (...threads: ThreadView[]) => new Map(threads.map((t) => [t.id, t]))

describe("the margin's markers", () => {
    it("are one per line, top to bottom, adding up the line's comments and news", () => {
        const a = thread("a")
        const b = thread("b", { unread: true, comments: [...thread("b").comments, { ...thread("b").comments[0], comment_uuid: "b2" }] })
        const c = thread("c")
        const marks = marksFor(new Map([["c", 300], ["a", 100], ["b", 104]]), byId(a, b, c))
        expect(marks.map((m) => [m.top, m.ids, m.comments, m.unread])).toEqual([
            [100, ["a", "b"], 3, true],
            [300, ["c"], 1, false],
        ])
    })

    it("never sit over each other: a close one moves down below the last", () => {
        const marks = marksFor(new Map([["a", 100], ["b", 120], ["c", 140]]), byId(thread("a"), thread("b"), thread("c")))
        expect(marks.map((m) => m.top)).toEqual([100, 128, 156])
    })

    it("leave out resolved threads, the page's own, and threads not held", () => {
        const marks = marksFor(
            new Map([["done", 10], ["page", 50], ["ghost", 90], ["live", 130]]),
            byId(thread("done", { status: "resolved" }), thread("page", { anchor: { kind: "none" } }), thread("live")),
        )
        expect(marks.map((m) => m.ids)).toEqual([["live"]])
    })
})
