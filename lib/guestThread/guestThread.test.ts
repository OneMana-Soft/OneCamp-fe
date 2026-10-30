import { describe, expect, it } from "vitest"
import type { GuestDocComment } from "@/services/guestService"
import type { GuestThreadComment } from "./guestThread"
import { threadsOf } from "./threadsOf"

describe("a doc's conversation with its guests", () => {
  it("is each guest's comment with the team's replies under it", () => {
    const c = (id: string, parent?: string): GuestThreadComment => ({ id, guest_name: "x", body: "y", created_at: "", author_id: "a", parent_id: parent, from_team: !!parent })
    const got = threadsOf([c("g1"), c("g2"), c("r1", "g1"), c("r2", "g1")])
    expect(got.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ["g1", ["r1", "r2"]],
      ["g2", []],
    ])
  })

  it("groups the guest page's comments the same way, keeping their own shape", () => {
    const c = (id: string, parent?: string): GuestDocComment => ({ id, guest_name: "x", body: "y", created_at: "", parent_id: parent, author_name: parent ? "Sam" : undefined })
    const got = threadsOf([c("c1"), c("c2"), c("r1", "c1")])
    expect(got.flatMap((t) => [t.comment, ...t.replies]).map((x) => [x.id, x.author_name])).toEqual([
      ["c1", undefined],
      ["r1", "Sam"],
      ["c2", undefined],
    ])
  })
})
