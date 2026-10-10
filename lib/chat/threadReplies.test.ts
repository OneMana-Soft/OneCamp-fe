import { describe, expect, it } from "vitest"
import { reconcileReplies } from "./threadReplies"
import type { CommentInfoInterface } from "@/types/comment"

const by = { user_uuid: "u1", user_name: "Maya Chen", user_profile_object_key: "" }
const reply = (id: string, at: string, text = id): CommentInfoInterface => ({
    comment_uuid: id,
    comment_text: text,
    comment_created_at: at,
    comment_by: by,
})

const a = reply("a", "2026-10-10T09:00:00Z")
const b = reply("b", "2026-10-10T09:01:00Z")
const c = reply("c", "2026-10-10T09:02:00Z")

describe("a thread's replies when the server answers", () => {
    it("take the answer into an empty thread, oldest first", () => {
        expect(reconcileReplies([], [b, a]).map((r) => r.comment_uuid)).toEqual(["a", "b"])
    })

    it("keep a reply sent after the request began", () => {
        const askedAt = Date.parse("2026-10-10T09:01:30Z")
        expect(reconcileReplies([a, b, c], [a, b], askedAt).map((r) => r.comment_uuid)).toEqual(["a", "b", "c"])
    })

    it("drop a reply the answer no longer has, from before the request", () => {
        const askedAt = Date.parse("2026-10-10T09:05:00Z")
        expect(reconcileReplies([a, b, c], [a, c], askedAt).map((r) => r.comment_uuid)).toEqual(["a", "c"])
    })

    it("show an edit made elsewhere", () => {
        const edited = { ...b, comment_text: "b, edited", comment_updated_at: "2026-10-10T09:03:00Z" }
        expect(reconcileReplies([a, b], [a, edited])[1].comment_text).toBe("b, edited")
    })

    it("hand back the same array when the answer only confirms it", () => {
        const stored = [a, b]
        expect(reconcileReplies(stored, [{ ...a }, { ...b }])).toBe(stored)
    })
})
