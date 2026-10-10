import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ChatInfo } from "@/types/chat"

let receipts: unknown = undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url ? receipts : undefined, mutate: vi.fn(), isLoading: false }),
  useFetchOnlyOnce: (url: string) => ({
    data: url === "/user/profile" ? { data: { user_uuid: "me" } } : url ? { data: { dm_participants: [{ user_uuid: "me" }, { user_uuid: "maya", user_full_name: "Maya Chen" }, { user_uuid: "jonas", user_full_name: "Jonas Weber" }, { user_uuid: "bot", is_bot: true }] } } : undefined,
  }),
}))
let typing: Record<string, unknown[]> = {}
vi.mock("react-redux", () => ({
  useSelector: (pick: (state: unknown) => unknown) => pick({ typing: { chatTyping: typing, groupChatTyping: {} } }),
}))
const post = vi.fn(async (url: string) => ({ url }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (url: string) => post(url) }, OWN_ERRORS: {} }))

const { SeenReceiptLine } = await import("@/components/chat/SeenReceiptLine")

const msg = (from: string, at: string): ChatInfo => ({ chat_uuid: "c-" + at, chat_from: { user_uuid: from }, chat_created_at: at } as unknown as ChatInfo)

afterEach(() => {
  cleanup()
  typing = {}
  post.mockClear()
  vi.useRealTimers()
})

describe("Seen under your latest message", () => {
  it("says Seen in a DM, and gives way to someone typing", () => {
    receipts = { data: { on: true, seen: [{ user_uuid: "maya", seen_at: "2026-10-08T09:05:00Z" }] } }
    const target = { kind: "dm" as const, otherUUID: "maya" }
    const { rerender } = render(<SeenReceiptLine target={target} latest={msg("me", "2026-10-08T09:00:00Z")} />)
    expect(screen.getByText("Seen")).toBeTruthy()
    typing = { maya: [{ userId: "maya" }] }
    rerender(<SeenReceiptLine target={target} latest={msg("me", "2026-10-08T09:00:01Z")} />)
    expect(screen.queryByText("Seen")).toBeNull()
    typing = {}
    rerender(<SeenReceiptLine target={target} latest={msg("maya", "2026-10-08T09:06:00Z")} />)
    expect(screen.queryByText(/Seen/)).toBeNull()
  })

  // Under the message's words (the text column, 64px in), not at the row's
  // right edge a screen's width away.
  it("sits under the message's words, at the text column", () => {
    receipts = { data: { on: true, seen: [{ user_uuid: "maya", seen_at: "2026-10-08T09:05:00Z" }] } }
    render(<SeenReceiptLine target={{ kind: "dm", otherUUID: "maya" }} latest={msg("me", "2026-10-08T09:00:00Z")} />)
    const line = screen.getByText("Seen").closest("p")!
    expect(line.className).toContain("pl-16")
    expect(line.className).not.toContain("justify-end")
  })

  it("names who in a group, leaving out the agent", () => {
    receipts = { data: { on: true, seen: [{ user_uuid: "jonas", seen_at: "2026-10-08T09:05:00Z" }, { user_uuid: "maya", seen_at: "2026-10-08T09:02:00Z" }] } }
    render(<SeenReceiptLine target={{ kind: "group", grpId: "g1" }} latest={msg("me", "2026-10-08T09:00:00Z")} />)
    expect(screen.getByText("Seen by everyone")).toBeTruthy()
  })

  it("marks the conversation seen when it opens and when someone else's message arrives, not for your own", async () => {
    vi.useFakeTimers()
    receipts = { data: { on: true, seen: [] } }
    const target = { kind: "group" as const, grpId: "g1" }
    let { rerender } = render(<SeenReceiptLine target={target} latest={msg("maya", "2026-10-08T09:00:00Z")} />)
    await act(async () => void vi.advanceTimersByTime(700))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe("/groupChat/seen/g1")
    rerender(<SeenReceiptLine target={target} latest={msg("me", "2026-10-08T09:01:00Z")} />)
    await act(async () => void vi.advanceTimersByTime(700))
    expect(post).toHaveBeenCalledTimes(1)
    // A row that opens on your own message doesn't mark either.
    cleanup()
    render(<SeenReceiptLine target={target} latest={msg("me", "2026-10-08T09:01:30Z")} />)
    await act(async () => void vi.advanceTimersByTime(700))
    expect(post).toHaveBeenCalledTimes(1)
    cleanup()
    rerender = render(<SeenReceiptLine target={target} latest={msg("me", "2026-10-08T09:01:30Z")} />).rerender
    rerender(<SeenReceiptLine target={target} latest={msg("jonas", "2026-10-08T09:02:00Z")} />)
    await act(async () => void vi.advanceTimersByTime(700))
    expect(post).toHaveBeenCalledTimes(2)
  })
})
