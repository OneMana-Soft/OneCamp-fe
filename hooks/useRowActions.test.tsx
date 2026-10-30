import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactNode } from "react"
import type { ConversationRef } from "@/lib/conversation/types"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A reaction from a conversation's rows, in a channel, a DM and a group alike
// (chat A1 step 2b; each list had its own copy): shown at once, given the
// server's id, put back when the server refuses, and taken back on the server
// when it was removed while still being added. The store and its reducers are
// the app's; the server is a stand-in.

type Request = { apiEndpoint: string; payload: Record<string, string> }
let answer: (r: Request) => Promise<unknown> = async () => ({})
const makeRequest = vi.fn((r: Request) => answer(r))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const ME = { user_uuid: "u-me", user_name: "Sam Rivera" }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: ME } }) }))

const { default: store } = await import("@/store/store")
const { useRowActions } = await import("@/hooks/useRowActions")
const { heldRows, holdRows } = await import("@/store/conversations")
const { adapterOf } = await import("@/lib/conversation/adapters")

const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
const at = "2026-10-22T09:00:00Z"
const kinds: Array<[string, ConversationRef, (id: string) => object]> = [
  ["a channel", { kind: "channel", id: "c-react" }, (id) => ({ post_uuid: id, post_text: "<p>hi</p>", post_by: { user_uuid: "maya" }, post_created_at: at, post_comment_count: 0 })],
  ["a DM", { kind: "dm", id: "u-me u-maya", other: "u-maya" }, (id) => ({ chat_uuid: id, chat_body_text: "<p>hi</p>", chat_from: { user_uuid: "maya" }, chat_created_at: at, chat_comment_count: 0 })],
  ["a group", { kind: "group", id: "g-react" }, (id) => ({ chat_uuid: id, chat_body_text: "<p>hi</p>", chat_from: { user_uuid: "maya" }, chat_created_at: at, chat_comment_count: 0 })],
]
/** The reactions the store holds on a message, as "emoji:id". */
const reactions = (ref: ConversationRef, id: string) => {
  const adapter = adapterOf(ref)
  const row = (heldRows(store.getState(), ref) as unknown[]).find((r) => adapter.cursorOf(r as never).id === id)
  return (adapter.toMessage(row as never).reactions ?? []).map((r) => `${r.reaction_emoji_id}:${r.uid}`)
}

afterEach(() => {
  makeRequest.mockClear()
  toast.mockClear()
  answer = async () => ({})
})

describe.each(kinds)("a reaction in %s", (_, ref, row) => {
  const setUp = (id: string) => {
    store.dispatch(holdRows(ref, [row(id)]))
    return renderHook(() => useRowActions(ref), { wrapper }).result.current
  }

  it("shows at once, then carries the id the server made", async () => {
    let settle: (v: unknown) => void = () => {}
    answer = () => new Promise((resolve) => (settle = resolve))
    const on = setUp("m-add")
    act(() => on.react("m-add", "party", ""))
    expect(reactions(ref, "m-add")).toEqual([expect.stringMatching(/^party:temp-/)])
    await act(async () => settle({ reaction_dgraph_id: "r-made" }))
    expect(reactions(ref, "m-add")).toEqual(["party:r-made"])
    expect(makeRequest.mock.calls[0][0].payload).toMatchObject({ reaction_emoji_id: "party", reaction_dgraph_id: "" })
  })

  it("goes back, with a toast, when the server answers without its id", async () => {
    const on = setUp("m-noid")
    act(() => on.react("m-noid", "party", ""))
    await waitFor(() => expect(reactions(ref, "m-noid")).toEqual([]))
    expect(toast).toHaveBeenCalled()
  })

  it("is added once per person and emoji", () => {
    const on = setUp("m-once")
    answer = () => new Promise(() => {})
    act(() => on.react("m-once", "party", ""))
    act(() => on.react("m-once", "party", ""))
    expect(makeRequest).toHaveBeenCalledTimes(1)
  })

  it("taken back while still being added, is taken back on the server once it has its id", async () => {
    let settle: (v: unknown) => void = () => {}
    answer = (r) => (r.payload.reaction_emoji_id ? new Promise((resolve) => (settle = resolve)) : Promise.resolve({}))
    const on = setUp("m-race")
    act(() => on.react("m-race", "party", ""))
    const temp = reactions(ref, "m-race")[0].split(":")[1]
    act(() => on.unreact("m-race", temp))
    expect(reactions(ref, "m-race")).toEqual([])
    await act(async () => settle({ reaction_dgraph_id: "r-late" }))
    await waitFor(() => expect(makeRequest.mock.calls.map(([r]) => r.payload.reaction_dgraph_id)).toContain("r-late"))
    expect(reactions(ref, "m-race")).toEqual([])
  })

  it("whose removal the server refused comes back", async () => {
    answer = async () => ({ reaction_dgraph_id: "r-kept" })
    const on = setUp("m-keep")
    await act(async () => on.react("m-keep", "party", ""))
    answer = async () => Promise.reject(new Error("403"))
    await act(async () => on.unreact("m-keep", "r-kept"))
    expect(reactions(ref, "m-keep")).toEqual(["party:r-kept"])
  })

  it("changed to another emoji, goes back to the first when the server refuses", async () => {
    answer = async () => ({ reaction_dgraph_id: "r-swap" })
    const on = setUp("m-swap")
    await act(async () => on.react("m-swap", "party", ""))
    answer = async () => Promise.reject(new Error("500"))
    await act(async () => on.react("m-swap", "heart", "r-swap"))
    expect(reactions(ref, "m-swap")).toEqual(["party:r-swap"])
  })
})
