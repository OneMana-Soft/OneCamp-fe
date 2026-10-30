import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
const applied: unknown[] = []
vi.mock("@/lib/conversation/readMoved", () => ({ applyReadMoved: (_d: unknown, m: unknown) => void applied.push(m) }))

const { markUnreadFrom } = await import("./readPosition")
const { isHeldUnread, releaseUnread } = await import("./unreadHold")

afterEach(() => {
  post.mockReset()
  applied.length = 0
  releaseUnread("c1")
})

// Mark unread from a message (chat B27): the server's answer moves the badge
// and the line at once, and the conversation stays unread while it's open.
describe("Mark unread", () => {
  it("asks the server from that message, applies where you now are and holds the conversation unread", async () => {
    post.mockResolvedValue({ data: { data: { unread: 2, first_unread: "p2" } } })
    expect(await markUnreadFrom(vi.fn(), "channel", "c1", "p2")).toBe(true)
    expect(post).toHaveBeenCalledWith("/conversations/channel/c1/unread", { from: "p2" }, OWN_ERRORS)
    expect(applied).toEqual([{ kind: "channel", id: "c1", unread: 2, first_unread: "p2" }])
    expect(isHeldUnread("c1")).toBe(true)
  })

  it("lets go when the server says no, and moves nothing", async () => {
    post.mockRejectedValue(new Error("404"))
    expect(await markUnreadFrom(vi.fn(), "channel", "c1", "p2")).toBe(false)
    expect(applied).toEqual([])
    expect(isHeldUnread("c1")).toBe(false)
  })
})
