import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { createRef } from "react"
import { Provider } from "react-redux"
import type { VListHandle } from "virtua"
import type { FlatItem, RowMeta } from "@/types/virtual"
import type { PostsRes } from "@/types/post"

// A conversation redraws only what changed. Each message row re-rendered for
// anything that happened to the list: older messages loading above (every
// row's index moved), a message arriving below (the list's length moved),
// someone starting to type, a scroll, the list's own loading flags. On the
// demo that was 120,000 component renders scrolling through a long channel
// and 350 ms of main thread on every message sent.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/channel/c1" }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  const none = { data: undefined, isLoading: false, mutate: () => {} }
  return { useFetch: () => none, useFetchOnlyOnce: () => me, useMediaFetch: () => none }
})
vi.mock("@/hooks/useMessageResync", () => ({ useMessageResync: () => {} }))

// Rows count their renders by message.
const rowRenders = new Map<string, number>()
const counted = (uuid: string) => rowRenders.set(uuid, (rowRenders.get(uuid) || 0) + 1)
vi.mock("@/components/channel/chanelMessage", () => ({
  ChannelMessage: ({ postInfo }: { postInfo: { post_uuid: string } }) => {
    counted(postInfo.post_uuid)
    return <p>{postInfo.post_uuid}</p>
  },
}))
let listRenders = 0
vi.mock("@/components/channel/channelMessages", async (orig) => {
  const real = await orig<typeof import("@/components/channel/channelMessages")>()
  return {
    ChannelMessages: (props: Parameters<typeof real.ChannelMessages>[0]) => {
      listRenders++
      return <real.ChannelMessages {...props} />
    },
  }
})

const { default: store } = await import("@/store/store")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { addChannelTyping } = await import("@/store/slice/typingSlice")
const { MessageListVirtua } = await import("@/components/message/MessaageListVirtua")
const { ChannelMessages } = await import("@/components/channel/channelMessages")
const { ChannelMessageList } = await import("@/components/channel/channelMessageList")

const at = (i: number) => new Date(Date.UTC(2026, 9, 9, 9, i * 7)).toISOString()
const post = (i: number) =>
  ({
    post_uuid: `p${i}`,
    post_text: `<p>message ${i}</p>`,
    post_by: { user_uuid: i % 2 ? "maya" : "jonas", user_name: i % 2 ? "Maya Chen" : "Jonas Weber" },
    post_created_at: at(i),
    post_comment_count: 0,
  }) as PostsRes

beforeEach(() => {
  rowRenders.clear()
  listRenders = 0
})
afterEach(cleanup)

describe("the message list", () => {
  type Msg = { id: string }
  const items = (ids: number[]): FlatItem<Msg>[] => ids.map((i) => ({ type: "item", key: `m${i}`, data: { id: `m${i}` } }))
  // The items for a list are rebuilt from the store on each change, but each
  // message keeps its object while it does not change.
  const cache = new Map<number, FlatItem<Msg>>()
  const stable = (ids: number[]) => ids.map((i) => cache.get(i) ?? cache.set(i, items([i])[0]).get(i)!)
  const renders = new Map<string, number>()
  const renderItem = (m: Msg, meta: RowMeta) => {
    renders.set(m.id, (renders.get(m.id) || 0) + 1)
    return <p>{`${m.id}${meta.isLast ? " (newest)" : ""}`}</p>
  }
  const list = (ids: number[]) => (
    <MessageListVirtua
      items={stable(ids)}
      renderItem={renderItem}
      getDateHeading={(d) => d}
      fetchOlderMessage={() => {}}
      fetchNewMessage={() => {}}
      hasOldMessage={false}
      hasNewMessage={false}
      clickedScrollToBottom={() => {}}
      ref={createRef<VListHandle>()}
    />
  )
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

  beforeEach(() => {
    renders.clear()
    cache.clear()
  })

  it("draws only the new message and the ones whose place changed when a message arrives", () => {
    const { rerender } = render(list(range(1, 20)))
    renders.clear()
    rerender(list(range(1, 21)))
    // m21 is new; m20 is no longer the newest; m16 leaves the newest five.
    expect([...renders.keys()].sort()).toEqual(["m16", "m20", "m21"])
  })

  it("draws only the older messages when they load above", () => {
    const { rerender } = render(list(range(11, 30)))
    renders.clear()
    rerender(list(range(1, 30)))
    expect([...renders.keys()].sort()).toEqual(range(1, 10).map((i) => `m${i}`).sort())
  })
})

describe("a channel's messages", () => {
  const posts = Array.from({ length: 12 }, (_, i) => post(i + 1))
  const props = {
    posts,
    channelId: "c1",
    getOldMessages: () => {},
    hasMoreOldMsg: false,
    getNewMessages: () => {},
    hasMoreNewMsg: false,
    isNewMsgLoading: false,
    isOLdMsgLoading: false,
    clickedScrollToBottom: () => {},
  }

  it("keeps every row as it was when the list re-renders for something else", () => {
    const { rerender } = render(
      <Provider store={store}>
        <ChannelMessages {...props} />
      </Provider>,
    )
    expect(rowRenders.size).toBe(12)
    rowRenders.clear()
    // Older messages started loading: a flag the rows know nothing about.
    rerender(
      <Provider store={store}>
        <ChannelMessages {...props} isOLdMsgLoading />
      </Provider>,
    )
    expect(rowRenders.size).toBe(0)
  })

  it("redraws nothing when someone starts typing", () => {
    store.dispatch(updateChannelPosts({ channelId: "c1", posts }))
    render(
      <Provider store={store}>
        <ChannelMessageList channelId="c1" />
      </Provider>,
    )
    const before = listRenders
    rowRenders.clear()
    act(() => {
      store.dispatch(addChannelTyping({ channelId: "c1", user: { user_uuid: "maya", user_name: "Maya Chen" } as never }))
    })
    expect(listRenders).toBe(before)
    expect(rowRenders.size).toBe(0)
  })
})
