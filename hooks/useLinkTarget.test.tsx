import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactNode } from "react"

// Link mode (hooks/useLinkTarget): a conversation opened at a message from a
// link. FE-BUG-8: the page around the linked message was shown only in an
// empty list, so a link into a conversation already in memory left the
// message out. FE-BUG-9: Jump to latest kept the link and put the linked page
// back. FE-BUG-12: a split pane read the main view's link as its own.

let address = new URLSearchParams()
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => address,
  useRouter: () => ({ replace }),
  usePathname: () => "/app/channel/c1",
}))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { InSplitPaneContext, useLeaveLink, useLinkSearchParams, useLinkedPage } = await import("@/hooks/useLinkTarget")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { useSearchParams } = await import("next/navigation")

const main = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
const pane = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <InSplitPaneContext.Provider value={true}>{children}</InSplitPaneContext.Provider>
  </Provider>
)

const post = (id: string) => ({ post_uuid: id, post_text: id, post_created_at: "2026-10-13T09:00:00Z" })
const held = () => (store.getState().channel.channelPosts.c1 ?? []).map((p: { post_uuid: string }) => p.post_uuid)

beforeEach(() => {
  store.dispatch({ type: RESET_STORE_ACTION })
  address = new URLSearchParams()
  replace.mockClear()
})
afterEach(cleanup)

describe("the link in the page's address", () => {
  it("is the main view's, and no split pane's", () => {
    address = new URLSearchParams("postId=old")
    expect(renderHook(() => useLinkSearchParams(useSearchParams()), { wrapper: main }).result.current?.get("postId")).toBe("old")
    expect(renderHook(() => useLinkSearchParams(useSearchParams()), { wrapper: pane }).result.current).toBeNull()
  })

  it("is left by dropping it from the address, keeping the rest", () => {
    address = new URLSearchParams("postId=old&tab=files")
    const { result } = renderHook(() => useLeaveLink("postId"), { wrapper: main })
    expect(result.current()).toBe(true)
    expect(replace).toHaveBeenCalledWith("/app/channel/c1?tab=files", { scroll: false })
  })

  it("isn't a pane's to leave, nor there to leave without one", () => {
    address = new URLSearchParams("postId=old")
    expect(renderHook(() => useLeaveLink("postId"), { wrapper: pane }).result.current()).toBe(false)
    address = new URLSearchParams()
    expect(renderHook(() => useLeaveLink("postId"), { wrapper: main }).result.current()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})

describe("the linked page in a list", () => {
  type Props = { target?: string; page?: ReturnType<typeof post>[]; id?: string }
  function setup(initial: Props) {
    const hasNewer = vi.fn()
    const view = renderHook(
      ({ target, page, id = "c1" }: Props) =>
        useLinkedPage("channel", id, target, store.getState().channel.channelPosts[id] ?? [], page, hasNewer),
      { wrapper: main, initialProps: initial },
    )
    return { ...view, hasNewer }
  }

  it("is shown when the list holds messages but not the linked one", () => {
    store.dispatch(updateChannelPosts({ channelId: "c1", posts: [post("l1"), post("l2")] } as never))
    const { hasNewer } = setup({ target: "old", page: [post("old"), post("old2")] })
    expect(held()).toEqual(["old", "old2"])
    expect(hasNewer).toHaveBeenCalledWith(true)
  })

  it("is not shown when the list already holds the linked message", () => {
    store.dispatch(updateChannelPosts({ channelId: "c1", posts: [post("old"), post("l1")] } as never))
    setup({ target: "old", page: [post("old"), post("old2")] })
    expect(held()).toEqual(["old", "l1"])
  })

  it("is not shown, nor asked for again and again, when it lacks the linked message", () => {
    store.dispatch(updateChannelPosts({ channelId: "c1", posts: [post("l1")] } as never))
    const page = [post("other")]
    const { rerender } = setup({ target: "gone", page })
    rerender({ target: "gone", page })
    expect(held()).toEqual(["l1"])
  })

  it("is let go when the link is left, and the list goes to the end of the latest page", () => {
    store.dispatch(updateChannelPosts({ channelId: "c1", posts: [post("l1")] } as never))
    const page = [post("old"), post("old2")]
    const { rerender, hasNewer } = setup({ target: "old", page })
    expect(held()).toEqual(["old", "old2"])
    rerender({ target: undefined, page: undefined })
    expect(held()).toEqual([])
    expect(hasNewer).toHaveBeenLastCalledWith(false)
    // The list's own seeding puts the latest page in; then its end is shown.
    act(() => void store.dispatch(updateChannelPosts({ channelId: "c1", posts: [post("l1"), post("l2")] } as never)))
    rerender({ target: undefined, page: undefined })
    expect(store.getState().channel.channelScrollToBottom.c1?.shouldScrollToBottom).toBe(true)
  })

  it("never empties another conversation's list", () => {
    store.dispatch(updateChannelPosts({ channelId: "c2", posts: [post("x")] } as never))
    const { rerender } = setup({ target: "old", page: undefined })
    rerender({ id: "c2", target: undefined, page: undefined })
    expect(store.getState().channel.channelPosts.c2.map((p: { post_uuid: string }) => p.post_uuid)).toEqual(["x"])
  })
})
